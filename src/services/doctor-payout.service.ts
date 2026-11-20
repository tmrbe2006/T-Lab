import { db } from '../db/database';
import { accountingService } from './accounting.service';
import type { DoctorCommission, JournalEntry } from '../types';

const datePattern = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function assertDate(date: string): void {
  if (!datePattern.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00Z')) ||
      new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date) {
    throw new Error('INVALID_PAYOUT_DATE');
  }
}
const round = (v:number) => Math.round(v*100)/100;

/**
 * Atomic Dexie pilot payout + double-entry posting.
 * This is local-only; not a production MySQL transaction.
 */
export async function payDoctorCommission(
  commissionId: string, date: string, notes: string,
  doctorNameAr: string, doctorNameEn: string, actor: string,
): Promise<DoctorCommission> {
  assertDate(date);
  if (notes.length > 1000) throw new Error('NOTES_TOO_LONG');
  return db.transaction('rw', db.commissions, db.journalEntries, async () => {
    const existing = await db.commissions.get(commissionId);
    if (!existing || existing.remainingAmount <= 0 || existing.payoutJournalId) {
      throw new Error('COMMISSION_ALREADY_PAID_OR_NOT_FOUND');
    }
    const amount = round(existing.remainingAmount);
    const journal = await accountingService.recordCommissionPayoutJournal(
      existing, amount, doctorNameAr, doctorNameEn, actor, date, notes,
    );
    const updated: DoctorCommission = {
      ...existing, paidAmount:round(existing.paidAmount+amount),
      remainingAmount:0, status:'paid',
      payoutDate:date, payoutNotes:notes.trim(), payoutJournalId:journal.id,
      payoutCancelledAt:undefined, payoutCancellationReason:undefined,
    };
    await db.commissions.put(updated);
    return updated;
  });
}

/** Keeps the original journal immutable and posts an equal/opposite journal. */
export async function reverseDoctorCommissionPayout(
  commissionId:string, cancellationReason:string, actor:string,
): Promise<DoctorCommission> {
  if (!cancellationReason.trim()) throw new Error('CANCELLATION_REASON_REQUIRED');
  if (cancellationReason.length > 1000) throw new Error('NOTES_TOO_LONG');
  return db.transaction('rw', db.commissions, db.journalEntries, async () => {
    const existing = await db.commissions.get(commissionId);
    if (!existing || !existing.payoutJournalId || existing.payoutCancelledAt) {
      throw new Error('CANNOT_REVERSE_LEGACY_OR_UNPAID_COMMISSION');
    }
    const original = await db.journalEntries.get(existing.payoutJournalId);
    if (!original || original.referenceType !== 'commission_payout' ||
        original.referenceId !== existing.id || original.reversalEntryId) {
      throw new Error('ORIGINAL_PAYOUT_JOURNAL_NOT_AVAILABLE');
    }
    const today = new Date().toISOString().slice(0,10);
    const reversalId = 'je_cr_' + crypto.randomUUID();
    const reversed:JournalEntry = {
      ...original,
      id:reversalId,entryNumber:'JE-REV-'+Date.now(),
      date:today,entryType:'reversal',referenceType:'reversal',
      referenceId:original.id,referenceNumber:original.entryNumber,
      descriptionAr:'إلغاء صرف عمولة الطبيب: '+cancellationReason.trim(),
      descriptionEn:'Reverse doctor commission payout: '+cancellationReason.trim(),
      lines:original.lines.map(line => ({...line,debit:line.credit,credit:line.debit})),
      status:'posted',reversalEntryId:undefined,createdBy:actor,
    };
    await db.journalEntries.put({...original,status:'reversed',reversalEntryId:reversalId});
    await db.journalEntries.put(reversed);
    const payoutAmount = round(original.totalDebit);
    const paidAmount = round(Math.max(0, existing.paidAmount-payoutAmount));
    const remainingAmount = round(Math.max(0, existing.commissionAmount-paidAmount));
    const updated:DoctorCommission = {
      ...existing,paidAmount,remainingAmount,
      status:paidAmount === 0 ? 'accrued' : remainingAmount === 0 ? 'paid' : 'partial',
      payoutJournalId:undefined,payoutCancelledAt:new Date().toISOString(),
      payoutCancellationReason:cancellationReason.trim(),
    };
    await db.commissions.put(updated);
    return updated;
  });
}
