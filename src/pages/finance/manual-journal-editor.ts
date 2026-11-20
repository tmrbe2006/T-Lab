import { openCustomModal, openDeleteConfirmModal, showToast } from '../../components/common';
import { enforcePermission } from '../../guards/permission.guard';
import { accountingRepository } from '../../repositories';
import { authService } from '../../auth/auth.service';
import { i18n } from '../../i18n';
import {
  createManualJournal, correctManualJournal, reverseManualJournal,
  type ManualJournalInput,
} from '../../services/manual-journal.service';
import type { JournalEntry } from '../../types';

export async function openManualJournalEditor(
  onSaved:()=>void,
  existing?:JournalEntry,
):Promise<void>{
  const action=existing?'edit':'add';
  if(!(await enforcePermission(action,'journalEntries')))return;
  if(existing && (existing.entryType!=='manual'||existing.referenceType!=='manual'||existing.reversalEntryId)){
    showToast(i18n.bi('لا يمكن تعديل قيد آلي أو قيد ملغى.','Only active manual journals can be edited.'),'warning');
    return;
  }
  const accounts=(await accountingRepository.getAccounts()).filter(a=>!a.isGroup);
  const debitLine=existing?.lines.find(l=>l.debit>0);
  const creditLine=existing?.lines.find(l=>l.credit>0);
  const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]||x));
  const options=(chosen?:string)=>accounts.map(a=>
    `<option value="${escape(a.code)}" ${chosen===a.code?'selected':''}>${escape(a.code+' — '+a.nameAr)}</option>`).join('');
  openCustomModal(existing?i18n.bi('تصحيح قيد يدوي','Correct Manual Journal'):i18n.bi('إضافة قيد يومية يدوي','New Manual Journal'),
    `<form id="manual-journal-form" class="space-y-3 text-sm">
      <p class="text-slate-600">${i18n.bi('يجب تساوي المدين والدائن. تصحيح قيد مرحّل ينشئ قيدًا عكسيًا وقيدًا جديدًا مع حفظ السجل.', 'Debit and credit must balance. Edits create an auditable reversal and replacement.')}</p>
      <label class="block">${i18n.bi('تاريخ القيد','Journal date')}<input name="date" type="date" required value="${escape(existing?.date||new Date().toLocaleDateString('en-CA'))}" class="block border rounded p-2 w-full mt-1"/></label>
      <label class="block">${i18n.bi('البيان','Description')}<input name="description" required maxlength="250" value="${escape(existing?.descriptionAr||'')}" class="block border rounded p-2 w-full mt-1"/></label>
      <label class="block">${i18n.bi('الحساب المدين','Debit account')}<select name="debitCode" required class="block border rounded p-2 w-full mt-1"><option value="">—</option>${options(debitLine?.accountCode)}</select></label>
      <label class="block">${i18n.bi('الحساب الدائن','Credit account')}<select name="creditCode" required class="block border rounded p-2 w-full mt-1"><option value="">—</option>${options(creditLine?.accountCode)}</select></label>
      <label class="block">${i18n.bi('المبلغ','Amount')}<input name="amount" type="number" step="0.01" min="0.01" required value="${existing?.totalDebit||''}" class="block border rounded p-2 w-full mt-1"/></label>
      <button type="submit" class="rounded bg-sky-700 text-white font-bold px-4 py-2">${i18n.bi('تأكيد حفظ القيد','Confirm Journal Posting')}</button>
    </form>`,
    close=>{
      document.getElementById('manual-journal-form')?.addEventListener('submit',async event=>{
        event.preventDefault();
        if(!(await enforcePermission(action,'journalEntries')))return;
        const form=event.currentTarget as HTMLFormElement;
        const data=new FormData(form);
        const input:ManualJournalInput={
          date:String(data.get('date')||''),descriptionAr:String(data.get('description')||''),
          debitCode:String(data.get('debitCode')||''),creditCode:String(data.get('creditCode')||''),
          amount:Number(data.get('amount')),
        };
        const submit=form.querySelector<HTMLButtonElement>('button[type=submit]');
        if(submit)submit.disabled=true;
        try{
          const record=existing
            ?await correctManualJournal(existing.id,input,authService.getCurrentUser()?.username||'accountant')
            :await createManualJournal(input,authService.getCurrentUser()?.username||'accountant');
          await authService.logAudit(existing?'تصحيح قيد يومية يدوي':'إضافة قيد يومية يدوي','journalEntries',record.id);
          close();
          showToast(i18n.bi('تم حفظ القيد المتوازن','Balanced journal saved'),'success');
          onSaved();
        }catch(error){showToast(String(error instanceof Error?error.message:error),'error');}
        finally{if(submit)submit.disabled=false;}
      });
    });
}

export async function confirmManualJournalReversal(existing:JournalEntry,onSaved:()=>void):Promise<void>{
  if(!(await enforcePermission('delete','journalEntries')))return;
  if(existing.referenceType!=='manual'||existing.entryType!=='manual'||existing.reversalEntryId){
    showToast(i18n.bi('لا يجوز حذف قيد آلي أو قيد عكسي.','Automated and reversed journals cannot be deleted.'),'warning');
    return;
  }
  openDeleteConfirmModal({
    recordLabel:existing.entryNumber,
    customWarning:i18n.bi(
      'سيتم إلغاء أثر القيد المالي بقيد عكسي مع الاحتفاظ بالقيد الأصلي؛ لا تُحذف السجلات المحاسبية المرحلة.',
      'An opposite journal will cancel the financial effect while preserving the original posting.'
    ),
    onConfirm:async reason=>{
      if(!(await enforcePermission('delete','journalEntries')))return;
      try{
        await reverseManualJournal(existing.id,reason||'إلغاء قيد يومية يدوي',authService.getCurrentUser()?.username||'accountant');
        await authService.logAudit('إلغاء قيد يومية يدوي بقيد عكسي','journalEntries',existing.id,reason||'');
        showToast(i18n.bi('تم إلغاء أثر القيد بقيد عكسي','Journal reversed successfully'),'success');
        onSaved();
      }catch(error){showToast(String(error instanceof Error?error.message:error),'error');}
    },
  });
}
