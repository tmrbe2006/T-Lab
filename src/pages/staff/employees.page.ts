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
import type { Employee, RoleName } from '../../types';

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
              ${(['Developer', 'Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'] as RoleName[])
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
