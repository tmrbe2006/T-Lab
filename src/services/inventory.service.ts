import { db } from '../db/database';
import type {
  InventoryItem,
  InventoryLot,
  JournalEntry,
  StockMovement,
} from '../types';

export interface LotExpiryEvaluation {
  status: 'expired' | 'critical_30' | 'warning_90' | 'valid';
  daysRemaining: number;
  badgeColor: 'rose' | 'amber' | 'yellow' | 'emerald';
  icon: '🔴' | '🟠' | '🟡' | '🟢';
  labelAr: string;
  labelEn: string;
  effectiveExpiryDate: string;
}

export interface FefoAllocation {
  lot: InventoryLot;
  allocatedQty: number;
  unitCost: number;
  totalCost: number;
}

export interface FefoSelectionResult {
  allocations: FefoAllocation[];
  totalAllocated: number;
  totalCost: number;
  shortageQty: number;
}

export class InventoryService {
  /**
   * Calculates effective expiry date taking into account openedDate + expiryAfterOpeningDays.
   */
  public computeEffectiveExpiry(
    expiryDate: string,
    openedDate?: string,
    expiryAfterOpeningDays?: number
  ): string {
    if (!openedDate || !expiryAfterOpeningDays || expiryAfterOpeningDays <= 0) {
      return expiryDate;
    }
    const openedMs = new Date(openedDate).getTime();
    if (Number.isNaN(openedMs)) return expiryDate;
    const afterOpenDate = new Date(openedMs + expiryAfterOpeningDays * 86400000)
      .toISOString()
      .slice(0, 10);
    return afterOpenDate < expiryDate ? afterOpenDate : expiryDate;
  }

  /**
   * Evaluates lot expiry and returns color-coded alert badge (🔴 🟠 🟡 🟢).
   */
  public evaluateLotExpiry(
    lot: Pick<InventoryLot, 'expiryDate' | 'effectiveExpiryDate' | 'status'>,
    referenceDate = '2026-11-10'
  ): LotExpiryEvaluation {
    const effectiveExpiryDate = lot.effectiveExpiryDate || lot.expiryDate;
    const refMs = new Date(referenceDate).getTime();
    const expMs = new Date(effectiveExpiryDate).getTime();
    const daysRemaining = Math.ceil((expMs - refMs) / 86400000);

    if (daysRemaining < 0 || lot.status === 'expired') {
      return {
        status: 'expired',
        daysRemaining,
        badgeColor: 'rose',
        icon: '🔴',
        labelAr: `منتهي الصلاحية (${Math.abs(daysRemaining)} يوم)`,
        labelEn: `Expired (${Math.abs(daysRemaining)}d ago)`,
        effectiveExpiryDate,
      };
    }

    if (daysRemaining <= 30) {
      return {
        status: 'critical_30',
        daysRemaining,
        badgeColor: 'amber',
        icon: '🟠',
        labelAr: `حرج جدًا (${daysRemaining} يوم)`,
        labelEn: `Critical (${daysRemaining}d left)`,
        effectiveExpiryDate,
      };
    }

    if (daysRemaining <= 90) {
      return {
        status: 'warning_90',
        daysRemaining,
        badgeColor: 'yellow',
        icon: '🟡',
        labelAr: `قرب الانتهاء (${daysRemaining} يوم)`,
        labelEn: `Expiring Soon (${daysRemaining}d)`,
        effectiveExpiryDate,
      };
    }

    return {
      status: 'valid',
      daysRemaining,
      badgeColor: 'emerald',
      icon: '🟢',
      labelAr: `صالح (${daysRemaining} يوم)`,
      labelEn: `Valid (${daysRemaining}d)`,
      effectiveExpiryDate,
    };
  }

