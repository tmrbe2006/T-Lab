import { describe, it, expect, beforeEach } from 'vitest';
import { AccountingService } from '../../services/accounting.service';
import { db } from '../../db/database';
import type { Invoice, Payment, Expense, DoctorCommission } from '../../types';

describe('AccountingService', () => {
  const accountingService = new AccountingService();

  beforeEach(async () => {
    await db.journalEntries.clear();
  });

  describe('recordInvoiceJournal', () => {
    it('يجب أن ينشئ قيد محاسبي متوازن للفاتورة', async () => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-001',
        requestId: '1',
        patientId: '1',
        requestType: 'internal',
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'percentage',
        discountValue: 10,
        discountAmount: 100,
        taxRate: 14,
        taxAmount: 126,
        netTotal: 1026,
        paidAmount: 0,
        remainingAmount: 1026,
        paymentMethod: 'cash',
        status: 'unpaid',
        notes: '',
        createdBy: 'admin',
      };

      const entry = await accountingService.recordInvoiceJournal(invoice, 'admin');

      expect(entry.totalDebit).toBe(entry.totalCredit);
      expect(entry.totalDebit).toBe(1026);
      expect(entry.lines).toHaveLength(3); // مدين: ذمم، دائن: إيرادات + ضرائب

      // التحقق من توازن الأسطر
      const sumDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const sumCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      expect(sumDebit).toBe(sumCredit);
    });
  });

  describe('recordPaymentJournal', () => {
    it('يجب أن ينشئ قيد محاسبي متوازن للدفعة النقدية والبنكية', async () => {
      const cashPayment: Payment = {
        id: '1',
        paymentNumber: 'REC-001',
        invoiceId: '1',
        invoiceNumber: 'INV-001',
        patientId: '1',
        date: '2026-01-01',
        amount: 500,
        method: 'cash',
        createdBy: 'cashier',
        status: 'active',
        notes: '',
      };

      const entry = await accountingService.recordPaymentJournal(cashPayment, 'cashier');

      expect(entry.totalDebit).toBe(entry.totalCredit);
      expect(entry.totalDebit).toBe(500);
      expect(entry.lines).toHaveLength(2); // مدين: نقدية، دائن: ذمم
      expect(entry.lines[0].accountCode).toBe('1101');

      const bankPayment: Payment = {
        ...cashPayment,
        id: '2',
        paymentNumber: 'REC-002',
        method: 'card',
      };
      const bankEntry = await accountingService.recordPaymentJournal(bankPayment, 'cashier');
      expect(bankEntry.lines[0].accountCode).toBe('1102');
    });
  });

  describe('recordExpenseJournal', () => {
    it('يجب أن ينشئ قيد محاسبي متوازن للمصروفات', async () => {
      const expense: Expense = {
        id: 'exp-1',
        expenseNumber: 'EXP-001',
        date: '2026-01-01',
        category: 'مستلزمات تشغيل',
        accountCode: '5102',
        amount: 350,
        paidBy: 'accountant',
        paymentMethod: 'cash',
        description: 'شراء أنابيب سحب عينات',
      };

      const entry = await accountingService.recordExpenseJournal(expense, 'accountant');

      expect(entry.totalDebit).toBe(entry.totalCredit);
      expect(entry.totalDebit).toBe(350);
      expect(entry.lines[0].accountCode).toBe('5102');
      expect(entry.lines[1].accountCode).toBe('1101');
    });
  });

  describe('recordCommissionAccrualJournal & recordCommissionPayoutJournal', () => {
    it('يجب أن ينشئ قيود متوازنة لاستحقاق وصرف عمولات الأطباء', async () => {
      const commission: DoctorCommission = {
        id: 'comm-1',
        doctorId: 'doc-1',
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-001',
        patientId: 'pat-1',
        date: '2026-01-01',
        invoiceNetTotal: 1000,
        referredItemsNet: 1000,
        collectedAmount: 1000,
        collectionRatio: 1,
        collectedReferredBasis: 1000,
        commissionRate: 10,
        commissionAmount: 100,
        paidAmount: 0,
        remainingAmount: 100,
        status: 'accrued',
      };

      const accrualEntry = await accountingService.recordCommissionAccrualJournal(
        commission,
        'د. أحمد',
        'Dr. Ahmed',
        'admin'
      );
      expect(accrualEntry.totalDebit).toBe(accrualEntry.totalCredit);
      expect(accrualEntry.totalDebit).toBe(100);
      expect(accrualEntry.lines[0].accountCode).toBe('5101');
      expect(accrualEntry.lines[1].accountCode).toBe('2102');

      const payoutEntry = await accountingService.recordCommissionPayoutJournal(
        commission,
        100,
        'د. أحمد',
        'Dr. Ahmed',
        'admin'
      );
      expect(payoutEntry.totalDebit).toBe(payoutEntry.totalCredit);
      expect(payoutEntry.totalDebit).toBe(100);
      expect(payoutEntry.lines[0].accountCode).toBe('2102');
      expect(payoutEntry.lines[1].accountCode).toBe('1101');
    });
  });
});
