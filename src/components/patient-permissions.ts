import { authService } from '../auth/auth.service';
import { escapeHtml } from './common';

type PermissionRow = { role: string; resource: string; action: string; allowed: boolean };
const actions = ['view', 'add', 'edit', 'delete'] as const;
const actionLabels: Record<string, string> = {
  view: 'عرض', add: 'إضافة', edit: 'تعديل', delete: 'تعطيل السجل',
};

export async function renderServerPatientPermissions(element: HTMLElement): Promise<void> {
  if (authService.getCurrentUser()?.role !== 'Developer') return;
  element.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <h2 class="font-bold text-slate-900">صلاحيات ملف المرضى على سيرفر MySQL</h2>
      <p class="text-xs text-amber-800">تُطبق هذه الصلاحيات على واجهة /api/v2/patients فقط. باقي شاشات البرنامج لا تستخدمها بعد.</p>
      <div id="server-patient-permissions-state" role="status" class="text-xs text-slate-600"></div>
      <div id="server-patient-permissions-table" class="overflow-x-auto">تحميل الصلاحيات...</div>
    </div>`;
  const state = element.querySelector<HTMLElement>('#server-patient-permissions-state');
  const host = element.querySelector<HTMLElement>('#server-patient-permissions-table');
  const notify = (value: string) => { if (state) state.textContent = value; };
  try {
    const result = await fetch('/api/v2/permissions?resource=patients', { credentials: 'same-origin' });
    if (!result.ok) throw new Error('MySQL permission API not available');
    const json = await result.json() as { permissions: PermissionRow[] };
    const rows = json.permissions;
    if (!host) return;
    host.innerHTML = `
      <table class="w-full text-xs text-start border-collapse">
        <thead><tr><th class="border p-2">الدور</th>${actions.map(a => `<th class="border p-2">${actionLabels[a]}</th>`).join('')}</tr></thead>
        <tbody>${[...new Set(rows.map(row => row.role))].sort().map(role => `
          <tr><td class="border p-2 font-semibold">${escapeHtml(role)}</td>
          ${actions.map(action => {
            const current = rows.find(row => row.role === role && row.action === action);
            return `<td class="border p-2 text-center"><input type="checkbox" data-role="${escapeHtml(role)}" data-action="${action}" ${current?.allowed ? 'checked' : ''} aria-label="${escapeHtml(role)} ${actionLabels[action]}"></td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table>`;
    host.querySelectorAll<HTMLInputElement>('input[data-role]')?.forEach(input => {
      input.addEventListener('change', async () => {
        input.disabled = true;
        const granted = input.checked;
        try {
          const res = await fetch('/api/v2/permissions', {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: input.dataset.role, resource: 'patients',
              action: input.dataset.action, allowed: granted,
            }),
          });
          if (!res.ok) throw new Error('Permission update was rejected');
          notify('تم حفظ صلاحية ' + String(input.dataset.role) + ' / ' + String(input.dataset.action));
        } catch (error) {
          input.checked = !granted;
          notify(error instanceof Error ? error.message : 'Unable to update permission');
        } finally { input.disabled = false; }
      });
    });
  } catch {
    notify('غير متاح حتى اتصال MySQL وإنشاء جداول الصلاحيات على سيرفر الاختبار.');
    if (host) host.textContent = '';
  }
}
