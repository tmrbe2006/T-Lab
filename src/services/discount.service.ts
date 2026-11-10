import type { DiscountType, Patient } from '../types';

export interface DiscountCalculationResult {
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  afterDiscount: number;
  wasCapped: boolean;
}

export class DiscountService {
  /**
   * Resolves initial discount settings from a Patient record.
   */
  getPatientDefaultDiscount(patient?: Patient): { type: DiscountType; value: number } {
    if (!patient || !patient.hasDefaultDiscount || patient.defaultDiscountType === 'none') {
      return { type: 'none', value: 0 };
    }
    return {
      type: patient.defaultDiscountType,
      value: Math.max(0, Number(patient.defaultDiscountValue) || 0),
    };
  }

  /**
   * Calculates the discount amount ensuring the net after discount is never negative.
   */
  calculateDiscount(
    subtotal: number,
    discountType: DiscountType,
    discountValue: number
  ): DiscountCalculationResult {
    const cleanSubtotal = Math.max(0, Number(subtotal) || 0);
    const cleanVal = Math.max(0, Number(discountValue) || 0);

    let rawDiscount = 0;
    if (discountType === 'percentage') {
      const pct = Math.min(100, cleanVal);
      rawDiscount = (cleanSubtotal * pct) / 100;
    } else if (discountType === 'fixed') {
      rawDiscount = cleanVal;
    }

    const cappedDiscount = Math.min(cleanSubtotal, Math.max(0, rawDiscount));
    const discountAmount = Math.round(cappedDiscount * 100) / 100;
    const afterDiscount = Math.round((cleanSubtotal - discountAmount) * 100) / 100;

    return {
      discountType,
      discountValue: discountType === 'percentage' ? Math.min(100, cleanVal) : cleanVal,
      discountAmount,
      afterDiscount,
      wasCapped: rawDiscount > cleanSubtotal,
    };
  }
}

export const discountService = new DiscountService();
