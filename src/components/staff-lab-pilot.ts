import { authService } from '../auth/auth.service';
import { escapeHtml } from './common';
import type { User } from '../types';

type Test = { id: string; code: string; nameAr: string; nameEn: string; price: number };
type RequestRow = { id: string; requestNumber: string; patientId: string; status: string; version: number };
type Paged<T> = { items: T[]; nextCursor: string | null; error?: string };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Request denied (' + response.status + ')');
  return data;
}

/** The pilot reads/writes MySQL only. No IndexedDB, browser credentials or raw bulk sync. */
export async function renderStaffLabPilot(root: HTMLElement, user: User): Promise<void> {
  const canCreate = user.role === 'Owner' || user.role === 'Receptionist';
  const canReceive = user.role === 'Owner' || user.role === 'Technician' || user.role === 'Chemist';
  const quoteKeys = new Map<string, string>();
  root.innerHTML = `
    <section class="bg-white rounded-xl border p-4 space-y-3" dir="rtl">
      <h2 class="font-bold">طلبات التحاليل والعينات — نسخة تجريبية مؤمّنة</h2>
      <p class="text-xs text-amber-800">لا تُنشئ هذه الشاشة فواتير ولا تعتمد نتائج. بيانات الطلبات مأخوذة مباشرة من MySQL 5.5.</p>
      <p id="lab-pilot-status" role="status" class="text-xs"></p>
      ${canCreate ? `
      <form id="lab-pilot-request" class="flex flex-wrap gap-3 items-end border rounded p-3">
        <label class="text-xs">معرّف المريض (من القائمة أعلاه)
          <input name="patientId" required pattern="[A-Za-z0-9_-]{1,64}" class="block rounded border p-2 min-w-52" />
        </label>
        <label class="text-xs">التحليل
          <select name="testId" required class="block rounded border p-2 min-w-48"><option value="">جاري قراءة كتالوج السيرفر</option></select>
        </label>
        <button type="submit" class="rounded bg-indigo-700 text-white px-3 py-2 text-xs">إنشاء طلب</button>
      </form>` : ''}
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold">طلبات التحاليل (أول 50 طلبًا)</h3>
        <button type="button" id="lab-pilot-refresh" class="rounded border px-2 py-1 text-xs">تحديث</button>
      </div>
      <div id="lab-pilot-requests" class="overflow-x-auto text-xs">جاري التحميل...</div>
      <p id="lab-pilot-quote" role="status" class="text-sm font-semibold text-indigo-900"></p>
    </section>`;

  const status = root.querySelector<HTMLElement>('#lab-pilot-status');
  const output = root.querySelector<HTMLElement>('#lab-pilot-requests');
  const notify = (msg: string) => { if (status) status.textContent = msg; };

  const load = async () => {
    try {
      const requests = await api<Paged<RequestRow>>('/api/v2/requests?limit=50');
      if (!output) return;
      output.innerHTML = requests.items.length ? `
        <table class="w-full text-xs border-collapse">
          <thead><tr><th class="border p-2">الطلب</th><th class="border p-2">معرّف المريض</th><th class="border p-2">الحالة</th><th class="border p-2">الإصدار</th><th class="border p-2">العملية</th></tr></thead>
          <tbody>${requests.items.map((item, index) => `
            <tr>
              <td class="border p-2">${escapeHtml(item.requestNumber)}</td>
              <td class="border p-2 font-mono">${escapeHtml(item.patientId)}</td>
              <td class="border p-2">${escapeHtml(item.status)}</td>
              <td class="border p-2">${item.version}</td>
              <td class="border p-2">
                ${canReceive && item.status === 'awaiting_sample'
                ? `<button type="button" data-receive-index="${index}" class="rounded bg-emerald-700 text-white px-2 py-1">استلام عينة</button>`
                : ''}
                ${canCreate ? `<button type="button" data-quote-index="${index}" class="rounded border border-indigo-500 px-2 py-1">عرض سعر غير صادر</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<p>لا توجد طلبات في قاعدة الاختبار.</p>';
      output.querySelectorAll<HTMLButtonElement>('button[data-quote-index]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const item = requests.items[Number(btn.dataset.quoteIndex)];
          if (!item) return;
          btn.disabled = true;
          let key = quoteKeys.get(item.id);
          if (!key) {
            key = 'quote_' + crypto.randomUUID();
            quoteKeys.set(item.id, key);
          }
          const quoteStatus = root.querySelector<HTMLElement>('#lab-pilot-quote');
          try {
            const value = await api<{ draft: { amountMinor: number; state: string; payable: boolean }; replayed: boolean }>(
              '/api/v2/finance/quotes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: item.id, requestVersion: item.version, idempotencyKey: key }),
              },
            );
            if (quoteStatus) quoteStatus.textContent =
              'مسودة عرض سعر فقط — المجموع ' + (value.draft.amountMinor / 100).toFixed(2) +
              ' (قبل الضرائب والخصومات). ليست فاتورة ولا يجوز تحصيلها.';
          } catch (error) {
            if (quoteStatus) quoteStatus.textContent = error instanceof Error ? error.message : 'تعذر تجهيز عرض السعر.';
          } finally { btn.disabled = false; }
        });
      });
      output.querySelectorAll<HTMLButtonElement>('button[data-receive-index]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const item = requests.items[Number(btn.dataset.receiveIndex)];
          if (!item) return;
          const sampleType = window.prompt('نوع العينة باللغة الإنجليزية، مثل Blood أو Urine', 'Blood');
          if (sampleType === null) return;
          try {
            const result = await api<{ requestVersion: number }>(
              '/api/v2/requests/' + encodeURIComponent(item.id) + '/samples/receive', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: item.version, sampleType }),
              },
            );
            notify('تم استلام العينة وتحديث الطلب إلى الإصدار ' + result.requestVersion);
            await load();
          } catch (e) {
            notify(e instanceof Error ? e.message : 'تعذر استلام العينة. ربما عدّل جهاز آخر هذا الطلب.');
          }
        });
      });
      notify('تم تحديث طلبات التحاليل من MySQL.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذر تحميل الطلبات');
      if (output) output.textContent = '';
    }
  };

  root.querySelector('#lab-pilot-refresh')?.addEventListener('click', () => { void load(); });
  if (canCreate) {
    const selector = root.querySelector<HTMLSelectElement>('#lab-pilot-request select[name="testId"]');
    try {
      const catalogue = await api<Paged<Test>>('/api/v2/catalog/tests?limit=50');
      if (selector) selector.innerHTML =
        '<option value="">اختر تحليلًا</option>' +
        catalogue.items.map(test => `<option value="${escapeHtml(test.id)}">${escapeHtml(test.code + ' — ' + (test.nameAr || test.nameEn))} — ${test.price.toFixed(2)}</option>`).join('');
    } catch { notify('تعذر تحميل كتالوج التحاليل من السيرفر.'); }

    root.querySelector<HTMLFormElement>('#lab-pilot-request')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const fields = new FormData(form);
      try {
        const result = await api<{ record: { requestNumber: string } }>('/api/v2/requests', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: fields.get('patientId'), testIds: [fields.get('testId')],
          }),
        });
        form.reset();
        await load();
        notify('تم إنشاء الطلب ' + result.record.requestNumber + ' على MySQL دون إصدار فاتورة.');
      } catch (e) { notify(e instanceof Error ? e.message : 'تعذر إنشاء الطلب'); }
    });
  }
  await load();
}
