import { describe, expect, it } from 'vitest';
import { InvoiceService } from '../../services/invoice.service';
import { computeInvoiceAdjustment } from '../../services/invoice-adjustment.service';
import { validateManualJournal } from '../../services/manual-journal.service';

describe('Financial recalculation regression', () => {
  const invoice = new InvoiceService();
  const tests=[{id:'cbc',price:180,commissionEligible:true},{id:'urea',price:110,commissionEligible:true}];
  it('no selected tests means zero instead of hidden automatic selection',()=>{
    const result=invoice.calculateInvoiceTotals([],'none',0,14);
    expect(result.subtotal).toBe(0);
    expect(result.netTotal).toBe(0);
  });
  it('recomputes discount, configured tax 14% and zero percent correctly',()=>{
    expect(invoice.calculateInvoiceTotals(tests,'fixed',50,14).netTotal).toBe(273.6);
    expect(invoice.calculateInvoiceTotals(tests,'fixed',50,14).taxAmount).toBe(33.6);
    expect(invoice.calculateInvoiceTotals(tests,'fixed',50,0).netTotal).toBe(240);
    expect(invoice.calculateInvoiceTotals(tests,'percentage',10,14).netTotal).toBe(297.54);
    expect(invoice.calculateInvoiceTotals(tests,'percentage',10,0).netTotal).toBe(261);
    expect(invoice.calculateInvoiceTotals(tests,'fixed',5000,14).netTotal).toBe(0);
  });
  it('invoice adjustment validates and caps fixed discount and VAT',()=>{
    expect(computeInvoiceAdjustment(410,50,14)).toMatchObject({
      subtotal:410,discountAmount:50,taxAmount:50.4,netTotal:410.4,
    });
    expect(computeInvoiceAdjustment(410,50,0).netTotal).toBe(360);
    expect(computeInvoiceAdjustment(100,150,14).netTotal).toBe(0);
    expect(()=>computeInvoiceAdjustment(100,0,-1)).toThrow();
    expect(()=>computeInvoiceAdjustment(100,0,101)).toThrow();
  });
  it('requires positive balanced manual debit and credit to different valid accounts',()=>{
    const input={date:'2026-11-20',descriptionAr:'قيد يدوي',debitCode:'1101',creditCode:'4101',amount:250};
    expect(validateManualJournal(input).amount).toBe(250);
    expect(()=>validateManualJournal({...input,amount:0})).toThrow();
    expect(()=>validateManualJournal({...input,creditCode:'1101'})).toThrow();
    expect(()=>validateManualJournal({...input,date:'2026-02-31'})).toThrow();
  });
});
