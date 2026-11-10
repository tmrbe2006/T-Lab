import { discountService } from './discount.service';
import type { DiscountType, InvoiceStatus, LabTest } from '../types';

export interface InvoiceMathBreakdown {
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxableAfterDiscount: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  paidAmount: number;
  remainingAmount: number;
  status: InvoiceStatus;
  itemShares: Array<{
    testId: string;
    price: number;
    proportion: number;
    netAfterDiscount: number;
    netAfterDiscountAndTax: number;
    commissionEligible: boolean;
  }>;
}

export class InvoiceService {
  /**
   * Calculates full invoice math:
   * 1. Subtotal = sum of test prices before discount & tax.
   * 2. Discount = percentage or fixed, capped so net never goes negative.
   * 3. Tax = calculated strictly AFTER discount.
   * 4. Net Total = Subtotal - Discount + Tax.
   * 5. Distributes Discount and Tax proportionally across each line item.
   * Note: Doctor commission is NEVER displayed or deducted from the invoice.
   */
  calculateInvoiceTotals(
    selectedTests: Pick<LabTest, 'id' | 'price' | 'commissionEligible'>[],
    discountType: DiscountType,
    discountValue: number,
    taxRate: number,
    paidAmount = 0
  ): InvoiceMathBreakdown {
    const subtotal = Math.round(
      selectedTests.reduce((sum, t) => sum + (Number(t.price) || 0), 0) * 100
    ) / 100;

    const disc = discountService.calculateDiscount(subtotal, discountType, discountValue);
    const cleanTaxRate = Math.max(0, Number(taxRate) || 0);
    const taxAmount = Math.round(disc.afterDiscount * (cleanTaxRate / 100) * 100) / 100;
    const netTotal = Math.round((disc.afterDiscount + taxAmount) * 100) / 100;

    const cleanPaid = Math.min(netTotal, Math.max(0, Math.round((Number(paidAmount) || 0) * 100) / 100));
    const remainingAmount = Math.max(0, Math.round((netTotal - cleanPaid) * 100) / 100);

    let status: InvoiceStatus = 'unpaid';
    if (netTotal > 0 && cleanPaid >= netTotal) {
      status = 'paid';
    } else if (cleanPaid > 0 && cleanPaid < netTotal) {
      status = 'partial';
    }

    const itemShares = selectedTests.map((t) => {
      const proportion = subtotal > 0 ? t.price / subtotal : 0;
      const netAfterDiscount = Math.round(disc.afterDiscount * proportion * 100) / 100;
      const netAfterDiscountAndTax = Math.round(netTotal * proportion * 100) / 100;
      return {
        testId: t.id,
        price: t.price,
        proportion,
        netAfterDiscount,
        netAfterDiscountAndTax,
        commissionEligible: t.commissionEligible,
      };
    });

    return {
      subtotal,
      discountType: disc.discountType,
      discountValue: disc.discountValue,
      discountAmount: disc.discountAmount,
      taxableAfterDiscount: disc.afterDiscount,
      taxRate: cleanTaxRate,
      taxAmount,
      netTotal,
      paidAmount: cleanPaid,
      remainingAmount,
      status,
      itemShares,
    };
  }
}

export const invoiceService = new InvoiceService();
