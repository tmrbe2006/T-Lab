import { describe, expect, it, vi } from 'vitest';
vi.mock('../../repositories',()=>({
  accountingRepository:{saveJournalEntry:vi.fn(async()=> 'saved')},
}));
import { AccountingService } from '../../services/accounting.service';
import type { Invoice, Payment, DoctorCommission } from '../../types';

const service=new AccountingService();
const invoice=(company:number):Invoice=>({
  id:'inv1',invoiceNumber:'INV-1',requestId:'req1',patientId:'p1',
  requestType:'internal',date:'2026-11-20',subtotal:410,
  discountType:'fixed',discountValue:50,discountAmount:50,
  taxRate:14,taxAmount:50.4,netTotal:410.4,
  paidAmount:0,remainingAmount:410.4,paymentMethod:'cash',
  status:'unpaid',notes:'',createdBy:'test',
  ...(company?{contractId:'co1',companyShareAmount:company,patientShareAmount:Math.round((410.4-company)*100)/100}:{})
});
describe('automatic journal account mapping matches actual T-Lab chart of accounts',()=>{
  it('walk-in invoice debits patient receivables 1204, credits 4101 and VAT 2104',async()=>{
    const entry=await service.recordInvoiceJournal(invoice(0),'test');
    expect(entry.lines.map(x=>x.accountCode)).toEqual(['1204','4101','2104']);
    expect(entry.lines.find(x=>x.accountCode==='1204')?.debit).toBe(410.4);
    expect(entry.lines.find(x=>x.accountCode==='2104')?.credit).toBe(50.4);
    expect(entry.totalDebit).toBe(entry.totalCredit);
  });
  it('contract invoice splits patient 1204 and company 1205 receivables',async()=>{
    const entry=await service.recordInvoiceJournal(invoice(300),'test');
    expect(entry.lines.find(x=>x.accountCode==='1204')?.debit).toBe(110.4);
    expect(entry.lines.find(x=>x.accountCode==='1205')?.debit).toBe(300);
    expect(entry.lines.find(x=>x.accountCode==='4102')?.credit).toBe(360);
    expect(entry.totalDebit).toBe(entry.totalCredit);
  });
  it('cash payment debits cashbox 1201, not laboratory equipment 1101',async()=>{
    const payment={id:'pay1',paymentNumber:'PAY-1',invoiceId:'inv1',invoiceNumber:'INV-1',
      date:'2026-11-20',amount:50,method:'cash'} as Payment;
    const entry=await service.recordPaymentJournal(payment,'test');
    expect(entry.lines[0].accountCode).toBe('1201');
    expect(entry.lines[1].accountCode).toBe('1204');
  });
  it('commission disbursement credits cashbox 1201',async()=>{
    const commission={id:'cm1',invoiceNumber:'INV-1'} as DoctorCommission;
    const entry=await service.recordCommissionPayoutJournal(commission,90,'طبيب','Doctor','owner','2026-11-20','ملاحظات');
    expect(entry.lines.find(x=>x.accountCode==='1201')?.credit).toBe(90);
    expect(entry.date).toBe('2026-11-20');
    expect(entry.descriptionAr).toContain('ملاحظات');
  });
});
