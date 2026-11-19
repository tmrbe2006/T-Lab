import type { User } from '../types';
import { escapeHtml } from './common';

type Receipt = {
  receiptId: string; itemId: string; lotId: string; lotNumber: string;
  receivedQuantity: string; expiryDate: string; status: 'quarantined'; approved: false;
};

/** Safety-only pilot: records quarantined lots. No release/approval or payable actions. */
export async function renderStockQuarantinePanel(root: HTMLElement, user: User) {
  if (!['Owner', 'Chemist'].includes(user.role)) return;
  root.innerHTML = '<section class="rounded-xl border p-4 bg-white space-y-3" dir="rtl">' +
    '<h2 class="font-bold">استلام كواشف بالحجر — MySQL 5.5</h2>' +
    '<p class="text-xs text-rose-800">التسجيل لا يزيد المخزون المتاح ولا يعتمد فحص الجودة. يمنع صرف التشغيلة حتى الاعتماد المستقل.</p>' +
    '<form id="qc-receive-form" class="flex flex-wrap gap-3 items-end">' +
    '<label class="text-xs">معرّف الصنف<input name="itemId" required pattern="[A-Za-z0-9_-]{1,64}" class="block rounded border p-2"></label>' +
    '<label class="text-xs">رقم التشغيلة<input name="lotNumber" required pattern="[A-Za-z0-9_-]{1,64}" class="block rounded border p-2"></label>' +
    '<label class="text-xs">الكمية<input name="quantity" required inputmode="decimal" pattern="(0|[1-9][0-9]{0,7})(\\.[0-9]{1,3})?" class="block rounded border p-2"></label>' +
    '<label class="text-xs">تاريخ الصلاحية<input type="date" name="expiryDate" required class="block rounded border p-2"></label>' +
    '<button type="submit" class="rounded bg-indigo-700 text-white px-3 py-2 text-xs">تسجيل بالحجر فقط</button>' +
    '</form><p id="qc-receive-status" role="status" class="text-xs"></p>' +
    '<button type="button" id="qc-receive-refresh" class="rounded border px-2 py-1 text-xs">تحديث القائمة</button>' +
    '<div id="qc-receive-list" class="overflow-x-auto text-xs"></div></section>';
  const form = root.querySelector<HTMLFormElement>('#qc-receive-form');
  const status = root.querySelector<HTMLElement>('#qc-receive-status');
  const list = root.querySelector<HTMLElement>('#qc-receive-list');
  const say = (msg: string) => { if (status) status.textContent = msg; };
  const load = async () => {
    try {
      const response = await fetch('/api/v2/inventory/receipts/quarantine?limit=25', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('قراءة التشغيلات المحجوزة غير متاحة');
      const result = await response.json() as { items: Receipt[]; nextCursor: string | null };
      if (list) list.innerHTML = result.items.length
        ? '<table class="w-full"><thead><tr><th>الصنف</th><th>التشغيلة</th><th>الكمية المحجوزة</th><th>الصلاحية</th><th>الحالة</th></tr></thead><tbody>' +
          result.items.map(item => '<tr><td class="border p-2">' + escapeHtml(item.itemId) +
            '</td><td class="border p-2">' + escapeHtml(item.lotNumber) +
            '</td><td class="border p-2">' + escapeHtml(item.receivedQuantity) +
            '</td><td class="border p-2">' + escapeHtml(item.expiryDate) +
            '</td><td class="border p-2 text-rose-700">محجوز — غير معتمد</td></tr>').join('') +
          '</tbody></table>'
        : '<p>لا توجد تشغيلات مستلمة بالحجر.</p>';
      if (result.nextCursor) say('يُعرض أول 25 سجلًا فقط؛ يجب استكمال صفحات المراجعة.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'فشل التحميل');
      if (list) list.textContent = '';
    }
  };
  root.querySelector('#qc-receive-refresh')?.addEventListener('click', () => { void load(); });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/v2/inventory/receipts/quarantine', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: fields.get('itemId'), lotNumber: fields.get('lotNumber'),
          quantity: fields.get('quantity'), expiryDate: fields.get('expiryDate'),
          idempotencyKey: 'receipt_' + crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error('تم رفض الاستلام: الصنف أو التشغيلية أو تاريخ الصلاحية غير صالح أو مكرر');
      form.reset();
      await load();
      say('تم الاستلام بالحجر، ولم يُضاف أي رصيد متاح للصرف.');
    } catch (error) {
      say(error instanceof Error ? error.message : 'فشل الاستلام');
    } finally {
      if (button) button.disabled = false;
    }
  });
  await load();
}