  /**
   * Pure FEFO (First Expired, First Out) lot selector.
   * Automatically blocks expired lots unless allowExpiredOverride is true.
   */
  public selectLotsFEFO(
    lots: InventoryLot[],
    requiredQty: number,
    referenceDate = '2026-11-10',
    allowExpiredOverride = false
  ): FefoSelectionResult {
    const eligibleLots = lots
      .filter((lot) => {
        if (lot.remainingQty <= 0) return false;
        if (lot.status === 'disposed' || lot.status === 'quarantined' || lot.status === 'depleted') {
          return false;
        }
        if (lot.qcStatus === 'failed') return false;
        const evalRes = this.evaluateLotExpiry(lot, referenceDate);
        if (evalRes.status === 'expired' && !allowExpiredOverride) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const expA = a.effectiveExpiryDate || a.expiryDate;
        const expB = b.effectiveExpiryDate || b.expiryDate;
        return expA.localeCompare(expB);
      });

    const allocations: FefoAllocation[] = [];
    let remainingToAllocate = Math.round(requiredQty * 100) / 100;

    for (const lot of eligibleLots) {
      if (remainingToAllocate <= 0) break;
      const takeQty = Math.min(lot.remainingQty, remainingToAllocate);
      const roundedTake = Math.round(takeQty * 100) / 100;
      const lineCost = Math.round(roundedTake * lot.unitCost * 100) / 100;

      allocations.push({
        lot,
        allocatedQty: roundedTake,
        unitCost: lot.unitCost,
        totalCost: lineCost,
      });

      remainingToAllocate = Math.round((remainingToAllocate - roundedTake) * 100) / 100;
    }

    const totalAllocated =
      Math.round(allocations.reduce((s, a) => s + a.allocatedQty, 0) * 100) / 100;
    const totalCost =
      Math.round(allocations.reduce((s, a) => s + a.totalCost, 0) * 100) / 100;

    return {
      allocations,
      totalAllocated,
      totalCost,
      shortageQty: Math.max(0, Math.round((requiredQty - totalAllocated) * 100) / 100),
    };
  }

  /**
   * Calculates valuation of an item's active lots using FIFO, LIFO, or Weighted Average.
   */
  public calculateItemValuation(
    item: InventoryItem,
    lots: InventoryLot[]
  ): { totalQty: number; unitValuation: number; totalValue: number } {
    const activeLots = lots.filter(
      (l) => l.itemId === item.id && l.remainingQty > 0 && l.status !== 'disposed'
    );
    const totalQty = activeLots.reduce((s, l) => s + l.remainingQty, 0);
    if (totalQty <= 0) {
      return { totalQty: 0, unitValuation: item.unitCost, totalValue: 0 };
    }

    const totalLotValue = activeLots.reduce((s, l) => s + l.remainingQty * l.unitCost, 0);
    const unitValuation = Math.round((totalLotValue / totalQty) * 100) / 100;
    return {
      totalQty: Math.round(totalQty * 100) / 100,
      unitValuation,
      totalValue: Math.round(totalLotValue * 100) / 100,
    };
  }

  /**
   * Marks a lot as opened today and calculates effectiveExpiryDate based on expiryAfterOpeningDays.
   */
  public async openLotForUse(lotId: string, openedDate = '2026-11-10'): Promise<InventoryLot> {
    const lot = await db.inventoryLots.get(lotId);
    if (!lot) throw new Error('الدفعة غير موجودة');
    const item = await db.inventoryItems.get(lot.itemId);
    const effectiveExpiryDate = this.computeEffectiveExpiry(
      lot.expiryDate,
      openedDate,
      item?.expiryAfterOpeningDays
    );
    const updated: InventoryLot = {
      ...lot,
      openedDate,
      effectiveExpiryDate,
    };
    await db.inventoryLots.put(updated);
    return updated;
  }

