import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { payDoctorCommission, reverseDoctorCommissionPayout } from '../../services/doctor-payout.service';
import type { DoctorCommission } from '../../types';

const payable: DoctorCommission = {
  id:'com_fin_regression',doctorId:'doc_regression',invoiceId:'inv_regression',
  invoiceNumber:'INV-REGRESSION',patientId:'pat_regression',date:'2026-11-20',
  invoiceNetTotal:500,referredItemsNet:500,collectedAmount:500,
  collectionRatio:1,collectedReferredBasis:500,commissionRate:20,
  commissionAmount:100,paidAmount:0,remainingAmount:100,status:'accrued',
};

describe('doctor payable payout and reversal accounting', () => {
  beforeEach(async () => {
    await db.commissions.delete(payable.id);
    const relevant=await db.journalEntries.where('referenceId').equals(payable.id).toArray();
    for (const row of relevant) await db.journalEntries.delete(row.id);
    await db.commissions.put(payable);
  });

  it('requires a valid date and prevents payouts without an outstanding balance', async () => {
    await expect(payDoctorCommission(payable.id,'2026-02-30','','Dr Test','Dr Test','owner')).rejects.toThrow('INVALID_PAYOUT_DATE');
    expect((await db.commissions.get(payable.id))?.status).toBe('accrued');
  });

  it('saves payout date/notes, posts balanced payable-to-cash journal, and reverses it without deletion', async () => {
    const paid=await payDoctorCommission(payable.id,'2026-11-20','Cheque 101','دكتور اختبار','Test Doctor','owner');
    expect(paid.payoutDate).toBe('2026-11-20');
    expect(paid.payoutNotes).toBe('Cheque 101');
    expect(paid.paidAmount).toBe(100);
    expect(paid.remainingAmount).toBe(0);
    expect(paid.status).toBe('paid');
    const original=await db.journalEntries.get(paid.payoutJournalId!);
    expect(original?.totalDebit).toBe(100);
    expect(original?.totalCredit).toBe(100);
    expect(original?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({accountCode:'2102',debit:100,credit:0}),
      expect.objectContaining({accountCode:'1201',debit:0,credit:100}),
    ]));
    await expect(payDoctorCommission(payable.id,'2026-11-20','','Dr Test','Dr Test','owner')).rejects.toThrow('COMMISSION_ALREADY_PAID_OR_NOT_FOUND');

    const reversed=await reverseDoctorCommissionPayout(payable.id,'Cancelled cheque','owner');
    expect(reversed.status).toBe('accrued');
    expect(reversed.paidAmount).toBe(0);
    expect(reversed.remainingAmount).toBe(100);
    expect(reversed.payoutCancelledAt).toBeTruthy();
    expect(reversed.payoutCancellationReason).toBe('Cancelled cheque');
    const originalAfter=await db.journalEntries.get(original!.id);
    expect(originalAfter?.status).toBe('reversed');
    const reversal=await db.journalEntries.get(originalAfter!.reversalEntryId!);
    expect(reversal?.referenceId).toBe(original?.id);
    expect(reversal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({accountCode:'2102',debit:0,credit:100}),
      expect.objectContaining({accountCode:'1201',debit:100,credit:0}),
    ]));
    await expect(reverseDoctorCommissionPayout(payable.id,'Again','owner')).rejects.toThrow('CANNOT_REVERSE_LEGACY_OR_UNPAID_COMMISSION');
  });
});
