import { escapeHtml } from './common';
import type { User } from '../types';

type ReviewValue = { parameterId: string; value: string | number };
type ReviewItem = {
  id: string; requestId: string; testId: string; patientId: string; enteredBy: string;
  values: ReviewValue[]; status: 'pending_review'; version: number; reviewStatus: 'NOT_REVIEWED';
};

/** Read-only triage view; deliberately no approve or print-report controls. */
export async function renderStaffReviewQueue(root: HTMLElement, user: User): Promise<void> {
  if (!['Owner', 'Doctor', 'Chemist', 'Technician'].includes(user.role)) return;
  root.innerHTML = `
    <section class="bg-white rounded-xl border p-4 space-y-3" dir="rtl">
      <h2 class="font-bold">قائمة النتائج في انتظار المراجعة الطبية</h2>
      <p class="text-xs text-rose-800 font-semibold">جميع القيم المعروضة غير معتمدة ولم تُراجع المديات الطبيعية أو الحدود الحرجة. لا يجوز إصدار تقرير أو تقديم تفسير سريري بناءً عليها.</p>
      <button type="button" id="review-pilot-refresh" class="rounded border px-3 py-1 text-xs">تحديث القائمة</button>
      <p id="review-pilot-state" class="text-xs" role="status"></p>
      <div id="review-pilot-items" class="text-xs overflow-x-auto"></div>
    </section>`;

  const state = root.querySelector<HTMLElement>('#review-pilot-state');
  const host = root.querySelector<HTMLElement>('#review-pilot-items');
  const status = (msg: string) => { if (state) state.textContent = msg; };
  const load = async () => {
    try {
      const res = await fetch('/api/v2/results/review-queue?limit=25', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('غير مسموح بقراءة النتائج أو سيرفر MySQL غير متاح.');
      const data = await res.json() as { items: ReviewItem[]; nextCursor: string | null };
      if (!host) return;
      host.innerHTML = data.items.length ? `
        <table class="w-full border-collapse">
          <thead><tr><th class="border p-2">رقم الطلب</th><th class="border p-2">المريض</th><th class="border p-2">التحليل</th><th class="border p-2">القيم الأولية</th><th class="border p-2">الحالة</th></tr></thead>
          <tbody>${data.items.map(item => `
            <tr>
              <td class="border p-2">${escapeHtml(item.requestId)}</td>
              <td class="border p-2">${escapeHtml(item.patientId)}</td>
              <td class="border p-2">${escapeHtml(item.testId)}</td>
              <td class="border p-2">${item.values.map(value => `${escapeHtml(value.parameterId)}: ${escapeHtml(String(value.value))}`).join('، ')}</td>
              <td class="border p-2 text-rose-700">غير معتمد — يحتاج مراجعة</td>
            </tr>`).join('')}</tbody>
        </table>` : '<p class="text-slate-600">لا توجد نتائج أولية مُرسلة للمراجعة.</p>';
      status(data.nextCursor ? 'تُعرض أول 25 نتيجة فقط. القائمة الكاملة تحتاج استكمال التصفح.' : 'تم تحميل قائمة المراجعة من MySQL.');
    } catch (error) {
      if (host) host.textContent = '';
      status(error instanceof Error ? error.message : 'تعذر الاتصال بالسيرفر');
    }
  };
  root.querySelector('#review-pilot-refresh')?.addEventListener('click', () => { void load(); });
  await load();
}