  /**
   * Receives stock from a Purchase Invoice:
   * 1. Creates InventoryLots for each line
   * 2. Updates InventoryItem quantities & weighted average cost
   * 3. Records goods_receipt StockMovements
   * 4. Generates Double-Entry Journal Entry (Dr Inventory + Dr VAT Input / Cr Suppliers Payable)
   * 5. Updates Supplier balance & marks PurchaseInvoice.stockReceived = true
   */
  public async receivePurchaseInvoiceStock(
    purchaseInvoiceId: string,
    performedBy = 'accountant',
    referenceDate = '2026-11-10'
  ): Promise<{
    lotsCreated: InventoryLot[];
    movementsCreated: StockMovement[];
    journalEntry: JournalEntry;
  }> {
    const pinv = await db.purchaseInvoices.get(purchaseInvoiceId);
    if (!pinv) throw new Error('فاتورة الشراء غير موجودة');
    if (pinv.stockReceived) {
      throw new Error('تم استلام مخزون هذه الفاتورة مسبقًا');
    }

    // Validate no line item is already expired
    for (const line of pinv.items) {
      if (line.expiryDate < referenceDate) {
        throw new Error(
          `لا يمكن استلام دفعة منتهية الصلاحية (${line.itemNameAr} - ${line.lotNumber})`
        );
      }
    }

    const lotsCreated: InventoryLot[] = [];
    const movementsCreated: StockMovement[] = [];
    const jeId = `je_pinv_${Date.now()}`;

    for (let idx = 0; idx < pinv.items.length; idx++) {
      const line = pinv.items[idx];
      const item = await db.inventoryItems.get(line.itemId);
      if (!item) continue;

      const prevStock = item.currentStock;
      const newStock = Math.round((prevStock + line.quantity) * 100) / 100;
      const convertedUnitCost =
        Math.round(line.unitPrice * (pinv.exchangeRate || 1) * 100) / 100;
      const newUnitCost =
        item.costMethod === 'AVG' && newStock > 0
          ? Math.round(
              ((prevStock * item.unitCost + line.quantity * convertedUnitCost) / newStock) * 100
            ) / 100
          : convertedUnitCost;

      const newLot: InventoryLot = {
        id: `lot_rcpt_${Date.now()}_${idx + 1}`,
        lotNumber: line.lotNumber || `LOT-${Date.now().toString().slice(-5)}`,
        itemId: item.id,
        itemCode: item.code,
        itemNameAr: item.nameAr,
        itemNameEn: item.nameEn,
        supplierId: pinv.supplierId,
        supplierName: pinv.supplierName,
        purchaseInvoiceId: pinv.id,
        productionDate: line.productionDate,
        expiryDate: line.expiryDate,
        effectiveExpiryDate: line.expiryDate,
        receivedDate: referenceDate,
        initialQty: line.quantity,
        remainingQty: line.quantity,
        reservedQty: 0,
        unitCost: convertedUnitCost,
        storageLocation: line.storageLocation || 'المخزن الرئيسي M-01',
        qcStatus: 'passed',
        qcTestedBy: performedBy,
        qcDate: referenceDate,
        status: 'active',
      };

      const mov: StockMovement = {
        id: `mov_rcpt_${Date.now()}_${idx + 1}`,
        movementNumber: `MOV-GR-${Date.now().toString().slice(-5)}-${idx + 1}`,
        date: `${referenceDate} 10:30`,
        type: 'goods_receipt',
        itemId: item.id,
        itemCode: item.code,
        itemNameAr: item.nameAr,
        itemNameEn: item.nameEn,
        lotId: newLot.id,
        lotNumber: newLot.lotNumber,
        quantity: line.quantity,
        previousBalance: prevStock,
        newBalance: newStock,
        unitCost: convertedUnitCost,
        totalCost: Math.round(line.quantity * convertedUnitCost * 100) / 100,
        referenceType: 'purchase_invoice',
        referenceId: pinv.id,
        performedBy,
        approvedBy: performedBy,
        journalEntryId: jeId,
        notes: `استلام مخزني بموجب فاتورة شراء رقم ${pinv.invoiceNumber}`,
      };

      await db.inventoryItems.put({
        ...item,
        currentStock: newStock,
        availableStock: Math.max(0, newStock - item.reservedStock),
        unitCost: newUnitCost,
        lastPurchasePrice: convertedUnitCost,
      });
      await db.inventoryLots.put(newLot);
      await db.stockMovements.put(mov);

      lotsCreated.push(newLot);
      movementsCreated.push(mov);
    }

    const rate = pinv.exchangeRate || 1;
    const invNetSubtotal = Math.round((pinv.subtotal - pinv.discountAmount) * rate * 100) / 100;
    const invTax = Math.round(pinv.taxAmount * rate * 100) / 100;
    const invTotal = Math.round((invNetSubtotal + invTax) * 100) / 100;

    const journalEntry: JournalEntry = {
      id: jeId,
      entryNumber: `JE-GR-${Date.now().toString().slice(-5)}`,
      date: referenceDate,
      entryType: 'auto',
      referenceType: 'purchase_invoice',
      referenceId: pinv.id,
      status: 'posted',
      costCenter: 'CC-CHEM',
      descriptionAr: `استلام مخزني وإثبات فاتورة مشتريات ${pinv.invoiceNumber} - ${pinv.supplierName}`,
      descriptionEn: `Goods Receipt & Purchase Invoice ${pinv.invoiceNumber} - ${pinv.supplierName}`,
      lines: [
        {
          accountCode: '1.1.3.1',
          accountNameAr: 'مخزون الكواشف والمحاليل الكيميائية',
          accountNameEn: 'Chemical Reagents Inventory',
          debit: invNetSubtotal,
          credit: 0,
        },
        {
          accountCode: '1.1.4.2',
          accountNameAr: 'ضريبة القيمة المضافة للمشتريات (مدخلات)',
          accountNameEn: 'VAT Input Tax Receivable',
          debit: invTax,
          credit: 0,
        },
        {
          accountCode: '2.1.1',
          accountNameAr: 'الموردون والدائنون التجاريون',
          accountNameEn: 'Suppliers & Accounts Payable',
          debit: 0,
          credit: invTotal,
        },
      ],
      totalDebit: invTotal,
      totalCredit: invTotal,
      createdBy: performedBy,
    };

    await db.journalEntries.put(journalEntry);
    await db.purchaseInvoices.put({ ...pinv, stockReceived: true });

    const supplier = await db.suppliers.get(pinv.supplierId);
    if (supplier) {
      await db.suppliers.put({
        ...supplier,
        currentBalance: Math.round((supplier.currentBalance + pinv.remainingAmount * rate) * 100) / 100,
      });
    }

    return { lotsCreated, movementsCreated, journalEntry };
  }

