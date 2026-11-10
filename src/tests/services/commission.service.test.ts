import { describe, it, expect, beforeEach } from 'vitest';
import { CommissionService } from '../../services/commission.service';
import { db } from '../../db/database';
import type { Invoice, InvoiceItem, Doctor } from '../../types';

describe('CommissionService', () => {
  const commissionService = new CommissionService();

  const mockDoctor: Doctor = {
    id: 'doc-1',
    code: 'DOC-001',
    nameAr: 'د. أحمد محمد',
    nameEn: 'Dr. Ahmed Mohamed',
    specialty: 'باطنة / Internal Medicine',
    phone: '01000000000',
    type: 'referred',
    commissionEnabled: true,
    commissionRate: 10,
    notes: '',
    active: true,
  };

  beforeEach(async () => {
    await db.doctors.clear();
    await db.commissions.clear();
  });

  describe('calculateCommissionForInvoice', () => {
    it('يجب ألا يحسب عمولة للفواتير غير المدفوعة', () => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-001',
        requestId: '1',
        patientId: '1',
        doctorId: 'doc-1',
        requestType: 'referred',
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'none',
        discountValue: 0,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        netTotal: 1000,
        paidAmount: 0, // غير مدفوع
        remainingAmount: 1000,
        paymentMethod: 'cash',
        status: 'unpaid',
        notes: '',
        createdBy: 'admin',
      };

      const items: InvoiceItem[] = [
        {
          id: 'item-1',
          invoiceId: '1',
          testId: 'test-1',
          testNameAr: 'صورة دم كاملة',
          testNameEn: 'Complete Blood Count',
          price: 1000,
          netAfterDiscountAndTax: 1000,
          commissionEligible: true,
        },
      ];

      const result = commissionService.calculateCommissionForInvoice(invoice, items, mockDoctor);
      expect(result.commissionAmount).toBe(0);
    });

    it('يجب أن يحسب العمولة على المبلغ المحصل فقط', () => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-001',
        requestId: '1',
        patientId: '1',
        doctorId: 'doc-1',
        requestType: 'referred',
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'none',
        discountValue: 0,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        netTotal: 1000,
        paidAmount: 500, // مدفوع نصف المبلغ
        remainingAmount: 500,
        paymentMethod: 'cash',
        status: 'partial',
        notes: '',
        createdBy: 'admin',
      };

      const items: InvoiceItem[] = [
        {
          id: '1',
          invoiceId: '1',
          testId: '1',
          testNameAr: 'صورة دم',
          testNameEn: 'CBC',
          price: 1000,
          netAfterDiscountAndTax: 1000,
          commissionEligible: true,
        },
      ];

      const result = commissionService.calculateCommissionForInvoice(invoice, items, mockDoctor);
      // العمولة = 500 * 10% = 50
      expect(result.commissionAmount).toBe(50);
    });

    it('يجب ألا يحسب عمولة للطلبات الداخلية', () => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-001',
        requestId: '1',
        patientId: '1',
        requestType: 'internal', // داخلي
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'none',
        discountValue: 0,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        netTotal: 1000,
        paidAmount: 1000,
        remainingAmount: 0,
        paymentMethod: 'cash',
        status: 'paid',
        notes: '',
        createdBy: 'admin',
      };

      const result = commissionService.calculateCommissionForInvoice(invoice, [], mockDoctor);
      expect(result.commissionAmount).toBe(0);
    });

    it('يجب أن يوزع الخصم والضريبة بالتناسب', () => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-001',
        requestId: '1',
        patientId: '1',
        doctorId: 'doc-1',
        requestType: 'referred',
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'percentage',
        discountValue: 10,
        discountAmount: 100, // خصم 100
        taxRate: 14,
        taxAmount: 126, // ضريبة 14% على 900
        netTotal: 1026,
        paidAmount: 1026,
        remainingAmount: 0,
        paymentMethod: 'cash',
        status: 'paid',
        notes: '',
        createdBy: 'admin',
      };

      const items: InvoiceItem[] = [
        {
          id: '1',
          invoiceId: '1',
          testId: '1',
          testNameAr: 'صورة دم',
          testNameEn: 'CBC',
          price: 600, // 60% من الإجمالي
          netAfterDiscountAndTax: 615.6,
          commissionEligible: true,
        },
        {
          id: '2',
          invoiceId: '1',
          testId: '2',
          testNameAr: 'سكر',
          testNameEn: 'Glucose',
          price: 400, // 40% من الإجمالي
          netAfterDiscountAndTax: 410.4,
          commissionEligible: false, // غير خاضع للعمولة
        },
      ];

      const result = commissionService.calculateCommissionForInvoice(invoice, items, mockDoctor);
      // الفحص الأول فقط خاضع للعمولة: 615.6 * 10% = 61.56
      expect(result.commissionAmount).toBeCloseTo(61.56, 2);
    });

    it('يجب أن يدعم حساب العمولة بدون ضريبة', () => {
      const invoice: Invoice = {
        id: '1',
        invoiceNumber: 'INV-002',
        requestId: '1',
        patientId: '1',
        doctorId: 'doc-1',
        requestType: 'referred',
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'percentage',
        discountValue: 10,
        discountAmount: 100,
        taxRate: 14,
        taxAmount: 126,
        netTotal: 1026,
        paidAmount: 1026,
        remainingAmount: 0,
        paymentMethod: 'cash',
        status: 'paid',
        notes: '',
        createdBy: 'admin',
      };

      const items: InvoiceItem[] = [
        {
          id: '1',
          invoiceId: '1',
          testId: '1',
          testNameAr: 'صورة دم',
          testNameEn: 'CBC',
          price: 1000,
          netAfterDiscountAndTax: 1026,
          commissionEligible: true,
        },
      ];

      // بدون ضريبة: وعاء العمولة = 1000 - 100 = 900 -> 10% = 90
      const withoutTax = commissionService.calculateCommissionForInvoice(
        invoice,
        items,
        mockDoctor,
        false
      );
      expect(withoutTax.commissionAmount).toBe(90);
    });
  });

  describe('syncInvoiceCommission', () => {
    it('يجب أن يحفظ سجل العمولة في قاعدة البيانات للفواتير الخارجية المحصلة', async () => {
      await db.doctors.put(mockDoctor);

      const invoice: Invoice = {
        id: 'inv-sync-1',
        invoiceNumber: 'INV-SYNC-001',
        requestId: 'req-1',
        patientId: 'pat-1',
        doctorId: mockDoctor.id,
        requestType: 'referred',
        date: '2026-01-01',
        subtotal: 1000,
        discountType: 'none',
        discountValue: 0,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        netTotal: 1000,
        paidAmount: 1000,
        remainingAmount: 0,
        paymentMethod: 'cash',
        status: 'paid',
        notes: '',
        createdBy: 'admin',
      };

      const items: InvoiceItem[] = [
        {
          id: 'item-sync-1',
          invoiceId: 'inv-sync-1',
          testId: 'test-1',
          testNameAr: 'صورة دم',
          testNameEn: 'CBC',
          price: 1000,
          netAfterDiscountAndTax: 1000,
          commissionEligible: true,
        },
      ];

      const record = await commissionService.syncInvoiceCommission(invoice, items);
      expect(record).not.toBeNull();
      expect(record?.commissionAmount).toBe(100);
      expect(record?.status).toBe('accrued');

      // في حال تحولت الفاتورة إلى داخلية يتم حذف العمولة غير المدفوعة
      const internalInvoice: Invoice = { ...invoice, requestType: 'internal' };
      const cleared = await commissionService.syncInvoiceCommission(internalInvoice, items);
      expect(cleared).toBeNull();
    });
  });
});
