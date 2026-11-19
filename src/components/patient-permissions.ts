import { authService } from '../auth/auth.service';
import { escapeHtml } from './common';

type PermissionRow = { role: string; resource: string; action: string; allowed: boolean };
const actions = ['view', 'add', 'edit', 'delete'] as const;
const actionLabels: Record<string, string> = {
  view: 'عرض', add: 'إضافة', edit: 'تعديل', delete: 'حذف / تعطيل',
};
const resources = [
  { id: 'patients', label: 'المرضى' },
  { id: 'requests', label: 'طلبات التحاليل' },
  { id: 'samples', label: 'العينات' },
  { id: 'results', label: 'النتائج الأولية' },
  { id: 'invoiceDrafts', label: 'عروض السعر غير الصادرة' },
  { id: 'inventoryMovements', label: 'حركات صرف المخزون' },
  { id: 'inventoryReceipts', label: 'استلام التشغيلات بالحجر' },
] as const;

/** Only policy for the protected MySQL v2 APIs; never changes legacy Dexie grants. */
export async function renderServerPatientPermissions(element: HTMLElement): Promise<void> {
  if (authService.getCurrentUser()?.role !== 'Developer') return;
  element.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <h2 class="font-bold text-slate-900">مصفوفة صلاحيات العمليات الآمنة على MySQL 5.5</h2>
      <p class="text-xs text-amber-800">هذه الصلاحيات تخص عمليات السيرفر الجديدة فقط. ليست موافقة على تشغيل الشاشات القديمة أو إصدار النتائج والفواتير.</p>
      <label class="block text-sm">اختر الوحدة
        <select id="server-policy-resource" class="block border rounded p-2">
          ${resources.map(item => `<option value="${item.id}">${item.label}</option>`).join('')}
        </select>
      </label>
      <div id="server-patient-permissions-state" role="status" class="text-xs text-slate-600"></div>
      <div id="server-patient-permissions-table" class="overflow-x-auto">جاري تحميل الصلاحيات...</div>
    </div>`;
  const state = element.querySelector<HTMLElement>('#server-patient-permissions-state');
  const host = element.querySelector<HTMLElement>('#server-patient-permissions-table');
  const select = element.querySelector<HTMLSelectElement>('#server-policy-resource');
  const notify = (value: string) => { if (state) state.textContent = value; };
  let requestCounter = 0;
  const load = async () => {
    const resource = select?.value || 'patients';
    const counter = ++requestCounter;
    if (host) host.textContent = 'جاري تحميل الصلاحيات...';
    try {
      const response = await fetch('/api/v2/permissions?resource=' + encodeURIComponent(resource), {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Server permission API unavailable');
      const result = await response.json() as { permissions: PermissionRow[] };
      if (counter !== requestCounter || !host) return;
      const rows = result.permissions;
      const roles = ['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'];
      host.innerHTML = `
        <table class="w-full text-xs text-start border-collapse">
          <thead><tr><th class="border p-2">الدور</th>
            ${actions.map(a => `<th class="border p-2">${actionLabels[a]}</th>`).join('')}
          </tr></thead>
          <tbody>${roles.map(role => `
            <tr><td class="border p-2 font-semibold">${escapeHtml(role)}</td>
            ${actions.map(action => {
              const match = rows.find(row => row.role === role && row.action === action);
              return `<td class="border p-2 text-center">
                <input type="checkbox" data-role="${role}" data-action="${action}"
                  ${match?.allowed ? 'checked' : ''}
                  aria-label="${role} ${actionLabels[action]}"></td>`;
            }).join('')}</tr>`).join('')}
          </tbody>
        </table>`;
      host.querySelectorAll<HTMLInputElement>('input[data-role]')?.forEach(input => {
        input.addEventListener('change', async () => {
          input.disabled = true;
          const allowed = input.checked;
          try {
            const res = await fetch('/api/v2/permissions', {
              method: 'PUT', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: input.dataset.role, resource,
                action: input.dataset.action, allowed,
              }),
            });
            if (!res.ok) throw new Error('Server rejected permission update');
            notify('تم حفظ صلاحية السيرفر: ' + resource + ' / ' + input.dataset.role);
          } catch {
            input.checked = !allowed;
            notify('تعذر حفظ الصلاحية. لم يتم تغيير الاختيار على السيرفر.');
          } finally {
            input.disabled = false;
          }
        });
      });
      notify('الصلاحيات المعروضة محفوظة على السيرفر وتُطبق على API الجديد فقط.');
    } catch {
      if (host && counter === requestCounter) host.textContent = '';
      notify('قاعدة MySQL أو واجهة الصلاحيات غير متاحة؛ لا يتم منح أي صلاحيات افتراضيًا.');
    }
  };
  select?.addEventListener('change', () => { void load(); });
  await load();
}
