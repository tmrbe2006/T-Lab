import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { seedDatabase } from '../../db/seed';
import { erpAccountingService } from '../../services/erp-accounting.service';
import { inventoryService } from '../../services/inventory.service';

describe('ERP Inventory & IFRS Accounting Integration Suite', () => {
  beforeEach(async () => {
    await seedDatabase(true);
  });

  it('seeds 50 inventory items, 100 lots, 200 movements, 10 suppliers, and 20 BOMs', async () => {
    const [itemsCount, lotsCount, movsCount, supsCount, bomsCount] = await Promise.all([
      db.inventoryItems.count(),
      db.inventoryLots.count(),
      db.stockMovements.count(),
      db.suppliers.count(),
      db.testBOMs.count(),
    ]);

    expect(itemsCount).toBe(50);
    expect(lotsCount).toBe(100);
    expect(movsCount).toBe(200);
    expect(supsCount).toBe(10);
    expect(bomsCount).toBe(20);
  });

  it('evaluates lot expiry status with color-coded alerts and effective expiry after opening', async () => {
    const expiredEval = inventoryService.evaluateLotExpiry(
      { expiryDate: '2026-10-15', status: 'expired' },
      '2026-11-10'
    );
    expect(expiredEval.status).toBe('expired');
    expect(expiredEval.icon).toBe('🔴');

    const crit30Eval = inventoryService.evaluateLotExpiry(
      { expiryDate: '2026-11-25', status: 'active' },
      '2026-11-10'
    );
    expect(crit30Eval.status).toBe('critical_30');
    expect(crit30Eval.icon).toBe('🟠');

    const warn90Eval = inventoryService.evaluateLotExpiry(
      { expiryDate: '2027-01-15', status: 'active' },
      '2026-11-10'
    );
    expect(warn90Eval.status).toBe('warning_90');
    expect(warn90Eval.icon).toBe('🟡');

    const validEval = inventoryService.evaluateLotExpiry(
      { expiryDate: '2027-06-15', status: 'active' },
      '2026-11-10'
    );
    expect(validEval.status).toBe('valid');
    expect(validEval.icon).toBe('🟢');

    const openedLot = await inventoryService.openLotForUse('lot_1', '2026-11-10');
    expect(openedLot.openedDate).toBe('2026-11-10');
    expect(openedLot.effectiveExpiryDate).toBe('2027-01-09');
  });

  it('Scenario 1: receives purchase invoice stock, creates lots & movements, and posts balanced journal entry', async () => {
    // pinv_10 is seeded with stockReceived = false
    const result = await inventoryService.receivePurchaseInvoiceStock(
      'pinv_10',
      'accountant',
      '2026-11-10'
    );

    expect(result.lotsCreated.length).toBe(2);
    expect(result.movementsCreated.length).toBe(2);
    expect(result.journalEntry.totalDebit).toBe(result.journalEntry.totalCredit);

    const updatedPinv = await db.purchaseInvoices.get('pinv_10');
    expect(updatedPinv?.stockReceived).toBe(true);
  });

  it('Scenario 2: issues materials for a test via BOM using FEFO, blocking expired lots and posting COGS journal entry', async () => {
    // tst_2 (FBS) uses CHM-002 which has 1 expired lot (lot_5) and 1 valid lot (lot_6)
    const res = await inventoryService.issueMaterialsForTestBOM(
      'tst_2',
      'req_1',
      'chemist',
      false,
      '2026-11-10'
    );

    expect(res.movements.length).toBeGreaterThanOrEqual(5);
    expect(res.totalCOGS).toBeGreaterThan(0);
    expect(res.journalEntry.totalDebit).toBe(res.totalCOGS);
    expect(res.journalEntry.totalCredit).toBe(res.totalCOGS);

    // Ensure the expired lot (lot_5) was NOT used and the valid lot (lot_6) was used
    const usedLotIds = res.movements.map((m) => m.lotId);
    expect(usedLotIds).not.toContain('lot_5');
    expect(usedLotIds).toContain('lot_6');
  });

  it('Scenario 3: disposes of an expired lot and records write-off accounting entry', async () => {
    const lotBefore = await db.inventoryLots.get('lot_5');
    expect(lotBefore).toBeDefined();

    const res = await inventoryService.disposeExpiredOrDamagedLot(
      'lot_5',
      50,
      'إتلاف كاشف جلوكوز منتهي الصلاحية',
      'owner',
      '2026-11-10'
    );

    expect(res.movement.type).toBe('disposal');
    expect(res.journalEntry.totalDebit).toBe(res.journalEntry.totalCredit);
    expect(res.journalEntry.lines[0].accountCode).toBe('5.1.4');
  });

  it('Scenario 4: approves stock taking session and posts variance adjustments', async () => {
    await inventoryService.approveStockTakingSession('st_2', 'owner', '2026-11-10');
    const updatedSession = await db.stockTakingSessions.get('st_2');
    expect(updatedSession?.status).toBe('approved');
  });

  it('Scenario 5: validates double-entry journals, reversals, period locks, Trial Balance, and Financial Statements', async () => {
    // Reject unbalanced journal entry
    const unbalancedCheck = erpAccountingService.validateDoubleEntry([
      { accountCode: '1101', accountNameAr: 'الصندوق', accountNameEn: 'Cash', debit: 500, credit: 0 },
      { accountCode: '4101', accountNameAr: 'إيرادات', accountNameEn: 'Revenue', debit: 0, credit: 450 },
    ]);
    expect(unbalancedCheck.valid).toBe(false);
    expect(unbalancedCheck.difference).toBe(50);

    // Reject posting in locked period (2026-09 is locked)
    await expect(
      erpAccountingService.createJournalEntry({
        date: '2026-09-15',
        entryType: 'manual',
        descriptionAr: 'قيد في فترة مقفلة',
        descriptionEn: 'Locked period entry',
        createdBy: 'accountant',
        lines: [
          { accountCode: '1101', accountNameAr: 'الصندوق', accountNameEn: 'Cash', debit: 100, credit: 0 },
          { accountCode: '4101', accountNameAr: 'إيرادات', accountNameEn: 'Revenue', debit: 0, credit: 100 },
        ],
      })
    ).rejects.toThrow();

    // Create valid entry in open period and reverse it
    const created = await erpAccountingService.createJournalEntry({
      date: '2026-11-10',
      entryType: 'manual',
      costCenter: 'CC-HEM',
      descriptionAr: 'قيد تسوية عهدة',
      descriptionEn: 'Petty cash adjustment',
      createdBy: 'accountant',
      lines: [
        { accountCode: '5107', accountNameAr: 'مصروفات إدارية', accountNameEn: 'Admin Expense', debit: 300, credit: 0 },
        { accountCode: '1101', accountNameAr: 'الصندوق النقدي', accountNameEn: 'Cashbox', debit: 0, credit: 300 },
      ],
    });
    expect(created.totalDebit).toBe(300);

    const reversal = await erpAccountingService.reverseJournalEntry(
      created.id,
      'accountant',
      '2026-11-10'
    );
    expect(reversal.entryType).toBe('reversal');
    expect(reversal.totalDebit).toBe(300);

    // Prevent deleting account with movements or children
    const delGroupCheck = await erpAccountingService.canDeleteAccount('1');
    expect(delGroupCheck.allowed).toBe(false);
    const delActiveCheck = await erpAccountingService.canDeleteAccount('1101');
    expect(delActiveCheck.allowed).toBe(false);

    // Trial Balance & Financial Statements must be strictly balanced
    const tb = await erpAccountingService.generateTrialBalance();
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebitMovement).toBe(tb.totalCreditMovement);

    const stmts = await erpAccountingService.generateFinancialStatements();
    expect(stmts.balanceSheet.isBalanced).toBe(true);
    expect(stmts.balanceSheet.totalAssets).toBe(stmts.balanceSheet.totalLiabilitiesAndEquity);

    const aging = await erpAccountingService.generateAgingReports('2026-11-10');
    expect(aging.receivablesAging.length).toBeGreaterThan(0);
    expect(aging.payablesAging.length).toBeGreaterThan(0);

    const traceReq = await erpAccountingService.traceDocumentChain('REQ-2026-1001');
    expect(traceReq.steps.length).toBeGreaterThanOrEqual(4);

    const tracePinv = await erpAccountingService.traceDocumentChain('PINV-2026-401');
    expect(tracePinv.steps.length).toBeGreaterThanOrEqual(2);
  });
});
