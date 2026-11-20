import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { accountingService } from '../../services/accounting.service';
import { adjustUnpaidInvoice, synchronizeUnpaidRequestInvoice } from '../../services/invoice-adjustment.service';
import type { Invoice, LabRequest, InvoiceItem } from '../../types';

const invoice: Invoice = {
  id:'inv_fin_reconcile',invoiceNumber:'INV-RECONCILE',
  requestId:'req_fin_reconcile',patientId:'pat_fin_reconcile',
  requestType:'referred',date:'2026-11-20',
  subtotal:410,discountType:'none',discountValue:0,discountAmount:0,
  taxRate:14,taxAmount:57.4,netTotal:467.4,
  paidAmount:0,remainingAmount:467.4,status:'unpaid',
  paymentMethod:'cash',notes:'',createdBy:'owner',
};
const request = {
  id:invoice.requestId,requestNumber:'REQ-RECONCILE',barcode:'BC-RECONCILE',
  patientId:invoice.patientId,type:'referred',status:'sample_received',
  subtotal:invoice.subtotal,discountType:invoice.discountType,discountValue:0,
  discountAmount:0,taxRate:14,taxAmount:57.4,netTotal:467.4,
  createdBy:'owner',createdAt:invoice.date,notes:'',
} as LabRequest;
const items:InvoiceItem[] = [
  { id:'fin_cbc',invoiceId:invoice.id,testId:'cbc',testNameAr:'صورة دم',testNameEn:'CBC',price:180,netAfterDiscountAndTax:205.2,commissionEligible:true },
  { id:'fin_urea',invoiceId:invoice.id,testId:'urea',testNameAr:'يوريا',testNameEn:'Urea',price:110,netAfterDiscountAndTax:125.4,commissionEligible:true },
  { id:'fin_tsh',invoiceId:invoice.id,testId:'tsh',testNameAr:'هرمون الغدة',testNameEn:'TSH',price:120,netAfterDiscountAndTax:136.8,commissionEligible:false },
];

describe('unpaid request/invoice adjustments and balanced accounting entries', () => {
  beforeEach(async () => {
    await db.payments.where('invoiceId').equals(invoice.id).delete();
    const existing = await db.journalEntries.where('referenceId').equals(invoice.id).toArray();
    for (const j of existing) await db.journalEntries.delete(j.id);
    await db.invoices.put(invoice);
    await db.requests.put(request);
    await db.invoiceItems.bulkPut(items);
  });

  it('re-posts a balanced invoice and updates the linked request when fixed discount changes', async () => {
    const original = await accountingService.recordInvoiceJournal(invoice,'owner');
    expect(original.totalDebit).toBe(467.4);
    expect(original.totalCredit).toBe(467.4);
    const updated = await adjustUnpaidInvoice(invoice.id,50,14,'owner',{type:'fixed',value:50});
    expect(updated.subtotal).toBe(410);
    expect(updated.discountAmount).toBe(50);
    expect(updated.taxAmount).toBe(50.4);
    expect(updated.netTotal).toBe(410.4);
    expect(updated.remainingAmount).toBe(410.4);
    const synced = await db.requests.get(request.id);
    expect(synced?.netTotal).toBe(410.4);
    expect(synced?.taxAmount).toBe(50.4);
    expect(synced?.discountType).toBe('fixed');
    const current=await db.journalEntries.where('referenceId').equals(invoice.id).toArray();
    const active=current.filter(j=>j.referenceType==='invoice' && !j.reversalEntryId);
    expect(active).toHaveLength(1);
    expect(active[0].totalDebit).toBe(410.4);
    expect(active[0].totalCredit).toBe(410.4);
    const previous=await db.journalEntries.get(original.id);
    expect(previous?.status).toBe('reversed');
    const reversal=await db.journalEntries.get(previous!.reversalEntryId!);
    expect(reversal?.totalDebit).toBe(467.4);
    expect(reversal?.totalCredit).toBe(467.4);
  });

  it('persists percentage discount and configured zero tax consistently across invoice and request', async () => {
    const updated = await adjustUnpaidInvoice(invoice.id,41,0,'owner',{type:'percentage',value:10});
    expect(updated.netTotal).toBe(369);
    expect(updated.taxAmount).toBe(0);
    expect(updated.discountType).toBe('percentage');
    expect(updated.discountValue).toBe(10);
    const req=await db.requests.get(request.id);
    expect(req?.netTotal).toBe(369);
    expect(req?.discountType).toBe('percentage');
    expect(req?.discountValue).toBe(10);
  });

  it('updates patient invoice + medical request + item prices + journals in one transaction', async () => {
    await accountingService.recordInvoiceJournal(invoice,'owner');
    const requestItems = [
      {id:'r_cbc',requestId:request.id,testId:'cbc',price:200,commissionEligible:true},
      {id:'r_urea',requestId:request.id,testId:'urea',price:110,commissionEligible:true},
    ];
    const revisedItems = [
      { ...items[0], price:200 },
      { ...items[1], price:110 },
    ];
    const newInvoice:Invoice = {
      ...invoice,subtotal:310,discountType:'fixed',discountValue:50,
      discountAmount:50,taxRate:14,taxAmount:36.4,netTotal:296.4,
      remainingAmount:296.4,patientShareAmount:296.4,companyShareAmount:0,
    };
    const newRequest:LabRequest = {
      ...request,subtotal:310,discountType:'fixed',discountValue:50,
      discountAmount:50,taxRate:14,taxAmount:36.4,netTotal:296.4,
    };
    const corrected=await synchronizeUnpaidRequestInvoice(
      newRequest,requestItems,newInvoice,revisedItems,'owner');
    expect(corrected.netTotal).toBe(296.4);
    expect((await db.requests.get(request.id))?.netTotal).toBe(296.4);
    expect((await db.invoices.get(invoice.id))?.netTotal).toBe(296.4);
    expect((await db.invoiceItems.where('invoiceId').equals(invoice.id).count())).toBe(2);
    const current = await db.journalEntries.where('referenceId').equals(invoice.id).toArray();
    const active = current.filter(j=>j.referenceType==='invoice' && !j.reversalEntryId);
    expect(active).toHaveLength(1);
    expect(active[0].totalDebit).toBe(296.4);
    expect(active[0].totalCredit).toBe(296.4);
  });

  it('rolls back clinical and financial writes together when the original invoice is already collected', async () => {
    await db.invoices.put({...invoice,paidAmount:20,remainingAmount:447.4,status:'partial'});
    const revised={...request,subtotal:900,netTotal:900};
    await expect(synchronizeUnpaidRequestInvoice(
      revised, [{id:'ri_new',requestId:request.id,testId:'cbc',price:900,commissionEligible:true}],
      {...invoice,subtotal:900,netTotal:900},
      [{...items[0],price:900}],
      'owner',
    )).rejects.toThrow('PAID_INVOICE_REQUIRES_CREDIT_NOTE_AND_PAYMENT_REVERSAL');
    expect((await db.requests.get(request.id))?.subtotal).toBe(410);
    expect((await db.invoices.get(invoice.id))?.netTotal).toBe(467.4);
  });

  it('rejects changes to collected invoices without modifying their stored amount', async () => {
    await db.invoices.put({...invoice,paidAmount:100,remainingAmount:367.4,status:'partial'});
    await expect(adjustUnpaidInvoice(invoice.id,50,14,'owner')).rejects.toThrow('PAID_INVOICE_REQUIRES_CREDIT_NOTE_AND_PAYMENT_REVERSAL');
    expect((await db.invoices.get(invoice.id))?.netTotal).toBe(467.4);
  });
});
