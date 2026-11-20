import { escapeHtml } from './common';
import type { User } from '../types';

type PendingLot = {
  receiptId: string; lotId: string; lotNumber: string; itemId: string;
  receivedQuantity: string; expiryDate: string; actorId: string;
};

export async function renderStockQcReviewPanel(root: HTMLElement, user: User): Promise<void> {
  if (user.role !== 'Owner') return;
  root.innerHTML =
    '<section class="bg-white rounded-xl border p-4 space-y-3" dir="rtl">' +
    '<h2 class="font-bold">مراجعة سجلات جودة التشغيلات المحجوزة</h2>' +
    '<p class="text-xs text-rose-800">هذا تسجيل قرار مراجعة مستندات QC فقط، ولا يحرّر الكاشف للصرف. يجب التأكد من فحص الجودة الفعلي خارج هذا النموذج.</p>' +
    '<button id="qc-review-refresh" type="button" class="rounded border px-3 py-1 text-xs">تحديث التشغيلات</button>' +
    '<p id="qc-review-state" role="status" class="text-xs"></p>' +
    '<div id="qc-review-list" class="space-y-2"></div></section>';
  const state = root.querySelector<HTMLElement>('#qc-review-state');
  const host = root.querySelector<HTMLElement>('#qc-review-list');
  const status = (message: string) => { if (state) state.textContent = message; };
  const load = async () => {
    try {
      const response = await fetch('/api/v2/inventory/receipts/quarantine?limit=25', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('غير مصرح بعرض التشغيلات أو قاعدة البيانات غير متاحة');
      const data = await response.json() as { items: PendingLot[]; nextCursor: string | null };
      if (!host) return;
      host.innerHTML = data.items.length ? data.items.map((lot, index) =>
        '<form data-qc-index="' + index + '" class="rounded border p-3 space-y-2">' +
          '<p class="font-semibold text-xs">الصنف: ' + escapeHtml(lot.itemId) +
          ' | رقم التشغيلة: ' + escapeHtml(lot.lotNumber) +
          ' | الكمية: ' + escapeHtml(lot.receivedQuantity) +
          ' | الصلاحية: ' + escapeHtml(lot.expiryDate) + '</p>' +
          '<p class="text-xs">المستلم: ' + escapeHtml(lot.actorId) + '</p>' +
          '<label class="block text-xs">القرار<select name="verdict" class="block border rounded p-2" required>' +
          '<option value="">اختر القرار</option><option value="pass">مطابقة المستندات</option>' +
          '<option value="fail">رفض المستندات أو الفحص</option></select></label>' +
          '<label class="block text-xs">مرجع تقرير QC وملاحظات التحقق (12 حرفًا على الأقل)' +
          '<textarea name="evidence" minlength="12" maxlength="500" required class="block border rounded w-full p-2"></textarea></label>' +
          '<button type="submit" class="rounded bg-indigo-700 text-white text-xs px-3 py-2">تسجيل قرار مراجعة مستقل</button>' +
        '</form>').join('') : '<p class="text-xs">لا توجد تشغيلات في انتظار المراجعة.</p>';
      host.querySelectorAll<HTMLFormElement>('form[data-qc-index]').forEach(form => {
        const lot = data.items[Number(form.dataset.qcIndex)];
        if (!lot) return;
        // Keep the exact idempotency key on retry within the current form.
        const key = 'qc_' + crypto.randomUUID();
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (button) button.disabled = true;
          const fields = new FormData(form);
          try {
            const response = await fetch('/api/v2/inventory/qc/reviews', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                receiptId: lot.receiptId, verdict: fields.get('verdict'),
                evidence: fields.get('evidence'), idempotencyKey: key,
              }),
            });
            if (!response.ok) throw new Error('رُفض القرار بسبب الصلاحيات أو التكرار أو حالة التشغيلة');
            status('سُجل القرار دون تحرير أي كمية متاحة للصرف. يُلزم إجراء اعتماد منفصل قبل الاستخدام.');
            await load();
          } catch (error) {
            status(error instanceof Error ? error.message : 'فشلت المراجعة');
            if (button) button.disabled = false;
          }
        });
      });
      if (data.nextCursor) status('تُعرض أول 25 تشغيلة فقط؛ لم تُراجع بقية الصفحات.');
    } catch (error) {
      if (host) host.textContent = '';
      status(error instanceof Error ? error.message : 'لا يمكن تحميل قائمة المراجعة');
    }
  };
  root.querySelector('#qc-review-refresh')?.addEventListener('click', () => { void load(); });
  await load();
}
