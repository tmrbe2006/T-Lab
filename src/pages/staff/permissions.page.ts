import { authService } from '../../auth/auth.service';
import { showToast } from '../../components/common';
import { ALL_RESOURCES } from '../../db/seed';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { permissionsRepository } from '../../repositories';
import type { PermissionAction, RoleName } from '../../types';

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
          <div class="flex flex-wrap items-center gap-2">
            ${canManage && selectedRole !== 'Owner' ? `<button id="perm-enable-all-btn" type="button" class="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer">✅ ${i18n.bi('تفعيل جميع القوائم والشاشات لهذا الدور', 'Enable All Menus for Role')}</button>` : ''}
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
                <th class="py-3 px-3 text-start">${i18n.bi('الشاشة / القائمة الفرعية', 'Screen / Menu Item')}</th>
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

    document.getElementById('perm-enable-all-btn')?.addEventListener('click', () => {
      document.querySelectorAll<HTMLInputElement>('.perm-chk').forEach((chk) => {
        chk.checked = true;
      });
      showToast(
        i18n.bi('تم تحديد جميع القوائم والصلاحيات — اضغط (حفظ البيانات) للتأكيد', 'All permissions checked — click Save to confirm'),
        'info'
      );
    });

    document.getElementById('perm-save-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('managePermissions', 'permissions'))) {
        showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
        return;
      }
      const checkboxes = document.querySelectorAll<HTMLInputElement>('.perm-chk');
      const mapByRes = new Map(rolePerms.map((p) => [p.resource, p]));

      checkboxes.forEach((chk) => {
        const res = (chk.getAttribute('data-res') || '') as typeof ALL_RESOURCES[number];
        const act = (chk.getAttribute('data-act') || 'view') as PermissionAction;
        let entry = mapByRes.get(res);
        if (!entry) {
          entry = {
            id: `${selectedRole}_${res}`,
            role: selectedRole,
            resource: res,
            actions: {} as Record<PermissionAction, boolean>,
          };
          mapByRes.set(res, entry);
        }
        entry.actions[act] = chk.checked;
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
