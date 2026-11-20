import { db } from '../db/database';
import { discountService } from './discount.service';
import { accountingService } from './accounting.service';
import type { Invoice, InvoiceItem, JournalEntry } from '../types';

const cents=(n:number)=>Math.round(n*100)/100;

export function computeInvoiceAdjustment(subtotal:number,discountAmount:number,taxRate:number) {
  if (![subtotal,discountAmount,taxRate].every(Number.isFinite) || subtotal<0 || discountAmount<0 || taxRate<0 || taxRate>100) {
    throw new Error('INVALID_INVOICE_AMOUNT_OR_TAX');
  }
  const cleanSubtotal=cents(subtotal);
  const discount=cents(Math.min(cleanSubtotal,discountAmount));
  const taxable=cents(cleanSubtotal-discount);
  const taxAmount=cents(taxable*taxRate/100);
  return {subtotal:cleanSubtotal,discountAmount:discount,taxRate,taxAmount,netTotal:cents(taxable+taxAmount)};
}

function reversalOf(original:JournalEntry,actor:string):JournalEntry {
  return {
    ...original,id:'je_rev_'+crypto.randomUUID(),
    entryNumber:'JE-REV-'+Date.now(),
    date:new Date().toISOString().slice(0,10),
    entryType:'reversal',referenceType:'reversal',referenceId:original.id,
    referenceNumber:original.entryNumber,
    descriptionAr:'عكس قيد فاتورة لتصحيح الخصم والضريبة: '+original.entryNumber,
    descriptionEn:'Reverse invoice journal for discount/tax correction: '+original.entryNumber,
    lines:original.lines.map(l=>({...l,debit:l.credit,credit:l.debit})),
    status:'posted',reversalEntryId:undefined,createdBy:actor,
  };
}

/** Atomic local pilot adjustment. Paid invoices must use a separate refund/credit-note workflow. */
export async function adjustUnpaidInvoice(
  invoiceId:string, discountAmount:number, taxRate:number, actor:string,
):Promise<Invoice>{
  return db.transaction('rw',db.invoices,db.invoiceItems,db.requests,db.journalEntries,db.payments,db.corporateContracts,async()=>{
    const original=await db.invoices.get(invoiceId);
    if (!original) throw new Error('INVOICE_NOT_FOUND');
    const payments=await db.payments.where('invoiceId').equals(invoiceId).toArray();
    if (payments.some(p=>p.status==='active') || original.paidAmount>0 || original.status==='paid') {
      throw new Error('PAID_INVOICE_REQUIRES_CREDIT_NOTE_AND_PAYMENT_REVERSAL');
    }
    const items=await db.invoiceItems.where('invoiceId').equals(invoiceId).toArray();
    if (!items.length) throw new Error('INVOICE_HAS_NO_TEST_ITEMS');
    const subtotal=cents(items.reduce((s,it)=>s+(Number(it.price)||0),0));
    const amount=computeInvoiceAdjustment(subtotal,discountAmount,taxRate);
    const contract=original.contractId?await db.corporateContracts.get(original.contractId):null;
    const pct=contract?Math.max(0,Math.min(100,Number(contract.patientCoPayPercent)||0)):100;
    const patientShareAmount=cents(amount.netTotal*pct/100);
    const companyShareAmount=cents(amount.netTotal-patientShareAmount);
    const updated:Invoice={
      ...original,...amount,discountType:amount.discountAmount>0?'fixed':'none',
      discountValue:amount.discountAmount,patientShareAmount,companyShareAmount,
      paidAmount:0,remainingAmount:amount.netTotal,status:'unpaid',
    };
    await db.invoices.put(updated);
    const newItems:InvoiceItem[]=items.map(item=>({
      ...item,netAfterDiscountAndTax:subtotal>0?cents(amount.netTotal*item.price/subtotal):0,
    }));
    // Keep distribution cent-balanced for doctors' commission calculation.
    if(newItems.length){
      const diff=cents(amount.netTotal-newItems.reduce((s,it)=>s+it.netAfterDiscountAndTax,0));
      newItems[newItems.length-1].netAfterDiscountAndTax=cents(newItems[newItems.length-1].netAfterDiscountAndTax+diff);
      await db.invoiceItems.bulkPut(newItems);
    }
    const request=await db.requests.get(original.requestId);
    if(request){
      await db.requests.put({
        ...request,subtotal:amount.subtotal,discountType:updated.discountType,
        discountValue:updated.discountValue,discountAmount:amount.discountAmount,
        taxRate:amount.taxRate,taxAmount:amount.taxAmount,netTotal:amount.netTotal,
        patientShareAmount,companyShareAmount,
      });
    }
    const existingJournals=await db.journalEntries.where('referenceId').equals(invoiceId).toArray();
    for(const journal of existingJournals.filter(j=>j.referenceType==='invoice' && !j.reversalEntryId)){
      const reversed=reversalOf(journal,actor);
      await db.journalEntries.put({...journal,status:'reversed',reversalEntryId:reversed.id});
      await db.journalEntries.put(reversed);
    }
    await accountingService.recordInvoiceJournal(updated,actor);
    return updated;
  });
}
