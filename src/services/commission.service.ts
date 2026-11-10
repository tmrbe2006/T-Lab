import { doctorsRepository, permissionsRepository } from '../repositories';
import type { Doctor, DoctorCommission, Invoice, InvoiceItem } from '../types';

export interface CommissionCalculationOutput {
  eligible: boolean;
  invoiceNetTotal: number;
  referredItemsNet: number;
  collectedAmount: number;
  collectionRatio: number;
  collectedReferredBasis: number;
  commissionRate: number;
  commissionAmount: number;
}

export class CommissionService {
  /**
   * Exact Doctor Commission Formula:
   * 1. Must be a 'referred' request linked to an active Doctor with commissionEnabled.
   * 2. Never calculated for 'internal' requests or unpaid invoices (paidAmount === 0).
   * 3. Distributes discount and tax proportionally across invoice items.
   * 4. Sums only referred items where commissionEligible === true.
   * 5. Multiplies by collectionRatio = paidAmount / invoiceNetTotal.
   * 6. Multiplies by doctor.commissionRate / 100.
   */
  calculateCommissionForInvoice(
    invoice: Invoice,
    items: InvoiceItem[],
    doctor?: Doctor,
    commissionIncludesTax = true
  ): CommissionCalculationOutput {
    if (
      invoice.requestType !== 'referred' ||
      !invoice.doctorId ||
      !doctor ||
      !doctor.active ||
      !doctor.commissionEnabled ||
      doctor.commissionRate <= 0 ||
      invoice.status === 'cancelled' ||
      invoice.paidAmount <= 0 ||
      invoice.netTotal <= 0
    ) {
      return {
        eligible: false,
        invoiceNetTotal: invoice.netTotal,
        referredItemsNet: 0,
        collectedAmount: invoice.paidAmount,
        collectionRatio: 0,
        collectedReferredBasis: 0,
        commissionRate: doctor?.commissionRate || 0,
        commissionAmount: 0,
      };
    }

    const collectionRatio = Math.min(1, Math.max(0, invoice.paidAmount / invoice.netTotal));
    const afterDiscountTotal = Math.max(0, invoice.subtotal - invoice.discountAmount);
    const baseInvoiceTotalForItems = commissionIncludesTax ? invoice.netTotal : afterDiscountTotal;

    let referredItemsNet = 0;
    for (const item of items) {
      if (!item.commissionEligible) continue;
      const itemRatio = invoice.subtotal > 0 ? item.price / invoice.subtotal : 0;
      const itemNetShare = baseInvoiceTotalForItems * itemRatio;
      referredItemsNet += itemNetShare;
    }

    referredItemsNet = Math.round(referredItemsNet * 100) / 100;
    const collectedReferredBasis = Math.round(referredItemsNet * collectionRatio * 100) / 100;
    const commissionAmount =
      Math.round(collectedReferredBasis * (doctor.commissionRate / 100) * 100) / 100;

    return {
      eligible: commissionAmount > 0,
      invoiceNetTotal: invoice.netTotal,
      referredItemsNet,
      collectedAmount: invoice.paidAmount,
      collectionRatio: Math.round(collectionRatio * 10000) / 10000,
      collectedReferredBasis,
      commissionRate: doctor.commissionRate,
      commissionAmount,
    };
  }

  /**
   * Synchronizes the commission record in IndexedDB whenever an invoice or payment changes.
   */
  async syncInvoiceCommission(invoice: Invoice, items: InvoiceItem[]): Promise<DoctorCommission | null> {
    if (!invoice.doctorId || invoice.requestType !== 'referred') {
      await doctorsRepository.deleteCommissionByInvoiceId(invoice.id);
      return null;
    }

    const doctor = await doctorsRepository.getById(invoice.doctorId);
    const settings = await permissionsRepository.getSettings();
    const includeTax = settings ? settings.commissionIncludesTax : true;

    const calc = this.calculateCommissionForInvoice(invoice, items, doctor, includeTax);
    if (!calc.eligible || !doctor) {
      await doctorsRepository.deleteCommissionByInvoiceId(invoice.id);
      return null;
    }

    const allExisting = await doctorsRepository.getAllCommissions();
    const existing = allExisting.find((c) => c.invoiceId === invoice.id);
    const alreadyPaid = existing ? existing.paidAmount : 0;
    const remaining = Math.max(0, Math.round((calc.commissionAmount - alreadyPaid) * 100) / 100);

    const record: DoctorCommission = {
      id: existing ? existing.id : `com_${Date.now()}`,
      doctorId: doctor.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      patientId: invoice.patientId,
      date: invoice.date,
      invoiceNetTotal: calc.invoiceNetTotal,
      referredItemsNet: calc.referredItemsNet,
      collectedAmount: calc.collectedAmount,
      collectionRatio: calc.collectionRatio,
      collectedReferredBasis: calc.collectedReferredBasis,
      commissionRate: calc.commissionRate,
      commissionAmount: calc.commissionAmount,
      paidAmount: alreadyPaid,
      remainingAmount: remaining,
      status: remaining === 0 && alreadyPaid > 0 ? 'paid' : alreadyPaid > 0 ? 'partial' : 'accrued',
    };

    await doctorsRepository.saveCommission(record);
    return record;
  }
}

export const commissionService = new CommissionService();
