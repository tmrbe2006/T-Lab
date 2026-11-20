import type { User } from '../types';

export async function renderJournalDraftPilot(root: HTMLElement, user: User): Promise<void> {
  if (!['Owner', 'Accountant'].includes(user.role)) return;
  root.innerHTML = '<section dir="rtl" class="rounded-xl border bg-white p-4 space-y-3">' +
    '<h2 class="font-bold">مسودة قيد يومية متوازنة — بدون ترحيل</h2>' +
    '<p class="text-xs text-rose-900">يُمنع الترحيل أو تعديل أرصدة الحسابات. رموز الحسابات تُسجل للمراجعة فقط حتى اعتماد دليل الحسابات وإقفال الفترات.</p>' +
    '<form id="journal-draft-form" class="space-y-3">' +
    '<label class="text-xs block">وصف القيد<input name="memo" minlength="6" maxlength="240" required class="block border p-2 rounded w-full"></label>' +
    '<label class="text-xs block">تاريخ الفحص المحاسبي<input type="date" name="entryDate" required class="block border p-2 rounded"></label>' +
    '<div id="journal-draft-lines" class="space-y-2"></div>' +
    '<button type="button" id="journal-draft-add-line" class="border rounded px-3 py-2 text-xs">إضافة سطر</button>' +
    '<button type="button" id="journal-preflight" class="border rounded px-3 py-2 text-xs">فحص الحسابات والفترة</button>' +
    '<button type="submit" class="bg-indigo-700 text-white rounded px-3 py-2 text-xs">حفظ مسودة غير مرحلة</button>' +
    '</form><p id="journal-draft-state" role="status" class="text-xs"></p></section>';
  const form = root.querySelector<HTMLFormElement>('#journal-draft-form');
  const linesHost = root.querySelector<HTMLElement>('#journal-draft-lines');
  const state = root.querySelector<HTMLElement>('#journal-draft-state');
  const say = (message: string) => { if (state) state.textContent = message; };
  const addLine = () => {
    if (!linesHost || linesHost.children.length >= 50) return;
    const line = document.createElement('div');
    line.className = 'flex flex-wrap gap-2 border rounded p-2';
    line.innerHTML =
      '<label class="text-xs">رمز الحساب<input data-account required pattern="[A-Za-z0-9_-]{1,64}" class="block border rounded p-1"></label>' +
      '<label class="text-xs">مدين<input data-debit required type="text" inputmode="decimal" value="0" class="block border rounded p-1 w-28"></label>' +
      '<label class="text-xs">دائن<input data-credit required type="text" inputmode="decimal" value="0" class="block border rounded p-1 w-28"></label>' +
      '<button type="button" class="border rounded text-xs px-2" data-remove>حذف السطر</button>';
    line.querySelector('[data-remove]')?.addEventListener('click', () => {
      if (linesHost.children.length > 2) line.remove();
    });
    linesHost.append(line);
  };
  addLine(); addLine();
  root.querySelector('#journal-draft-add-line')?.addEventListener('click', addLine);

  const inspect = async () => {
    if (!form || !linesHost) return;
    const fields = new FormData(form);
    const entryDate = String(fields.get('entryDate') || '');
    const accountCodes = Array.from(linesHost.children).map(row =>
      row.querySelector<HTMLInputElement>('[data-account]')?.value.trim() || '',
    );
    try {
      const response = await fetch('/api/v2/finance/posting-preflight', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, accountCodes }),
      });
      if (!response.ok) throw new Error('تعذر فحص الحسابات أو الفترة');
      const body = await response.json() as {
        report: { approvedForPosting: false; reasons: string[]; basicStructureChecksPassed: boolean };
      };
      if (body.report.approvedForPosting !== false) {
        throw new Error('رفض استجابة اعتماد غير متوقعة');
      }
      say(body.report.reasons.length
        ? 'موانع الفحص: ' + body.report.reasons.join('، ') + ' — لا توجد صلاحية ترحيل.'
        : 'اجتاز فحص رموز الحسابات والفترة مبدئيًا، لكن الترحيل ما زال محظورًا لحين الاعتماد المحاسبي.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'فشل فحص القيود');
    }
  };
  root.querySelector('#journal-preflight')?.addEventListener('click', () => { void inspect(); });

  let submitKey: string | null = null;
  form?.addEventListener('input', () => { submitKey = null; });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form || !linesHost) return;
    const lines = Array.from(linesHost.children).map(child => ({
      accountCode: (child.querySelector<HTMLInputElement>('[data-account]')?.value || '').trim(),
      debit: (child.querySelector<HTMLInputElement>('[data-debit]')?.value || '').trim(),
      credit: (child.querySelector<HTMLInputElement>('[data-credit]')?.value || '').trim(),
    }));
    const memo = (new FormData(form).get('memo') || '').toString();
    submitKey ||= 'journal_' + crypto.randomUUID();
    const button = form.querySelector<HTMLButtonElement>('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const res = await fetch('/api/v2/finance/journal-drafts', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo, lines, idempotencyKey: submitKey }),
      });
      if (!res.ok) throw new Error('رفض السيرفر مسودة القيد: راجع المبالغ والتوازن والصلاحية');
      const body = await res.json() as { draftId: string; posted: boolean; totalMinor: number };
      if (body.posted !== false) throw new Error('استجابة غير متوقعة: لم يتم اعتماد الترحيل');
      say('حُفظت مسودة غير مرحلة بمعرّف ' + body.draftId + '. إجمالي الطرف: ' +
        (body.totalMinor / 100).toFixed(2) + '. لم تتغير أرصدة الحسابات.');
      if (button) button.disabled = true;
    } catch (error) {
      if (button) button.disabled = false;
      say(error instanceof Error ? error.message : 'تعذر حفظ المسودة');
    }
  });
}
