import { authService } from '../auth/auth.service';
import { escapeHtml } from './common';

type StaffRole = 'Owner' | 'Doctor' | 'Chemist' | 'Technician' | 'Receptionist' | 'Accountant';
type StaffItem = { id: string; username: string; role: StaffRole; active: boolean };
const roles: StaffRole[] = ['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  const json = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(json.error || `Request failed: ${response.status}`);
  return json;
}

function options(current: StaffRole): string {
  return roles.map(role => `<option value="${role}" ${role === current ? 'selected' : ''}>${role}</option>`).join('');
}

/** Developer only. Never expose password hashes or legacy browser-only accounts. */
export async function renderStaffAdminPanel(container: HTMLElement): Promise<void> {
  if (authService.getCurrentUser()?.role !== 'Developer') return;
  container.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h2 class="text-lg font-bold text-slate-900">حسابات الموظفين المؤمنة على سيرفر MySQL</h2>
      <p class="text-xs text-amber-800">مرحلة انتقالية: يمكن إنشاء حسابات واختبار المصادقة، لكن الوظائف الطبية والمحاسبية للموظفين لن تفتح قبل اكتمال صلاحيات API على السيرفر.</p>
      <form id="secure-staff-add" class="flex flex-wrap items-end gap-2">
        <label class="text-xs text-slate-700">اسم المستخدم
          <input name="username" autocomplete="off" required minlength="3" class="block rounded border p-2" pattern="[A-Za-z][A-Za-z0-9_.-]{2,63}" />
        </label>
        <label class="text-xs text-slate-700">كلمة مرور جديدة (12 حرفًا على الأقل)
          <input name="password" type="password" autocomplete="new-password" required minlength="12" class="block rounded border p-2" />
        </label>
        <label class="text-xs text-slate-700">الدور
          <select name="role" class="block rounded border p-2">${options('Receptionist')}</select>
        </label>
        <button type="submit" class="rounded bg-indigo-700 text-white px-4 py-2 text-xs">إضافة الحساب</button>
      </form>
      <div id="secure-staff-message" role="status" class="text-sm text-slate-700"></div>
      <div id="secure-staff-list" class="space-y-2">جارٍ تحميل حسابات السيرفر...</div>
    </div>`;

  const message = container.querySelector<HTMLElement>('#secure-staff-message');
  const list = container.querySelector<HTMLElement>('#secure-staff-list');
  const notify = (value: string) => { if (message) message.textContent = value; };
  const refresh = async () => {
    const result = await request<{ users: StaffItem[] }>('/api/auth/staff');
    if (!list) return;
    list.innerHTML = result.users.length
      ? result.users.map((item) => `
      <div class="flex flex-wrap gap-2 items-center border rounded p-2 text-xs" data-staff-id="${escapeHtml(item.id)}">
        <span class="font-semibold min-w-28">${escapeHtml(item.username)}</span>
        <span>${item.active ? 'نشط' : 'معطل'}</span>
        <select data-action="role" class="rounded border p-1">${options(item.role)}</select>
        <button data-action="change-role" class="rounded border px-2 py-1">تحديث الدور</button>
        <button data-action="toggle" class="rounded border px-2 py-1">${item.active ? 'تعطيل' : 'تفعيل'}</button>
        <button data-action="reset-password" class="rounded border px-2 py-1">تغيير كلمة المرور</button>
      </div>`).join('')
      : '<p class="text-xs">لا توجد حسابات موظفين مؤمنة حتى الآن.</p>';

    result.users.forEach((item) => {
      const row = Array.from(list.querySelectorAll<HTMLElement>('[data-staff-id]'))
        .find(el => el.dataset.staffId === item.id);
      row?.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button => {
        button.addEventListener('click', async () => {
          const action = button.dataset.action;
          let change: Record<string, unknown>;
          if (action === 'toggle') {
            if (!window.confirm(`${item.active ? 'تعطيل' : 'تفعيل'} حساب ${item.username}؟`)) return;
            change = { active: !item.active };
          } else if (action === 'reset-password') {
            const password = window.prompt('كلمة المرور الجديدة (12 حرفًا على الأقل)');
            if (password === null) return;
            change = { password };
          } else {
            const role = row?.querySelector<HTMLSelectElement>('select[data-action="role"]')?.value;
            if (!role) return;
            change = { role };
          }
          try {
            await request('/api/auth/staff/' + encodeURIComponent(item.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change),
            });
            notify('تم حفظ التعديل على سيرفر الحسابات.');
            await refresh();
          } catch (error) { notify(error instanceof Error ? error.message : String(error)); }
        });
      });
    });
  };

  container.querySelector<HTMLFormElement>('#secure-staff-add')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    try {
      await request('/api/auth/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fields.get('username'), password: fields.get('password'), role: fields.get('role'),
        }),
      });
      form.reset();
      notify('تم إنشاء حساب الموظف بنجاح.');
      await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : String(error)); }
  });

  try { await refresh(); }
  catch (error) {
    notify(error instanceof Error ? error.message : String(error));
    if (list) list.textContent = 'تعذر الاتصال بجدول حسابات MySQL؛ تحقق من اتصال السيرفر.';
  }
}
