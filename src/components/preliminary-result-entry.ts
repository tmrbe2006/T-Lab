import type { User } from '../types';
import { escapeHtml } from './common';

type TestParameter = {
  id: string; code: string; name: string; unit: string; resultType: string;
};
type TestSet = { id: string; code: string; name: string; parameters: TestParameter[] };
type Ordered = { tests: TestSet[]; entryAllowed: boolean };
type LabRequest = { id: string; requestNumber: string; status: string };

export async function renderPreliminaryEntry(root: HTMLElement, user: User) {
  if (!['Chemist', 'Technician'].includes(user.role)) return;
  root.innerHTML = '<section class="bg-white border rounded-xl p-4 space-y-3" dir="rtl">' +
    '<h2 class="font-bold">إدخال نتائج أولية — غير معتمدة</h2>' +
    '<p class="font-semibold text-xs text-rose-800">هذه القيم لم تخضع لمراجعة طبية، ولا تقارن تلقائيًا بالمعدلات الطبيعية، ولا تصدر تقريرًا للمريض.</p>' +
    '<label class="text-xs">الطلب المستلمة عينته<select class="block border rounded p-2" id="preliminary-order"><option value="">جاري التحميل...</option></select></label>' +
    '<button type="button" id="preliminary-refresh" class="rounded border px-3 py-1 text-xs">تحديث الطلبات بعد استلام العينات</button>' +
    '<div id="preliminary-entry-forms" class="space-y-3"></div>' +
    '<p id="preliminary-entry-state" role="status" class="text-xs"></p></section>';
  const select = root.querySelector<HTMLSelectElement>('#preliminary-order');
  const host = root.querySelector<HTMLElement>('#preliminary-entry-forms');
  const state = root.querySelector<HTMLElement>('#preliminary-entry-state');
  const say = (message: string) => { if (state) state.textContent = message; };
  let loadVersion = 0;

  const request = async <T>(path: string, options?: RequestInit) => {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error || 'رفض السيرفر العملية');
    return body;
  };

  async function renderSelectedRequest() {
    const id = select?.value;
    const currentVersion = ++loadVersion;
    if (host) host.replaceChildren();
    if (!id) return;
    try {
      const ordered = await request<Ordered>('/api/v2/results/requests/' + encodeURIComponent(id) + '/parameters');
      if (currentVersion !== loadVersion || !host) return;
      if (!ordered.entryAllowed) {
        say('لا يسمح بإدخال النتائج قبل استلام العينة');
        return;
      }
      if (ordered.tests.length === 0) {
        say('لا توجد تحاليل مسجلة في الطلب');
        return;
      }
      host.innerHTML = ordered.tests.map((test, i) =>
        '<form class="border rounded p-3 space-y-2" data-result-form="' + i + '">' +
          '<h3 class="font-semibold text-sm">' + escapeHtml(test.name || test.code) + '</h3>' +
          '<p class="text-xs text-rose-700">مسودة بحثية/تشغيلية فقط. راجع كل قيمة قبل الإرسال.</p>' +
          (test.parameters.length > 0 ? test.parameters.map((param, j) =>
            '<label class="text-xs block">' +
              escapeHtml(param.name || param.code) + ' (' + escapeHtml(param.unit || 'بدون وحدة') + ')' +
              '<input name="value-' + j + '" required class="block border rounded p-2 w-full" ' +
              'inputmode="' + (param.resultType === 'numeric' ? 'decimal' : 'text') + '"></label>',
          ).join('') : '<p class="text-xs text-rose-800">لا يمكن الإدخال: لا توجد بارامترات معتمدة للإدخال.</p>') +
          (test.parameters.length > 0 ?
            '<button type="submit" class="rounded bg-indigo-700 text-white px-3 py-2 text-xs">حفظ مسودة غير معتمدة</button>' : '') +
          '<p class="text-xs" role="status" data-test-state="' + i + '"></p>' +
          '<button type="button" disabled class="hidden rounded border px-2 py-1 text-xs" data-send-review="' + i + '">' +
            'إرسال المسودة للمراجعة</button>' +
        '</form>',
      ).join('');
      ordered.tests.forEach((test, i) => {
        const form = host.querySelector<HTMLFormElement>('form[data-result-form="' + i + '"]');
        const send = form?.querySelector<HTMLButtonElement>('[data-send-review]');
        const formState = form?.querySelector<HTMLElement>('[data-test-state]');
        const formSay = (message: string) => { if (formState) formState.textContent = message; };
        let savedDraft: { id: string; version: number } | null = null;
        form?.addEventListener('submit', async event => {
          event.preventDefault();
          if (!id || savedDraft) return;
          const values = test.parameters.map((param, j) => ({
            parameterId: param.id,
            value: String(new FormData(form).get('value-' + j) || ''),
          }));
          const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (button) button.disabled = true;
          try {
            const outcome = await request<{record: {id: string}; version: number}>('/api/v2/results/drafts', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId: id, testId: test.id, values }),
            });
            savedDraft = { id: outcome.record.id, version: outcome.version };
            form.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.readOnly = true; });
            if (send) { send.disabled = false; send.classList.remove('hidden'); }
            formSay('تم حفظ مسودة غير معتمدة. أرسلها للمراجعة عند التأكد من قيم الإدخال.');
          } catch (error) {
            if (button) button.disabled = false;
            formSay(error instanceof Error ? error.message : 'تعذر حفظ المسودة');
          }
        });
        send?.addEventListener('click', async () => {
          if (!savedDraft) return;
          send.disabled = true;
          try {
            await request('/api/v2/results/' + encodeURIComponent(savedDraft.id) + '/submit-review', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ version: savedDraft.version }),
            });
            formSay('تم إرسال المسودة للمراجعة. ليست معتمدة، ولا يجوز إصدار تقرير منها.');
            send.textContent = 'أُرسلت للمراجعة';
          } catch (error) {
            send.disabled = false;
            formSay(error instanceof Error ? error.message : 'فشل إرسال المسودة');
          }
        });
      });
      say('البارامترات مأخوذة مباشرة من MySQL، بدون اختلاق مديات أو تنبيهات حرجة.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'تعذر تحميل بارامترات الطلب');
    }
  }

  try {
    const result = await request<{ items: LabRequest[] }>(
      '/api/v2/requests?limit=50',
    );
    const ready = result.items.filter(item =>
      ['sample_received', 'in_analysis'].includes(item.status));
    if (select) {
      select.innerHTML = '<option value="">اختر طلبًا مستلمة عينته</option>' +
        ready.map(item => '<option value="' + escapeHtml(item.id) + '">' +
          escapeHtml(item.requestNumber) + '</option>').join('');
    }
    say(ready.length ? 'اختر الطلب لتظهر بارامترات تحاليله' : 'لا توجد طلبات مستلمة العينات ضمن أول 50 طلبًا');
  } catch {
    if (select) select.innerHTML = '<option value="">قاعدة البيانات غير متاحة</option>';
    say('لا يمكن تحميل الطلبات؛ لن يتم حفظ بيانات محلية غير متزامنة.');
  }
  select?.addEventListener('change', () => { void renderSelectedRequest(); });
  root.querySelector('#preliminary-refresh')?.addEventListener('click', () => { void renderPreliminaryEntry(root, user); });
}