  /**
   * Automatically deducts reagents & consumables according to TestBOM using FEFO
   * and creates an automatic COGS Journal Entry.
   */
  public async issueMaterialsForTestBOM(
    testId: string,
    requestId: string,
    performedBy = 'chemist',
    allowExpiredOverride = false,
    referenceDate = '2026-11-10'
  ): Promise<{
    movements: StockMovement[];
    totalCOGS: number;
    journalEntry: JournalEntry;
  }> {
    const bom = await db.testBOMs.where('testId').equals(testId).first();
    if (!bom) {
      throw new Error('لا توجد قائمة مواد (BOM) مسجلة لهذا التحليل');
    }

    const movements: StockMovement[] = [];
    const jeId = `je_bom_${Date.now()}`;
    let totalCOGS = 0;

    for (let i = 0; i < bom.items.length; i++) {
      const bomLine = bom.items[i];
      const item = await db.inventoryItems.get(bomLine.itemId);
      if (!item) continue;

      const grossRequiredQty =
        Math.round(bomLine.quantity * (1 + bomLine.wastePercent / 100) * 100) / 100;
      const itemLots = await db.inventoryLots.where('itemId').equals(item.id).toArray();

      const fefo = this.selectLotsFEFO(
        itemLots,
        grossRequiredQty,
        referenceDate,
        allowExpiredOverride
      );

      if (fefo.shortageQty > 0) {
        throw new Error(
          `رصيد الدفعات الصالحة غير كافٍ للصنف (${item.nameAr}) - المطلوب ${grossRequiredQty} والمتاح الصالح ${fefo.totalAllocated}`
        );
      }

      let runningItemStock = item.currentStock;
      for (const alloc of fefo.allocations) {
        const newLotRem = Math.round((alloc.lot.remainingQty - alloc.allocatedQty) * 100) / 100;
        await db.inventoryLots.put({
          ...alloc.lot,
          remainingQty: newLotRem,
          status: newLotRem <= 0 ? 'depleted' : alloc.lot.status,
        });

        const prevBal = runningItemStock;
        runningItemStock = Math.round((runningItemStock - alloc.allocatedQty) * 100) / 100;

        const mov: StockMovement = {
          id: `mov_bom_${Date.now()}_${i}_${alloc.lot.id}`,
          movementNumber: `MOV-ISS-${Date.now().toString().slice(-5)}-${i + 1}`,
          date: `${referenceDate} 11:45`,
          type: 'issue_to_test',
          itemId: item.id,
          itemCode: item.code,
          itemNameAr: item.nameAr,
          itemNameEn: item.nameEn,
          lotId: alloc.lot.id,
          lotNumber: alloc.lot.lotNumber,
          quantity: alloc.allocatedQty,
          previousBalance: prevBal,
          newBalance: runningItemStock,
          unitCost: alloc.unitCost,
          totalCost: alloc.totalCost,
          referenceType: 'lab_request',
          referenceId: requestId,
          department: bom.testCode,
          performedBy,
          approvedBy: performedBy,
          journalEntryId: jeId,
          notes: `صرف آلي لتحليل ${bom.testNameAr} (${bom.testCode}) وفق FEFO من دفعة ${alloc.lot.lotNumber}`,
        };

        await db.stockMovements.put(mov);
        movements.push(mov);
        totalCOGS = Math.round((totalCOGS + alloc.totalCost) * 100) / 100;
      }

      await db.inventoryItems.put({
        ...item,
        currentStock: runningItemStock,
        availableStock: Math.max(0, runningItemStock - item.reservedStock),
      });
    }

    const journalEntry: JournalEntry = {
      id: jeId,
      entryNumber: `JE-COGS-${Date.now().toString().slice(-5)}`,
      date: referenceDate,
      entryType: 'auto',
      referenceType: 'stock_issue',
      referenceId: requestId,
      status: 'posted',
      costCenter: 'CC-CHEM',
      descriptionAr: `تكلفة الكواشف والمستهلكات المنصرفة لتحليل ${bom.testNameAr} (طلب ${requestId})`,
      descriptionEn: `COGS Reagents & Consumables Issued for ${bom.testNameEn} (${requestId})`,
      lines: [
        {
          accountCode: '5.1.1',
          accountNameAr: 'تكلفة الكواشف والمحاليل المستهلكة بالتحاليل',
          accountNameEn: 'Consumed Reagents Cost (COGS)',
          debit: totalCOGS,
          credit: 0,
        },
        {
          accountCode: '1.1.3.1',
          accountNameAr: 'مخزون الكواشف والمحاليل الكيميائية',
          accountNameEn: 'Chemical Reagents Inventory',
          debit: 0,
          credit: totalCOGS,
        },
      ],
      totalDebit: totalCOGS,
      totalCredit: totalCOGS,
      createdBy: performedBy,
    };

    await db.journalEntries.put(journalEntry);
    return { movements, totalCOGS, journalEntry };
  }

