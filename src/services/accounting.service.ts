import { accountingRepository } from '../repositories';
import type { DoctorCommission, Expense, Invoice, JournalEntry, Payment } from '../types';

export class AccountingService {
  /**
   * 1. Automatic Journal Entry when issuing an Invoice
   */
  async recordInvoiceJournal(invoice: Invoice, createdBy: string): Promise<JournalEntry> {
    const netRevenueAfterDiscount = Math.round((invoice.subtotal - invoice.discountAmount) * 100) / 100;
    const lines: JournalEntry['lines'] = [
      {
        accountCode: '1103',
        accountNameAr: 'ذمم العملاء / المرضى',
        accountNameEn: 'Accounts Receivable (Patients)',
        debit: invoice.netTotal,
        credit: 0,
      },
      {
        accountCode: '4101',
        accountNameAr: 'إيرادات التحاليل الطبية',
        accountNameEn: 'Medical Lab Tests Revenue',
        debit: 0,
        credit: netRevenueAfterDiscount,
      },
    ];

    if (invoice.taxAmount > 0) {
      lines.push({
        accountCode: '2101',
        accountNameAr: 'ضريبة القيمة المضافة المستحقة',
        accountNameEn: 'VAT Payable',
        debit: 0,
        credit: invoice.taxAmount,
      });
    }

    const entry: JournalEntry = {
      id: `je_inv_${Date.now()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: invoice.date,
      referenceType: 'invoice',
      referenceId: invoice.id,
      descriptionAr: `إصدار فاتورة تحاليل رقم ${invoice.invoiceNumber}`,
      descriptionEn: `Issue Lab Invoice #${invoice.invoiceNumber}`,
      lines,
      totalDebit: invoice.netTotal,
      totalCredit: invoice.netTotal,
      createdBy,
    };

    await accountingRepository.saveJournalEntry(entry);
    return entry;
  }

  /**
   * 2. Automatic Journal Entry when recording a Payment
   */
  async recordPaymentJournal(payment: Payment, createdBy: string): Promise<JournalEntry> {
    const isCash = payment.method === 'cash';
    const entry: JournalEntry = {
      id: `je_pay_${Date.now()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: payment.date,
      referenceType: 'payment',
      referenceId: payment.id,
      descriptionAr: `تحصيل دفعة ${payment.paymentNumber} عن الفاتورة ${payment.invoiceNumber}`,
      descriptionEn: `Payment Receipt ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
      lines: [
        {
          accountCode: isCash ? '1101' : '1102',
          accountNameAr: isCash ? 'الصندوق النقدي الرئيسي' : 'البنك والحسابات الجارية',
          accountNameEn: isCash ? 'Main Cashbox' : 'Bank & POS Account',
          debit: payment.amount,
          credit: 0,
        },
        {
          accountCode: '1103',
          accountNameAr: 'ذمم العملاء / المرضى',
          accountNameEn: 'Accounts Receivable (Patients)',
          debit: 0,
          credit: payment.amount,
        },
      ],
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      createdBy,
    };

    await accountingRepository.saveJournalEntry(entry);
    return entry;
  }

  /**
   * 3. Automatic Journal Entry when recording an Expense
   */
  async recordExpenseJournal(expense: Expense, createdBy: string): Promise<JournalEntry> {
    const isCash = expense.paymentMethod === 'cash';
    const entry: JournalEntry = {
      id: `je_exp_${Date.now()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: expense.date,
      referenceType: 'expense',
      referenceId: expense.id,
      descriptionAr: `تسجيل مصروف (${expense.category}) رقم ${expense.expenseNumber}`,
      descriptionEn: `Record Expense (${expense.category}) #${expense.expenseNumber}`,
      lines: [
        {
          accountCode: expense.accountCode || '5107',
          accountNameAr: `مصروف ${expense.category}`,
          accountNameEn: `Expense: ${expense.category}`,
          debit: expense.amount,
          credit: 0,
        },
        {
          accountCode: isCash ? '1101' : '1102',
          accountNameAr: isCash ? 'الصندوق النقدي الرئيسي' : 'البنك والحسابات الجارية',
          accountNameEn: isCash ? 'Main Cashbox' : 'Bank Account',
          debit: 0,
          credit: expense.amount,
        },
      ],
      totalDebit: expense.amount,
      totalCredit: expense.amount,
      createdBy,
    };

    await accountingRepository.saveJournalEntry(entry);
    return entry;
  }

  /**
   * 4. Automatic Journal Entry when accruing a Doctor Commission
   */
  async recordCommissionAccrualJournal(
    commission: DoctorCommission,
    doctorNameAr: string,
    doctorNameEn: string,
    createdBy: string
  ): Promise<JournalEntry> {
    const entry: JournalEntry = {
      id: `je_ca_${Date.now()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: commission.date,
      referenceType: 'commission_accrual',
      referenceId: commission.id,
      descriptionAr: `احتساب عمولة طبيب محول (${doctorNameAr}) عن الفاتورة ${commission.invoiceNumber}`,
      descriptionEn: `Accrue Referring Doctor Commission (${doctorNameEn}) for ${commission.invoiceNumber}`,
      lines: [
        {
          accountCode: '5101',
          accountNameAr: 'مصروف عمولات الأطباء',
          accountNameEn: 'Doctor Commissions Expense',
          debit: commission.commissionAmount,
          credit: 0,
        },
        {
          accountCode: '2102',
          accountNameAr: 'ذمم الأطباء المحولين',
          accountNameEn: 'Doctors Payable',
          debit: 0,
          credit: commission.commissionAmount,
        },
      ],
      totalDebit: commission.commissionAmount,
      totalCredit: commission.commissionAmount,
      createdBy,
    };

    await accountingRepository.saveJournalEntry(entry);
    return entry;
  }

  /**
   * 5. Automatic Journal Entry when paying out a Doctor Commission
   */
  async recordCommissionPayoutJournal(
    commission: DoctorCommission,
    amountPaid: number,
    doctorNameAr: string,
    doctorNameEn: string,
    createdBy: string
  ): Promise<JournalEntry> {
    const today = new Date().toISOString().slice(0, 10);
    const entry: JournalEntry = {
      id: `je_cp_${Date.now()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: today,
      referenceType: 'commission_payout',
      referenceId: commission.id,
      descriptionAr: `صرف عمولة نقدية للطبيب (${doctorNameAr}) عن الفاتورة ${commission.invoiceNumber}`,
      descriptionEn: `Payout Doctor Commission (${doctorNameEn}) for ${commission.invoiceNumber}`,
      lines: [
        {
          accountCode: '2102',
          accountNameAr: 'ذمم الأطباء المحولين',
          accountNameEn: 'Doctors Payable',
          debit: amountPaid,
          credit: 0,
        },
        {
          accountCode: '1101',
          accountNameAr: 'الصندوق النقدي الرئيسي',
          accountNameEn: 'Main Cashbox',
          debit: 0,
          credit: amountPaid,
        },
      ],
      totalDebit: amountPaid,
      totalCredit: amountPaid,
      createdBy,
    };

    await accountingRepository.saveJournalEntry(entry);
    return entry;
  }
}

export const accountingService = new AccountingService();
