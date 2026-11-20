import { db } from '../db/database';
import { accountingService } from './accounting.service';
import { computeInvoiceAdjustment } from './invoice-adjustment.service';
import type { Invoice, InvoiceItem } from '../types';

export interface ManualInvoiceInput {
  patientId:string;
  date:string;
  serviceName:string;
  price:number;
  discountAmount:number;
  taxRate:number;
  contractId?:string;
}
export async function createManualInvoice(input:ManualInvoiceInput,actor:string):Promise<Invoice>{
  if(!input.patientId || !input.serviceName.trim() || input.serviceName.length>200 ||
     !/^20\d\d-\d\d-\d\d$/.test(input.date) ||
     !Number.isFinite(input.price) || input.price<=0) throw new Error('INVALID_MANUAL_INVOICE_DETAILS');
  const values=computeInvoiceAdjustment(input.price,input.discountAmount,input.taxRate);
  return db.transaction('rw',[db.invoices,db.invoiceItems,db.journalEntries,db.patients,db.corporateContracts],async()=>{
    const patient=await db.patients.get(input.patientId);
    if(!patient || !patient.active)throw new Error('PATIENT_NOT_FOUND');
    const contract=input.contractId?await db.corporateContracts.get(input.contractId):undefined;
    if(input.contractId && !contract)throw new Error('CONTRACT_NOT_FOUND');
    const pct=contract?Math.max(0,Math.min(100,Number(contract.patientCoPayPercent)||0)):100;
    const patientShareAmount=Math.round(values.netTotal*pct)/100;
    const companyShareAmount=Math.round((values.netTotal-patientShareAmount)*100)/100;
    const uuid=crypto.randomUUID();
    const id='inv_manual_'+uuid;
    const invoice:Invoice={
      id,invoiceNumber:'INV-M-'+Date.now()+'-'+uuid.slice(0,5).toUpperCase(),
      requestId:'',patientId:input.patientId,requestType:'internal',
      date:input.date,subtotal:values.subtotal,
      discountType:values.discountAmount>0?'fixed':'none',
      discountValue:values.discountAmount,discountAmount:values.discountAmount,
      taxRate:values.taxRate,taxAmount:values.taxAmount,netTotal:values.netTotal,
      paidAmount:0,remainingAmount:values.netTotal,status:'unpaid',
      paymentMethod:'cash',createdBy:actor,notes:'فاتورة خدمات مستقلة: '+input.serviceName.trim(),
      contractId:contract?.id,contractName:contract?.nameAr,
      patientShareAmount,companyShareAmount,
    };
    const item:InvoiceItem={
      id:'ii_manual_'+uuid,invoiceId:id,testId:'manual_service',
      testNameAr:input.serviceName.trim(),testNameEn:input.serviceName.trim(),
      price:values.subtotal,netAfterDiscountAndTax:values.netTotal,
      commissionEligible:false,
    };
    await db.invoices.put(invoice);
    await db.invoiceItems.put(item);
    await accountingService.recordInvoiceJournal(invoice,actor);
    return invoice;
  });
}
