import type { Invoice, Payment } from '../types';
const cents=(n:number)=>Math.round(n*100)/100;

export type PaymentPayer = 'patient'|'contract';
/** Remaining receivables are computed separately; a patient receipt cannot clear an insurer claim. */
export function paymentAllocation(invoice:Invoice, payments:readonly Payment[]) {
  const net=cents(invoice.netTotal);
  const company=invoice.contractId
    ?Math.max(0,Math.min(net,cents(Number(invoice.companyShareAmount)||0)))
    :0;
  const patient=cents(net-company);
  const active=payments.filter(p=>p.status==='active');
  const patientPaid=cents(active.filter(p=>p.payerType!=='contract').reduce((s,p)=>s+p.amount,0));
  const companyPaid=cents(active.filter(p=>p.payerType==='contract').reduce((s,p)=>s+p.amount,0));
  return {
    patientDue:cents(Math.max(0,patient-patientPaid)),
    companyDue:cents(Math.max(0,company-companyPaid)),
    patientShare:patient,companyShare:company,
    patientPaid,companyPaid,
  };
}
export function checkPaymentAllowance(
  invoice:Invoice,payments:readonly Payment[],payerType:PaymentPayer,amount:number,
):number{
  if(invoice.status==='cancelled')throw new Error('CANCELLED_INVOICE');
  if(!Number.isFinite(amount)||amount<=0||cents(amount)<=0)throw new Error('INVALID_PAYMENT_AMOUNT');
  if(payerType==='contract'&&!invoice.contractId)throw new Error('NO_CONTRACT_ON_INVOICE');
  const due=paymentAllocation(invoice,payments);
  if(cents(amount)>(payerType==='contract'?due.companyDue:due.patientDue)){
    throw new Error('PAYMENT_EXCEEDS_PAYER_SHARE');
  }
  return cents(amount);
}
