import { accountingRepository } from '../repositories';
import { db } from '../db/database';
import type { DoctorCommission, Expense, Invoice, JournalEntry, Payment } from '../types';

export class AccountingService {
  /**
   * 1. Automatic Journal Entry when issuing an Invoice
   */
  async recordInvoiceJournal(invoice: Invoice, createdBy: string): Promise<JournalEntry> {
    const money=(n:number)=>Math.round(n*100)/100;
    const companyPart=invoice.contractId
      ? Math.min(invoice.netTotal,Math.max(0,money(Number(invoice.companyShareAmount)||0)))
      : 0;
    const patientPart=money(invoice.netTotal-companyPart);
    const netRevenueAfterDiscount = money(invoice.subtotal-invoice.discountAmount);
    const lines:JournalEntry['lines'] = [];
    if(patientPart>0)lines.push({
      accountCode:'1204',accountNameAr:'ذمم العملاء / المرضى',
      accountNameEn:'Patients Receivable',debit:patientPart,credit:0,
    });
    if(companyPart>0)lines.push({
      accountCode:'1205',accountNameAr:'عملاء التعاقدات والتأمين',
      accountNameEn:'Corporate and Insurance Receivable',debit:companyPart,credit:0,
    });
    if(netRevenueAfterDiscount>0)lines.push({
      accountCode:invoice.contractId?'4102':'4101',
      accountNameAr:invoice.contractId?'إيرادات التحاليل - التعاقدات':'إيرادات التحاليل الطبية',
      accountNameEn:invoice.contractId?'Corporate Medical Lab Revenue':'Medical Lab Tests Revenue',
      debit:0,credit:netRevenueAfterDiscount,
    });
    if(invoice.taxAmount>0)lines.push({
      accountCode:'2104',accountNameAr:'ضريبة القيمة المضافة المستحقة',
      accountNameEn:'VAT Payable',debit:0,credit:invoice.taxAmount,
    });
    const debits=money(lines.reduce((sum,line)=>sum+line.debit,0));
    const credits=money(lines.reduce((sum,line)=>sum+line.credit,0));
    if(debits!==credits)throw new Error('UNBALANCED_INVOICE_JOURNAL');
    const entry: JournalEntry = {
      id: `je_inv_${crypto.randomUUID()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: invoice.date,
      referenceType: 'invoice',
      referenceId: invoice.id,
      descriptionAr: `إصدار فاتورة تحاليل رقم ${invoice.invoiceNumber}`,
      descriptionEn: `Issue Lab Invoice #${invoice.invoiceNumber}`,
      lines,
      totalDebit: debits,
      totalCredit: credits,
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
      id: `je_pay_${crypto.randomUUID()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: payment.date,
      referenceType: 'payment',
      referenceId: payment.id,
      descriptionAr: `تحصيل دفعة ${payment.paymentNumber} عن الفاتورة ${payment.invoiceNumber}`,
      descriptionEn: `Payment Receipt ${payment.paymentNumber} for Invoice ${payment.invoiceNumber}`,
      lines: [
        {
          accountCode: isCash ? '1201' : '1202',
          accountNameAr: isCash ? 'الصندوق النقدي الرئيسي' : 'البنك والحسابات الجارية',
          accountNameEn: isCash ? 'Main Cashbox' : 'Bank & POS Account',
          debit: payment.amount,
          credit: 0,
        },
        {
          accountCode: payment.payerType === 'contract' ? '1205' : '1204',
          accountNameAr: payment.payerType === 'contract' ? 'ذمم شركات التأمين والتعاقدات' : 'ذمم العملاء / المرضى',
          accountNameEn: payment.payerType === 'contract' ? 'Corporate Receivables' : 'Accounts Receivable (Patients)',
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
      id: `je_exp_${crypto.randomUUID()}`,
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
          accountCode: isCash ? '1201' : '1202',
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
  ): Promise<JournalEntry | null> {
    // Post only the DIFFERENCE between calculated and previously accrued
    // commissions. Otherwise every partial payment repeats the full expense.
    return db.transaction('rw',db.journalEntries,async()=>{
      const all=await db.journalEntries.toArray();
      const accrualIds=new Set(all.filter(j=>
        j.referenceType==='commission_accrual' && j.referenceId===commission.id
      ).map(j=>j.id));
      const prior=all.filter(j=>
        (j.referenceType==='commission_accrual' && j.referenceId===commission.id) ||
        (j.referenceType==='reversal' && accrualIds.has(j.referenceId))
      );
      const accrued=Math.round(prior.reduce((sum,j)=>
        sum+j.lines.filter(l=>l.accountCode==='5101').reduce((s,l)=>s+l.debit-l.credit,0),0)*100)/100;
      const diff=Math.round((commission.commissionAmount-accrued)*100)/100;
      if (Math.abs(diff)<0.01)return null;
      const amount=Math.abs(diff);
      const increase=diff>0;
      const entry:JournalEntry={
        id:'je_ca_'+crypto.randomUUID(),
        entryNumber:'JE-CA-'+Date.now(),
        date:commission.date,referenceType:'commission_accrual',
        referenceId:commission.id,
        descriptionAr:(increase?'تسوية استحقاق عمولة طبيب: ':'تخفيض استحقاق عمولة طبيب: ')+doctorNameAr+' / '+commission.invoiceNumber,
        descriptionEn:(increase?'Accrue doctor commission difference: ':'Reduce doctor commission accrual: ')+doctorNameEn+' / '+commission.invoiceNumber,
        lines:[
          {accountCode:'5101',accountNameAr:'مصروف عمولات الأطباء',accountNameEn:'Doctor Commission Expense',
            debit:increase?amount:0,credit:increase?0:amount},
          {accountCode:'2102',accountNameAr:'ذمم الأطباء المحولين',accountNameEn:'Doctors Payable',
            debit:increase?0:amount,credit:increase?amount:0},
        ],
        totalDebit:amount,totalCredit:amount,status:'posted',createdBy,
      };
      await db.journalEntries.put(entry);
      return entry;
    });
  }

  /**
   * 5. Automatic Journal Entry when paying out a Doctor Commission
   */
  async recordCommissionPayoutJournal(
    commission: DoctorCommission,
    amountPaid: number,
    doctorNameAr: string,
    doctorNameEn: string,
    createdBy: string,
    payoutDate?: string,
    payoutNotes?: string
  ): Promise<JournalEntry> {
    const today = payoutDate || new Date().toISOString().slice(0, 10);
    const entry: JournalEntry = {
      id: `je_cp_${crypto.randomUUID()}`,
      entryNumber: `JE-${String(Date.now()).slice(-6)}`,
      date: today,
      referenceType: 'commission_payout',
      referenceId: commission.id,
      descriptionAr: `صرف عمولة نقدية للطبيب (${doctorNameAr}) عن الفاتورة ${commission.invoiceNumber}${payoutNotes ? ' — ' + payoutNotes : ''}`,
      descriptionEn: `Payout Doctor Commission (${doctorNameEn}) for ${commission.invoiceNumber}${payoutNotes ? ' — ' + payoutNotes : ''}`,
      lines: [
        {
          accountCode: '2102',
          accountNameAr: 'ذمم الأطباء المحولين',
          accountNameEn: 'Doctors Payable',
          debit: amountPaid,
          credit: 0,
        },
        {
          accountCode: '1201',
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