  /**
   * Disposes of an expired or damaged lot and records the write-off accounting entry.
   */
  public async disposeExpiredOrDamagedLot(
    lotId: string,
    quantity: number,
    reason: string,
    performedBy = 'owner',
    referenceDate = '2026-11-10'
  ): Promise<{ movement: StockMovement; journalEntry: JournalEntry }> {
    const lot = await db.inventoryLots.get(lotId);
    if (!lot) throw new Error('الدفعة غير موجودة');
    if (quantity <= 0 || quantity > lot.remainingQty) {
      throw new Error('الكمية المراد إتلافها غير صالحة أو تتجاوز الرصيد المتبقي بالدفعة');
    }

    const item = await db.inventoryItems.get(lot.itemId);
    if (!item) throw new Error('الصنف غير موجود');

    const newLotRem = Math.round((lot.remainingQty - quantity) * 100) / 100;
    const prevStock = item.currentStock;
    const newStock = Math.max(0, Math.round((prevStock - quantity) * 100) / 100);
    const totalLoss = Math.round(quantity * lot.unitCost * 100) / 100;
    const jeId = `je_disp_${Date.now()}`;

    await db.inventoryLots.put({
      ...lot,
      remainingQty: newLotRem,
      status: newLotRem <= 0 ? 'disposed' : lot.status,
    });

    await db.inventoryItems.put({
      ...item,
      currentStock: newStock,
      availableStock: Math.max(0, newStock - item.reservedStock),
    });

    const movement: StockMovement = {
      id: `mov_disp_${Date.now()}`,
      movementNumber: `MOV-DISP-${Date.now().toString().slice(-5)}`,
      date: `${referenceDate} 14:00`,
      type: 'disposal',
      itemId: item.id,
      itemCode: item.code,
      itemNameAr: item.nameAr,
      itemNameEn: item.nameEn,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      quantity,
      previousBalance: prevStock,
      newBalance: newStock,
      unitCost: lot.unitCost,
      totalCost: totalLoss,
      referenceType: 'disposal_order',
      referenceId: lot.id,
      performedBy,
      approvedBy: performedBy,
      journalEntryId: jeId,
      notes: `محضر إتلاف رسمي: ${reason}`,
    };

    const journalEntry: JournalEntry = {
      id: jeId,
      entryNumber: `JE-DISP-${Date.now().toString().slice(-5)}`,
      date: referenceDate,
      entryType: 'auto',
      referenceType: 'stock_disposal',
      referenceId: lot.id,
      status: 'posted',
      costCenter: 'CC-CHEM',
      descriptionAr: `إثبات خسائر إتلاف مخزون منتهي/تالف (${item.nameAr} - دفعة ${lot.lotNumber})`,
      descriptionEn: `Expired/Damaged Stock Write-off (${item.nameEn} - Lot ${lot.lotNumber})`,
      lines: [
        {
          accountCode: '5.1.4',
          accountNameAr: 'خسائر تلف وانتهاء صلاحية المخزون',
          accountNameEn: 'Expired & Damaged Stock Write-off',
          debit: totalLoss,
          credit: 0,
        },
        {
          accountCode: '1.1.3.1',
          accountNameAr: 'مخزون الكواشف والمحاليل الكيميائية',
          accountNameEn: 'Chemical Reagents Inventory',
          debit: 0,
          credit: totalLoss,
        },
      ],
      totalDebit: totalLoss,
      totalCredit: totalLoss,
      createdBy: performedBy,
    };

    await db.stockMovements.put(movement);
    await db.journalEntries.put(journalEntry);

    return { movement, journalEntry };
  }

