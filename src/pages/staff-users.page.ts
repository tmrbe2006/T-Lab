import { authService } from '../auth/auth.service';
import { openCustomModal, openDeleteConfirmModal } from '../components/modal';
import { showToast } from '../components/toast';
import { ALL_ACTIONS, ALL_RESOURCES } from '../db/seed';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import { permissionsRepository, usersRepository } from '../repositories';
import type { Employee, PermissionAction, RoleName, User } from '../types';

export async function renderEmployeesPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let employees = await usersRepository.getAllEmployees();

  const openEmpForm = (existing?: Employee) => {
    const isEdit = Boolean(existing);
    openCustomModal(
      isEdit ? i18n.bi('تعديل بيانات موظف', 'Edit Employee') : i18n.bi('إضافة موظف جديد', 'Add Employee'),
      `
        <form id="emp-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الاسم بالعربي *', 'Arabic Name *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الاسم بالإنجليزي *', 'English Name *')}</label>
            <input name="nameEn" required value="${existing?.nameEn || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الدور الوظيفي', 'Role')}</label>
            <select name="role" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${(['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'] as RoleName[])
                .map((r) => `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${i18n.dict.roles[r]}</option>`)
                .join('')}
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('القسم', 'Department')}</label>
            <input name="department" required value="${existing?.department || 'المختبر العام'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.dict.common.phone}</label>
            <input name="phone" required value="${existing?.phone || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الراتب الأساسي', 'Base Salary')}</label>
            <input name="salary" type="number" min="0" value="${existing?.salary ?? 9000}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="sm:col-span-2 flex justify-end pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('emp-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission(isEdit ? 'edit' : 'add', 'employees'))) {
            showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
            return;
          }
          const fd = new FormData(form);
          const rec: Employee = {
            id: existing?.id || `emp_${Date.now()}`,
            code: existing?.code || `EMP-00${employees.length + 1}`,
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            role: (fd.get('role') as RoleName) || 'Technician',
            department: String(fd.get('department') || '').trim(),
            phone: String(fd.get('phone') || '').trim(),
            salary: Number(fd.get('salary')) || 0,
            active: true,
            joinedAt: existing?.joinedAt || '2026-11-09',
          };
          await usersRepository.saveEmployee(rec);
          await authService.logAudit(isEdit ? `تعديل موظف: ${rec.nameAr}` : `إضافة موظف: ${rec.nameAr}`, 'employees', rec.id);
          showToast(i18n.bi('تم حفظ بيانات الموظف', 'Employee saved'), 'success');
          close();
          employees = await usersRepository.getAllEmployees();
          renderView();
        });
      }
    );
  };

  const renderView = () => {
    const canAdd = can(user, 'add', 'employees');
    const canEdit = can(user, 'edit', 'employees');
    const canDelete = can(user, 'delete', 'employees');
    const canPrint = can(user, 'print', 'employees');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.employees}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدارة فريق العمل والأقسام الطبية والإدارية', 'Manage laboratory staff, roles, and departments')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="emp-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canAdd ? `<button id="emp-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.name}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الدور', 'Role')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('القسم', 'Department')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.phone}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الراتب', 'Salary')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${employees
                .map(
                  (e) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono font-semibold tabular-nums">${e.code}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-900">${i18n.bi(e.nameAr, e.nameEn)}</td>
                    <td class="py-2.5 px-3 text-slate-700">${i18n.dict.roles[e.role]}</td>
                    <td class="py-2.5 px-3 text-slate-600">${e.department}</td>
                    <td class="py-2.5 px-3 font-mono tabular-nums">${e.phone}</td>
                    <td class="py-2.5 px-3 font-mono tabular-nums">${e.salary.toLocaleString()} EGP</td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        ${canEdit ? `<button data-edit="${e.id}" class="emp-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>` : ''}
                        ${canDelete ? `<button data-del="${e.id}" class="emp-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>` : ''}
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

    document.getElementById('emp-add-btn')?.addEventListener('click', () => openEmpForm());
    document.getElementById('emp-print-btn')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>Code</th><th>Name</th><th>Role</th><th>Department</th><th>Phone</th></tr></thead>
          <tbody>
            ${employees.map((e) => `<tr><td class="tabular-nums">${e.code}</td><td>${i18n.bi(e.nameAr, e.nameEn)}</td><td>${e.role}</td><td>${e.department}</td><td class="tabular-nums">${e.phone}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.employees, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.emp-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = employees.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openEmpForm(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.emp-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = employees.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${i18n.bi('الموظف:', 'Employee:')} ${target.nameAr}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'employees'))) return;
            await usersRepository.deleteEmployee(target.id);
            await authService.logAudit(`حذف موظف: ${target.nameAr}`, 'employees', target.id, reason || '');
            showToast(i18n.bi('تم حذف الموظف بنجاح', 'Employee deleted'), 'success');
            employees = await usersRepository.getAllEmployees();
            renderView();
          },
        });
      });
    });
  };

  renderView();
}

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
            <input name="passwordHash" required value="${existing?.passwordHash || '123456'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
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

export async function renderPermissionsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let selectedRole: RoleName = 'Receptionist';
  let rolePerms = await permissionsRepository.getPermissionsByRole(selectedRole);

  const keyActions: PermissionAction[] = [
    'view',
    'add',
    'edit',
    'delete',
    'print',
    'approve',
    'discount',
    'addPayment',
    'payCommission',
    'closeDay',
  ];

  const renderMatrix = () => {
    const canManage = can(user, 'managePermissions', 'permissions') || can(user, 'edit', 'permissions');
    const canPrint = can(user, 'print', 'permissions');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.permissions}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'مصفوفة الصلاحيات الديناميكية: تحكم في ظهور الأزرار والوصول للشاشات لكل دور وظيفي',
                'Dynamic RBAC Permission Matrix: Controls sidebar links, route guards, and action buttons per role'
              )}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="perm-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canManage ? `<button id="perm-save-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">${i18n.dict.actions.save}</button>` : ''}
          </div>
        </div>

        <!-- Role Switcher Tabs -->
        <div class="flex flex-wrap items-center gap-1.5 bg-slate-200/70 p-1.5 rounded-xl">
          ${(['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'] as RoleName[])
            .map(
              (r) => `
              <button
                type="button"
                data-role="${r}"
                class="perm-role-tab px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedRole === r ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-white/60'
                }"
              >
                ${i18n.dict.roles[r]} (${r})
              </button>
            `
            )
            .join('')}
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th class="py-3 px-3 text-start">${i18n.bi('الشاشة / المورد', 'Screen / Resource')}</th>
                ${keyActions
                  .map(
                    (act) => `<th class="py-3 px-2 text-center">${i18n.dict.actions[act] || act}</th>`
                  )
                  .join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${ALL_RESOURCES.map((res) => {
                const rp = rolePerms.find((p) => p.resource === res);
                const navTitle = (i18n.dict.nav as Record<string, string>)[res] || res;
                return `
                  <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-bold text-slate-900">${navTitle} <span class="text-slate-400 font-mono text-[10px]">(${res})</span></td>
                    ${keyActions
                      .map((act) => {
                        const checked = rp?.actions?.[act] ? 'checked' : '';
                        const disabled = !canManage || selectedRole === 'Owner' ? 'disabled' : '';
                        return `
                          <td class="py-2.5 px-2 text-center">
                            <input
                              type="checkbox"
                              data-res="${res}"
                              data-act="${act}"
                              ${checked}
                              ${disabled}
                              class="perm-chk w-4 h-4 accent-sky-600 rounded cursor-pointer"
                            />
                          </td>
                        `;
                      })
                      .join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.querySelectorAll<HTMLButtonElement>('.perm-role-tab').forEach((tab) => {
      tab.addEventListener('click', async () => {
        selectedRole = (tab.getAttribute('data-role') as RoleName) || 'Receptionist';
        rolePerms = await permissionsRepository.getPermissionsByRole(selectedRole);
        renderMatrix();
      });
    });

    document.getElementById('perm-save-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('managePermissions', 'permissions'))) {
        showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
        return;
      }
      const checkboxes = document.querySelectorAll<HTMLInputElement>('.perm-chk');
      const mapByRes = new Map(rolePerms.map((p) => [p.resource, p]));

      checkboxes.forEach((chk) => {
        const res = chk.getAttribute('data-res') || '';
        const act = (chk.getAttribute('data-act') || 'view') as PermissionAction;
        const entry = mapByRes.get(res as typeof ALL_RESOURCES[number]);
        if (entry) {
          entry.actions[act] = chk.checked;
        }
      });

      await permissionsRepository.saveBulkPermissions(Array.from(mapByRes.values()));
      await authService.reloadPermissionsCache();
      await authService.logAudit(
        `تحديث مصفوفة صلاحيات الدور: ${selectedRole}`,
        'permissions',
        selectedRole
      );
      showToast(
        i18n.bi(`تم حفظ وتطبيق صلاحيات دور (${i18n.dict.roles[selectedRole]}) بنجاح`, `Permissions saved for ${selectedRole}`),
        'success'
      );
    });

    document.getElementById('perm-print-btn')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.bi('الشاشة', 'Screen')}</th>
              ${keyActions.map((a) => `<th>${i18n.dict.actions[a] || a}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${ALL_RESOURCES.map((res) => {
              const rp = rolePerms.find((p) => p.resource === res);
              const navTitle = (i18n.dict.nav as Record<string, string>)[res] || res;
              return `
                <tr>
                  <td>${navTitle}</td>
                  ${keyActions.map((a) => `<td style="text-align:center;">${rp?.actions?.[a] ? '✓' : '-'}</td>`).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(
        `${i18n.dict.nav.permissions} — ${i18n.dict.roles[selectedRole]}`,
        html
      );
    });
  };

  renderMatrix();
}
