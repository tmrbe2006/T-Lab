import { describe, expect, it } from 'vitest';
import { invoiceService } from '../../services/invoice.service';
import { computeInvoiceAdjustment } from '../../services/invoice-adjustment.service';

const tests = [
  { id:'cbc', price:180, commissionEligible:true },
  { id:'urea', price:110, commissionEligible:true },
  { id:'tsh', price:120, commissionEligible:false },
];

describe('request → invoice → journal monetary rules', () => {
  it('new request has no selected tests until user explicitly selects one', () => {
    expect(invoiceService.calculateInvoiceTotals([], 'none', 0, 14).netTotal).toBe(0);
  });

  it('changing the fixed discount immediately changes net and tax correctly', () => {
    const subtotal = invoiceService.calculateInvoiceTotals(tests, 'none', 0, 14);
    const discounted = invoiceService.calculateInvoiceTotals(tests, 'fixed', 50, 14);
    expect(subtotal.subtotal).toBe(410);
    expect(subtotal.taxAmount).toBe(57.4);
    expect(subtotal.netTotal).toBe(467.4);
    expect(discounted.discountAmount).toBe(50);
    expect(discounted.taxAmount).toBe(50.4);
    expect(discounted.netTotal).toBe(410.4);
    const linked = computeInvoiceAdjustment(410, 50, 14);
    expect(linked.taxAmount).toBe(discounted.taxAmount);
    expect(linked.netTotal).toBe(discounted.netTotal);
  });

  it('percentage discount and fixed amount yield consistent ledger amounts when equal', () => {
    const pct = invoiceService.calculateInvoiceTotals(tests, 'percentage', 10, 14);
    const fixed = invoiceService.calculateInvoiceTotals(tests, 'fixed', 41, 14);
    expect(pct.discountAmount).toBe(41);
    expect(pct.netTotal).toBe(fixed.netTotal);
    expect(pct.itemShares.reduce((sum, item) => sum + item.netAfterDiscountAndTax, 0)).toBeCloseTo(pct.netTotal, 2);
  });

  it('honors a zero percent tax configured in settings, never falling back to 14%', () => {
    const noTax=invoiceService.calculateInvoiceTotals(tests, 'fixed', 50, 0);
    expect(noTax.taxRate).toBe(0);
    expect(noTax.taxAmount).toBe(0);
    expect(noTax.netTotal).toBe(360);
    expect(computeInvoiceAdjustment(410, 50, 0).netTotal).toBe(360);
  });

  it('rejects invalid rates instead of silently recording contradictory totals', () => {
    expect(() => invoiceService.calculateInvoiceTotals(tests, 'none', 0, 150)).toThrow('INVALID_TAX_RATE');
    expect(() => invoiceService.calculateInvoiceTotals(tests, 'none', 0, -3)).toThrow('INVALID_TAX_RATE');
    expect(() => computeInvoiceAdjustment(410, 50, 150)).toThrow('INVALID_INVOICE_AMOUNT_OR_TAX');
  });

  it('separates patient and insurer shares while maintaining the full invoice total', () => {
    const total=invoiceService.calculateInvoiceTotals(tests,'fixed',50,14).netTotal;
    const patientShare=Math.round(total*20)/100;
    const companyShare=Math.round((total-patientShare)*100)/100;
    expect(patientShare).toBe(82.08);
    expect(companyShare).toBe(328.32);
    expect(patientShare+companyShare).toBe(total);
  });
});
