import { describe, it, expect } from 'vitest';
import { InvoiceService } from '../../services/invoice.service';

describe('InvoiceService', () => {
  const invoiceService = new InvoiceService();

  describe('calculateInvoiceTotals', () => {
    it('يجب أن يحسب الإجمالي الصافي بشكل صحيح بدون خصم أو ضريبة', () => {
      const tests = [
        { id: '1', price: 300, commissionEligible: true },
        { id: '2', price: 200, commissionEligible: true },
      ];

      const result = invoiceService.calculateInvoiceTotals(tests, 'none', 0, 0);

      expect(result.subtotal).toBe(500);
      expect(result.discountAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.netTotal).toBe(500);
      expect(result.status).toBe('unpaid');
    });

    it('يجب أن يحسب الخصم النسبي بشكل صحيح', () => {
      const tests = [{ id: '1', price: 1000, commissionEligible: true }];

      const result = invoiceService.calculateInvoiceTotals(tests, 'percentage', 15, 0);

      expect(result.subtotal).toBe(1000);
      expect(result.discountAmount).toBe(150);
      expect(result.netTotal).toBe(850);
    });

    it('يجب أن يحسب الضريبة بعد الخصم وليس قبله', () => {
      const tests = [{ id: '1', price: 1000, commissionEligible: true }];

      const result = invoiceService.calculateInvoiceTotals(tests, 'percentage', 10, 14);

      expect(result.subtotal).toBe(1000);
      expect(result.discountAmount).toBe(100);
      // الضريبة = (1000 - 100) * 14% = 126
      expect(result.taxAmount).toBe(126);
      expect(result.netTotal).toBe(1026);
    });

    it('يجب ألا يسمح بإجمالي سالب', () => {
      const tests = [{ id: '1', price: 100, commissionEligible: true }];

      const result = invoiceService.calculateInvoiceTotals(tests, 'fixed', 200, 0);

      expect(result.netTotal).toBeGreaterThanOrEqual(0);
      expect(result.netTotal).toBe(0);
    });

    it('يجب أن يحدد حالة الفاتورة (unpaid, partial, paid) ويوزع حصص العناصر', () => {
      const tests = [
        { id: '1', price: 600, commissionEligible: true },
        { id: '2', price: 400, commissionEligible: false },
      ];

      const partial = invoiceService.calculateInvoiceTotals(tests, 'none', 0, 0, 400);
      expect(partial.status).toBe('partial');
      expect(partial.remainingAmount).toBe(600);

      const paid = invoiceService.calculateInvoiceTotals(tests, 'none', 0, 0, 1000);
      expect(paid.status).toBe('paid');
      expect(paid.remainingAmount).toBe(0);
      expect(paid.itemShares).toHaveLength(2);
      expect(paid.itemShares[0].netAfterDiscountAndTax).toBe(600);
      expect(paid.itemShares[1].netAfterDiscountAndTax).toBe(400);
    });
  });
});
