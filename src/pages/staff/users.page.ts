import { authService } from '../../auth/auth.service';
import {
  openCustomModal,
  openDeleteConfirmModal,
  showToast,
} from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { usersRepository } from '../../repositories';
import type { RoleName, User } from '../../types';

export async function renderUsersPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let users = await usersRepository.getAllUsers();
  const employees = await usersRepository.getAllEmployees();

  const openUserForm = (existing?: User) => {
    const isEdit = Boolean(existing);
    openCustomModal(
      isEdit ? i18n.bi('تعديل مستخدم / إعادة تعيين كلمة المرور', 'Edit User / Reset Password') : i18n.bi('إضافة مستخدم جديد', 'Add System User'),
      `
        <form id="usr-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold mb-1">${i18n.dict.login.username} *</label>
            <input name="username" required value="${existing?.username || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.dict.login.password} *</label>
            <input name="passwordHash" type="password" autocomplete="new-password" required value="${existing?.passwordHash || '123456'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الاسم بالعربي *', 'Full Name (AR) *')}</label>
            <input name="fullNameAr" required value="${existing?.fullNameAr || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الاسم بالإنجليزي *', 'Full Name (EN) *')}</label>
            <input name="fullNameEn" required value="${existing?.fullNameEn || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الدور والصلاحية', 'Role')}</label>
            <select name="role" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${(['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'] as RoleName[])
                .map((r) => `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${i18n.dict.roles[r]}</option>`)
                .join('')}
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('ربط بموظف', 'Link to Employee')}</label>
            <select name="employeeId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">--</option>
              ${employees
                .map((e) => `<option value="${e.id}" ${existing?.employeeId === e.id ? 'selected' : ''}>${e.nameAr}</option>`)
                .join('')}
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.dict.common.status}</label>
            <select name="active" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.active !== false ? 'selected' : ''}>${i18n.dict.common.active}</option>
              <option value="false" ${existing?.active === false ? 'selected' : ''}>${i18n.dict.common.inactive}</option>
            </select>
          </div>
          <div class="sm:col-span-2 flex justify-end pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('usr-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission(isEdit ? 'edit' : 'add', 'users'))) return;
          const fd = new FormData(form);
          const rec: User = {
            id: existing?.id || `usr_${Date.now()}`,
            username: String(fd.get('username') || '').trim(),
            passwordHash: String(fd.get('passwordHash') || '').trim(),
            fullNameAr: String(fd.get('fullNameAr') || '').trim(),
            fullNameEn: String(fd.get('fullNameEn') || '').trim(),
            role: (fd.get('role') as RoleName) || 'Receptionist',
            employeeId: String(fd.get('employeeId') || '') || undefined,
            active: fd.get('active') === 'true',
            createdAt: existing?.createdAt || '2026-11-09',
          };
          await usersRepository.saveUser(rec);
          await authService.logAudit(isEdit ? `تعديل مستخدم: ${rec.username}` : `إضافة مستخدم: ${rec.username}`, 'users', rec.id);
          showToast(i18n.bi('تم حفظ حساب المستخدم', 'User account saved'), 'success');
          close();
          users = await usersRepository.getAllUsers();
          renderView();
        });
      }
    );
  };

  const renderView = () => {
    const canAdd = can(user, 'add', 'users');
    const canEdit = can(user, 'edit', 'users');
    const canDelete = can(user, 'delete', 'users');
    const canPrint = can(user, 'print', 'users');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.users}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدارة حسابات الدخول وربطها بالأدوار والموظفين', 'Manage login accounts, roles, and password resets')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="usr-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canAdd ? `<button id="usr-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.login.username}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.name}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الدور', 'Role')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${users
                .map(
                  (u) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${u.username}</td>
                    <td class="py-2.5 px-3 text-slate-800">${i18n.bi(u.fullNameAr, u.fullNameEn)}</td>
                    <td class="py-2.5 px-3 font-semibold text-sky-800">${i18n.dict.roles[u.role]} (${u.role})</td>
                    <td class="py-2.5 px-3">${u.active ? i18n.dict.common.active : i18n.dict.common.inactive}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        ${canEdit ? `<button data-edit="${u.id}" class="usr-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>` : ''}
                        ${canDelete && u.username !== 'owner' ? `<button data-del="${u.id}" class="usr-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('usr-add-btn')?.addEventListener('click', () => openUserForm());
    document.getElementById('usr-print-btn')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            ${users.map((u) => `<tr><td class="tabular-nums">${u.username}</td><td>${i18n.bi(u.fullNameAr, u.fullNameEn)}</td><td>${i18n.dict.roles[u.role]}</td><td>${u.active ? 'Active' : 'Inactive'}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.users, html);
    });
    document.querySelectorAll<HTMLButtonElement>('.usr-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = users.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openUserForm(target);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('.usr-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = users.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${i18n.bi('المستخدم:', 'User:')} ${target.username}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'users'))) return;
            await usersRepository.deleteUser(target.id);
            await authService.logAudit(`حذف مستخدم: ${target.username}`, 'users', target.id, reason || '');
            showToast(i18n.bi('تم حذف المستخدم', 'User deleted'), 'success');
            users = await usersRepository.getAllUsers();
            renderView();
          },
        });
      });
    });
  };

  renderView();
}
