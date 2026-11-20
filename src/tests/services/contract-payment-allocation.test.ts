import { describe, expect, it } from 'vitest';
import { paymentAllocation, checkPaymentAllowance } from '../../services/payment-allocation.service';
import type { Invoice, Payment } from '../../types';

const invoice = {
  id:'i1',netTotal:410.4,patientShareAmount:110.4,companyShareAmount:300,
  contractId:'insurance',paidAmount:0,status:'unpaid'
} as Invoice;
const paid = (payerType:'patient'|'contract',amount:number):Payment =>
  ({id:'p'+payerType,payerType,amount,status:'active'}) as Payment;

describe('contract receivables and separate patient/insurance collection',()=>{
  it('splits contract dues without changing the invoice net amount',()=>{
    expect(paymentAllocation(invoice,[])).toMatchObject({patientDue:110.4,companyDue:300});
    expect(paymentAllocation(invoice,[paid('patient',100),paid('contract',60)])).toMatchObject({
      patientDue:10.4,companyDue:240,patientPaid:100,companyPaid:60,
    });
  });
  it('prevents patient payment from clearing remaining insurer claims',()=>{
    const prior=[paid('patient',100)];
    expect(checkPaymentAllowance(invoice,prior,'patient',10.4)).toBe(10.4);
    expect(()=>checkPaymentAllowance(invoice,prior,'patient',11)).toThrow('PAYMENT_EXCEEDS_PAYER_SHARE');
    expect(checkPaymentAllowance(invoice,prior,'contract',240)).toBe(240);
    expect(()=>checkPaymentAllowance({...invoice,status:'cancelled'},[], 'patient',10)).toThrow('CANCELLED_INVOICE');
  });
  it('refuses collections from unreconciled historical payments',()=>{
    expect(()=>checkPaymentAllowance({...invoice,paidAmount:100},[],'patient',10)).toThrow('LEGACY_PAYMENT_RECONCILIATION_REQUIRED');
  });
});
