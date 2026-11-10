import { describe, it, expect } from 'vitest';
import { DiscountService } from '../../services/discount.service';
import type { Patient } from '../../types';

describe('DiscountService', () => {
  const discountService = new DiscountService();

  describe('getPatientDefaultDiscount', () => {
    it('يجب أن يعيد خصم صفري عند عدم وجود مريض أو عدم تفعيل خصم المريض', () => {
      expect(discountService.getPatientDefaultDiscount()).toEqual({
        type: 'none',
        value: 0,
      });

      const patientWithoutDiscount: Patient = {
        id: 'pat-1',
        code: 'PT-001',
        name: 'محمد علي',
        gender: 'male',
        birthDate: '1991-01-01',
        age: 35,
        nationalId: '29101010000000',
        phone: '01012345678',
        address: 'القاهرة',
        notes: '',
        hasDefaultDiscount: false,
        defaultDiscountType: 'percentage',
        defaultDiscountValue: 20,
        active: true,
        createdAt: new Date().toISOString(),
      };

      expect(discountService.getPatientDefaultDiscount(patientWithoutDiscount)).toEqual({
        type: 'none',
        value: 0,
      });
    });

    it('يجب أن يعيد الخصم الافتراضي للمريض عند تفعيله', () => {
      const patientWithDiscount: Patient = {
        id: 'pat-2',
        code: 'PT-002',
        name: 'سارة حسن',
        gender: 'female',
        birthDate: '1997-01-01',
        age: 29,
        nationalId: '29701010000000',
        phone: '01099998888',
        address: 'الإسكندرية',
        notes: '',
        hasDefaultDiscount: true,
        defaultDiscountType: 'percentage',
        defaultDiscountValue: 15,
        active: true,
        createdAt: new Date().toISOString(),
      };

      expect(discountService.getPatientDefaultDiscount(patientWithDiscount)).toEqual({
        type: 'percentage',
        value: 15,
      });
    });
  });

  describe('calculateDiscount', () => {
    it('يجب أن يحسب الخصم النسبي والثابت ويمنع القيم السالبة أو المتجاوزة للإجمالي', () => {
      const perc = discountService.calculateDiscount(1000, 'percentage', 20);
      expect(perc.discountAmount).toBe(200);
      expect(perc.afterDiscount).toBe(800);

      const cappedPerc = discountService.calculateDiscount(1000, 'percentage', 150);
      expect(cappedPerc.discountValue).toBe(100);
      expect(cappedPerc.discountAmount).toBe(1000);
      expect(cappedPerc.afterDiscount).toBe(0);

      const fixed = discountService.calculateDiscount(500, 'fixed', 120);
      expect(fixed.discountAmount).toBe(120);
      expect(fixed.afterDiscount).toBe(380);
      expect(fixed.wasCapped).toBe(false);

      const cappedFixed = discountService.calculateDiscount(500, 'fixed', 700);
      expect(cappedFixed.discountAmount).toBe(500);
      expect(cappedFixed.afterDiscount).toBe(0);
      expect(cappedFixed.wasCapped).toBe(true);

      const zeroSub = discountService.calculateDiscount(0, 'percentage', 15);
      expect(zeroSub.discountAmount).toBe(0);
      expect(zeroSub.afterDiscount).toBe(0);
    });
  });
});