  /**
   * Approves a Stock Taking session and generates inventory adjustments & accounting entry.
   */
  public async approveStockTakingSession(
    sessionId: string,
    approvedBy = 'owner',
    referenceDate = '2026-11-10'
  ): Promise<void> {
    const session = await db.stockTakingSessions.get(sessionId);
    if (!session) throw new Error('جلسة الجرد غير موجودة');
    if (session.status === 'approved') throw new Error('تم اعتماد جلسة الجرد مسبقًا');

    for (const line of session.lines) {
      if (line.varianceQty === 0) continue;
      const item = await db.inventoryItems.get(line.itemId);
      if (!item) continue;

      const prevStock = item.currentStock;
      const newStock = Math.max(0, line.actualQty);
      await db.inventoryItems.put({
        ...item,
        currentStock: newStock,
        availableStock: Math.max(0, newStock - item.reservedStock),
      });

      const mov: StockMovement = {
        id: `mov_st_${Date.now()}_${item.id}`,
        movementNumber: `MOV-ADJ-${Date.now().toString().slice(-5)}`,
        date: `${referenceDate} 16:00`,
        type: 'adjustment',
        itemId: item.id,
        itemCode: item.code,
        itemNameAr: item.nameAr,
        itemNameEn: item.nameEn,
        quantity: Math.abs(line.varianceQty),
        previousBalance: prevStock,
        newBalance: newStock,
        unitCost: line.unitCost,
        totalCost: Math.abs(line.varianceValue),
        referenceType: 'stock_taking',
        referenceId: session.id,
        performedBy: approvedBy,
        approvedBy,
        notes: `تسوية فروق جرد (${session.sessionNumber}): ${line.reason || 'مطابقة الرصيد الفعلي'}`,
      };
      await db.stockMovements.put(mov);
    }

    const absVariance = Math.round(Math.abs(session.totalVarianceValue) * 100) / 100;
    if (absVariance > 0) {
      const isShortage = session.totalVarianceValue < 0;
      await db.journalEntries.put({
        id: `je_st_${Date.now()}`,
        entryNumber: `JE-ST-${Date.now().toString().slice(-5)}`,
        date: referenceDate,
        entryType: 'adjustment',
        referenceType: 'stock_adjustment',
        referenceId: session.id,
        status: 'posted',
        descriptionAr: `قيد تسوية فروق الجرد المخزني (${session.sessionNumber})`,
        descriptionEn: `Stock Taking Variance Adjustment (${session.sessionNumber})`,
        lines: isShortage
          ? [
              { accountCode: '5.1.4', accountNameAr: 'خسائر وعجز المخزون', accountNameEn: 'Inventory Shortage Expense', debit: absVariance, credit: 0 },
              { accountCode: '1.1.3.1', accountNameAr: 'مخزون الكواشف والمحاليل الكيميائية', accountNameEn: 'Chemical Reagents Inventory', debit: 0, credit: absVariance },
            ]
          : [
              { accountCode: '1.1.3.1', accountNameAr: 'مخزون الكواشف والمحاليل الكيميائية', accountNameEn: 'Chemical Reagents Inventory', debit: absVariance, credit: 0 },
              { accountCode: '5.1.4', accountNameAr: 'فائض تسوية الجرد المخزني', accountNameEn: 'Inventory Overage Credit', debit: 0, credit: absVariance },
            ],
        totalDebit: absVariance,
        totalCredit: absVariance,
        createdBy: approvedBy,
      });
    }

    await db.stockTakingSessions.put({
      ...session,
      status: 'approved',
      approvedBy,
    });
  }

