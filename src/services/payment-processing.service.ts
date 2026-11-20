import { db } from '../db/database';
import { accountingService } from './accounting.service';
import { checkPaymentAllowance, type PaymentPayer } from './payment-allocation.service';
import type { Invoice, Payment, PaymentMethod } from '../types';

export interface RecordReceiptInput {
  invoiceId:string;
  payerType:PaymentPayer;
  amount:number;
  method:PaymentMethod;
  actor:string;
  notes:string;
}
export async function recordInvoiceReceipt(input:RecordReceiptInput):Promise<{invoice:Invoice;payment:Payment}>{
  if(!['cash','card','bank_transfer'].includes(input.method))throw new Error('INVALID_PAYMENT_METHOD');
  if(!input.actor||input.notes.length>1000)throw new Error('INVALID_PAYMENT_NOTE');
  return db.transaction('rw',[db.invoices,db.payments,db.journalEntries],async()=>{
    const invoice=await db.invoices.get(input.invoiceId);
    if(!invoice)throw new Error('INVOICE_NOT_FOUND');
    const old=await db.payments.where('invoiceId').equals(input.invoiceId).toArray();
    const amount=checkPaymentAllowance(invoice,old,input.payerType,input.amount);
    const paid=Math.round((invoice.paidAmount+amount)*100)/100;
    if(paid>invoice.netTotal+0.01)throw new Error('PAYMENT_EXCEEDS_INVOICE');
    const remaining=Math.max(0,Math.round((invoice.netTotal-paid)*100)/100);
    const updated:Invoice={
      ...invoice,paidAmount:paid,remainingAmount:remaining,
      paymentMethod:input.method,status:remaining===0?'paid':'partial',
    };
    const id='pay_'+crypto.randomUUID();
    const payment:Payment={
      id,paymentNumber:'PAY-'+Date.now()+'-'+id.slice(-4),
      invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,
      patientId:invoice.patientId,date:new Date().toLocaleDateString('en-CA'),
      amount,method:input.method,payerType:input.payerType,
      createdBy:input.actor,status:'active',notes:input.notes,
    };
    await db.payments.put(payment);
    await db.invoices.put(updated);
    await accountingService.recordPaymentJournal(payment,input.actor);
    return {invoice:updated,payment};
  });
}
