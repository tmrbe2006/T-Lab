import type { User } from '../types';
import { escapeHtml } from './common';

type StockCheck = {
  itemId: string; code: string; itemQty: string; availableLotQty: string;
  expiredReleasedQty: string; differenceMilli: number | null;
  balanced: boolean; status: string;
};
export async function renderInventoryReconciliation(root: HTMLElement, user: User) {
  if (!['Owner', 'Chemist', 'Accountant'].includes(user.role)) return;
  root.innerHTML = '<section dir="rtl" class="bg-white border rounded-xl p-4 space-y-3">' +
    '<h2 class="font-semibold">مطابقة أرصدة المخزون مع التشغيلات — فحص فقط</h2>' +
    '<p class="text-xs text-amber-900">النتائج للرقابة ولا تُعدّل أرصدة MySQL. أي فرق يحتاج جردًا وموافقة منفصلة.</p>' +
    '<button type="button" id="inventory-reconcile-refresh" class="border rounded px-3 py-1 text-xs">فحص أول 25 صنفًا</button>' +
    '<p id="inventory-reconcile-status" role="status" class="text-xs"></p>' +
    '<div id="inventory-reconcile-table" class="overflow-x-auto text-xs"></div></section>';
  const state = root.querySelector<HTMLElement>('#inventory-reconcile-status');
  const host = root.querySelector<HTMLElement>('#inventory-reconcile-table');
  const load = async () => {
    try {
      const res = await fetch('/api/v2/inventory/reconciliation?limit=25', {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('لا توجد صلاحية أو قاعدة البيانات غير متاحة');
      const data = await res.json() as { items: StockCheck[]; nextCursor: string | null; readOnly: boolean };
      if (!data.readOnly) throw new Error('فشل ضمان القراءة فقط');
      if (host) {
        host.innerHTML = data.items.length
          ? '<table class="w-full border-collapse"><thead><tr>' +
            '<th class="border p-2">الصنف</th><th class="border p-2">الرصيد المسجل</th>' +
            '<th class="border p-2">التشغيلات المتاحة</th><th class="border p-2">منتهي الصلاحية</th>' +
            '<th class="border p-2">النتيجة</th></tr></thead><tbody>' +
            data.items.map(item =>
              '<tr><td class="border p-2">' + escapeHtml(item.code || item.itemId) + '</td>' +
              '<td class="border p-2">' + escapeHtml(item.itemQty) + '</td>' +
              '<td class="border p-2">' + escapeHtml(item.availableLotQty) + '</td>' +
              '<td class="border p-2">' + escapeHtml(item.expiredReleasedQty) + '</td>' +
              '<td class="border p-2">' + (item.balanced ? 'مطابق' :
                'تحذير: ' + escapeHtml(item.status)) + '</td></tr>').join('') +
            '</tbody></table>' : '<p>لم توجد أصناف في الصفحة الأولى.</p>';
      }
      if (state) state.textContent = data.nextCursor
        ? 'هذا فحص أول 25 صنفًا فقط، ولا يمثل مطابقة المخزون بالكامل.'
        : 'تم فحص الأصناف المعروضة دون أي تعديل على الأرصدة.';
    } catch (error) {
      if (host) host.textContent = '';
      if (state) state.textContent = error instanceof Error ? error.message : 'تعذر المطابقة';
    }
  };
  root.querySelector('#inventory-reconcile-refresh')?.addEventListener('click', () => { void load(); });
  await load();
}