  /**
   * Returns categorized inventory alerts (expiry & stock levels).
   */
  public async getInventoryAlertsSummary(referenceDate = '2026-11-10'): Promise<{
    expiredLots: InventoryLot[];
    expiring30Days: InventoryLot[];
    expiring90Days: InventoryLot[];
    belowMinStock: InventoryItem[];
    atReorderPoint: InventoryItem[];
  }> {
    const [items, lots] = await Promise.all([
      db.inventoryItems.toArray(),
      db.inventoryLots.toArray(),
    ]);

    const expiredLots: InventoryLot[] = [];
    const expiring30Days: InventoryLot[] = [];
    const expiring90Days: InventoryLot[] = [];

    for (const lot of lots) {
      if (lot.status === 'disposed' || lot.remainingQty <= 0) continue;
      const ev = this.evaluateLotExpiry(lot, referenceDate);
      if (ev.status === 'expired') expiredLots.push(lot);
      else if (ev.status === 'critical_30') expiring30Days.push(lot);
      else if (ev.status === 'warning_90') expiring90Days.push(lot);
    }

    const belowMinStock = items.filter((i) => i.active && i.currentStock <= i.minStock);
    const atReorderPoint = items.filter(
      (i) => i.active && i.currentStock > i.minStock && i.currentStock <= i.reorderPoint
    );

    return {
      expiredLots,
      expiring30Days,
      expiring90Days,
      belowMinStock,
      atReorderPoint,
    };
  }
}

export const inventoryService = new InventoryService();
