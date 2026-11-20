import type { User } from '../types';
import { escapeHtml } from './common';

type Finding = { invoiceId?: string; journalId?: string; status: string; errors: string[] };

export async function renderFinanceAuditPilot(root: HTMLElement, user: User) {
  if (!['Owner','Accountant'].includes(user.role)) return;
  root.innerHTML = '<section dir="rtl" class="bg-white border rounded-xl p-4 space-y-3">' +
    '<h2 class="font-bold">تدقيق الفواتير والقيود — قراءة فقط</h2>' +
    '<p class="text-xs text-rose-900">هذا الفحص لا يصدر فواتير ولا يرحّل قيودًا ولا يُدخل دفعات. توازن رأس قيد اليومية لا يثبت صحة بنوده أو اعتمادها.</p>' +
    '<button id="finance-audit-refresh" type="button" class="rounded border px-3 py-2 text-xs">إعادة فحص أول 25 سجلًا</button>' +
    '<p id="finance-audit-status" role="status" class="text-xs"></p>' +
    '<div id="finance-invoice-audit" class="overflow-x-auto"></div>' +
    '<div id="finance-journal-audit" class="overflow-x-auto"></div></section>';
  const status = root.querySelector<HTMLElement>('#finance-audit-status');
  const show = (node: HTMLElement | null, heading: string, items: Finding[]) => {
    if (!node) return;
    node.innerHTML = '<h3 class="font-semibold text-sm">' + escapeHtml(heading) + '</h3>' +
      '<table class="w-full text-xs"><thead><tr><th class="border p-2">السجل</th>' +
      '<th class="border p-2">نتيجة الفحص</th></tr></thead><tbody>' +
      items.map(item => '<tr><td class="border p-2">' +
        escapeHtml(item.invoiceId || item.journalId || '') +
        '</td><td class="border p-2">' +
        (item.errors.length ? escapeHtml(item.errors.join(', ')) : 'لا يوجد فرق في فحص الرأس') +
        '</td></tr>').join('') + '</tbody></table>';
  };
  const load = async () => {
    try {
      const get = async (type: 'invoices' | 'journals') => {
        const response = await fetch('/api/v2/finance/audit/' + type + '?limit=25', {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('فشل التدقيق أو ليس لديك صلاحية');
        const data = await response.json() as {
          items: Finding[]; nextCursor: string | null; readOnly: boolean; lineItemsVerified?: boolean;
        };
        if (!data.readOnly) throw new Error('فشل ضمان التدقيق دون كتابة');
        return data;
      };
      const [invoices, journals] = await Promise.all([get('invoices'), get('journals')]);
      show(root.querySelector('#finance-invoice-audit'), 'فروق الفواتير والمدفوعات', invoices.items);
      show(root.querySelector('#finance-journal-audit'), 'توازن رؤوس القيود فقط', journals.items);
      if (status) status.textContent = invoices.nextCursor || journals.nextCursor
        ? 'تُعرض أول 25 سجلًا فقط؛ يجب استكمال صفحات المراجعة.'
        : 'تم التدقيق دون أي تعديل على الأرصدة. لا يعني ذلك اعتماد المحاسبة كاملة.';
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : 'تعذر التدقيق';
    }
  };
  root.querySelector('#finance-audit-refresh')?.addEventListener('click', () => { void load(); });
  await load();
}
