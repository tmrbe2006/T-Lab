import { db } from '../db/database';
import type { JournalEntry, JournalEntryLine } from '../types';

export interface ManualJournalInput {
  date:string;
  descriptionAr:string;
  debitCode:string;
  creditCode:string;
  amount:number;
}

function parseDate(s:string) {
  if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s) ||
      Number.isNaN(Date.parse(s+'T12:00:00Z')) ||
      new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new Error('INVALID_JOURNAL_DATE');
}
const round=(x:number)=>Math.round(x*100)/100;
export function validateManualJournal(input:ManualJournalInput) {
  parseDate(input.date);
  if(!input.descriptionAr.trim() || input.descriptionAr.length>250)throw new Error('JOURNAL_DESCRIPTION_REQUIRED');
  if(!Number.isFinite(input.amount) || input.amount<=0 || round(input.amount)<=0)throw new Error('INVALID_JOURNAL_AMOUNT');
  if(!/^\d{2,12}$/.test(input.debitCode) || !/^\d{2,12}$/.test(input.creditCode) ||
      input.debitCode===input.creditCode)throw new Error('INVALID_JOURNAL_ACCOUNTS');
  return {...input,amount:round(input.amount),descriptionAr:input.descriptionAr.trim()};
}
function opposite(entry:JournalEntry,actor:string,reason:string):JournalEntry{
  return {
    ...entry,id:'je_rev_'+crypto.randomUUID(),
    entryNumber:'JE-REV-'+Date.now(),
    date:new Date().toISOString().slice(0,10),
    entryType:'reversal',referenceType:'reversal',referenceId:entry.id,
    referenceNumber:entry.entryNumber,
    descriptionAr:'إلغاء/تصحيح قيد يدوي: '+reason,
    descriptionEn:'Reverse manual journal: '+reason,
    lines:entry.lines.map(line=>({...line,debit:line.credit,credit:line.debit})),
    totalDebit:entry.totalCredit,totalCredit:entry.totalDebit,
    status:'posted',reversalEntryId:undefined,createdBy:actor,
  };
}
async function build(input:ManualJournalInput,actor:string,referenceId:string):Promise<JournalEntry>{
  const checked=validateManualJournal(input);
  const debit=await db.chartOfAccounts.where('code').equals(checked.debitCode).first();
  const credit=await db.chartOfAccounts.where('code').equals(checked.creditCode).first();
  if(!debit||!credit||debit.isGroup||credit.isGroup)throw new Error('ACCOUNT_NOT_FOUND_OR_GROUP');
  const lines:JournalEntryLine[]=[
    {accountCode:debit.code,accountNameAr:debit.nameAr,accountNameEn:debit.nameEn,debit:checked.amount,credit:0},
    {accountCode:credit.code,accountNameAr:credit.nameAr,accountNameEn:credit.nameEn,debit:0,credit:checked.amount},
  ];
  return {
    id:'je_man_'+crypto.randomUUID(),entryNumber:'JE-M-'+Date.now(),
    date:checked.date,entryType:'manual',referenceType:'manual',referenceId,
    descriptionAr:checked.descriptionAr,descriptionEn:checked.descriptionAr,
    lines,totalDebit:checked.amount,totalCredit:checked.amount,
    status:'posted',createdBy:actor,
  };
}
export async function createManualJournal(input:ManualJournalInput,actor:string):Promise<JournalEntry>{
  return db.transaction('rw',db.journalEntries,db.chartOfAccounts,async()=>{
    const entry=await build(input,actor,'manual');
    await db.journalEntries.put(entry);
    return entry;
  });
}
export async function correctManualJournal(id:string,input:ManualJournalInput,actor:string):Promise<JournalEntry>{
  return db.transaction('rw',db.journalEntries,db.chartOfAccounts,async()=>{
    const existing=await db.journalEntries.get(id);
    if(!existing||existing.referenceType!=='manual'||existing.entryType!=='manual'||existing.reversalEntryId)
      throw new Error('ONLY_ACTIVE_MANUAL_JOURNALS_CAN_BE_EDITED');
    const replacement=await build(input,actor,existing.id);
    const reversed=opposite(existing,actor,'تعديل القيد '+existing.entryNumber);
    await db.journalEntries.put({...existing,status:'reversed',reversalEntryId:reversed.id});
    await db.journalEntries.put(reversed);
    await db.journalEntries.put(replacement);
    return replacement;
  });
}
export async function reverseManualJournal(id:string,reason:string,actor:string):Promise<void>{
  if(!reason.trim())throw new Error('REVERSAL_REASON_REQUIRED');
  return db.transaction('rw',db.journalEntries,async()=>{
    const existing=await db.journalEntries.get(id);
    if(!existing||existing.referenceType!=='manual'||existing.entryType!=='manual'||existing.reversalEntryId)
      throw new Error('ONLY_ACTIVE_MANUAL_JOURNALS_CAN_BE_REVERSED');
    const reversed=opposite(existing,actor,reason.trim());
    await db.journalEntries.put({...existing,status:'reversed',reversalEntryId:reversed.id});
    await db.journalEntries.put(reversed);
  });
}
