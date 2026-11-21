import { useMySQLStore } from '../repositories/mysql-all-stores.read';
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
  if(useMySQLStore()){
    const response=await fetch('/api/branch-pilot/finance/receipt',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({invoiceId:input.invoiceId,payerType:input.payerType,
        amount:input.amount,method:input.method,notes:input.notes}),
    });
    const result=await response.json() as {
      ok?:boolean;source?:string;error?:string;invoice?:Invoice;payment?:Payment
    };
    if(!response.ok||result.ok!==true)throw new Error(result.error||'MYSQL_RECEIPT_FAILED');
    if(result.source!=='mysql'||!result.invoice||!result.payment)
      throw new Error('MYSQL_RECEIPT_RESPONSE_INVALID');
    return {invoice:result.invoice,payment:result.payment};
  }
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
