import { authService } from '../auth/auth.service';
import { openCustomModal, openDeleteConfirmModal } from '../components/modal';
import { showToast } from '../components/toast';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import { doctorsRepository } from '../repositories';
import type { Doctor, DoctorType } from '../types';

export async function renderDoctorsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let allDoctors = await doctorsRepository.getAll();
  let searchQuery = '';

  const getFiltered = (): Doctor[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allDoctors;
    return allDoctors.filter(
      (d) =>
        d.nameAr.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q)
    );
  };

  const openDoctorForm = (existing?: Doctor) => {
    const isEdit = Boolean(existing);
    openCustomModal(
      isEdit
        ? i18n.bi(`تعديل بيانات الطبيب: ${existing?.nameAr}`, `Edit Doctor: ${existing?.nameEn}`)
        : i18n.bi('إضافة طبيب محول / متعاقد جديد', 'Add Referring / Contracted Doctor'),
      `
        <form id="doctor-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم الطبيب (عربي) *', 'Doctor Name (Arabic) *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم الطبيب (إنجليزي) *', 'Doctor Name (English) *')}</label>
            <input name="nameEn" required value="${existing?.nameEn || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('التخصص الطبي', 'Specialty')}</label>
            <input name="specialty" required value="${existing?.specialty || 'باطنة عامة'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.phone}</label>
            <input name="phone" required value="${existing?.phone || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('نوع التعاقد', 'Doctor Type')}</label>
            <select name="type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="referred" ${existing?.type === 'referred' ? 'selected' : ''}>${i18n.bi('طبيب محول خارجي (Referred)', 'External Referring Doctor')}</option>
              <option value="contracted" ${existing?.type === 'contracted' ? 'selected' : ''}>${i18n.bi('طبيب متعاقد (Contracted)', 'Contracted Doctor')}</option>
              <option value="internal" ${existing?.type === 'internal' ? 'selected' : ''}>${i18n.bi('طبيب داخلي بالمعمل (Internal)', 'Internal Lab Doctor')}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('نسبة عمولة الطبيب الافتراضية (%) *', 'Default Commission Rate (%) *')}</label>
            <input name="commissionRate" type="number" min="0" max="60" step="0.5" required value="${existing?.commissionRate ?? 15}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('تفعيل احتساب العمولة؟', 'Commission Active?')}</label>
            <select name="commissionEnabled" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.commissionEnabled !== false ? 'selected' : ''}>${i18n.bi('نعم - فعالة', 'Yes - Active')}</option>
              <option value="false" ${existing?.commissionEnabled === false ? 'selected' : ''}>${i18n.bi('لا - غير فعالة', 'No - Disabled')}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.status}</label>
            <select name="active" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.active !== false ? 'selected' : ''}>${i18n.dict.common.active}</option>
              <option value="false" ${existing?.active === false ? 'selected' : ''}>${i18n.dict.common.inactive}</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.notes}</label>
            <input name="notes" value="${existing?.notes || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 flex justify-end pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('doctor-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const allowed = await enforcePermission(isEdit ? 'edit' : 'add', 'doctors');
          if (!allowed) {
            showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
            return;
          }
          const fd = new FormData(form);
          const docType = (fd.get('type') as DoctorType) || 'referred';
          const rate = docType === 'internal' ? 0 : Math.max(0, Number(fd.get('commissionRate')) || 0);
          const record: Doctor = {
            id: existing?.id || `doc_${Date.now()}`,
            code: existing?.code || `DOC-0${allDoctors.length + 1}`,
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            specialty: String(fd.get('specialty') || '').trim(),
            phone: String(fd.get('phone') || '').trim(),
            type: docType,
            commissionRate: rate,
            commissionEnabled: docType !== 'internal' && fd.get('commissionEnabled') === 'true',
            notes: String(fd.get('notes') || '').trim(),
            active: fd.get('active') === 'true',
          };
          await doctorsRepository.save(record);
          await authService.logAudit(
            isEdit ? `تعديل طبيب: ${record.nameAr}` : `إضافة طبيب: ${record.nameAr}`,
            'doctors',
            record.id,
            `Commission Rate: ${record.commissionRate}%`
          );
          showToast(i18n.bi('تم حفظ بيانات الطبيب بنجاح', 'Doctor saved successfully'), 'success');
          close();
          allDoctors = await doctorsRepository.getAll();
          renderTable();
        });
      }
    );
  };

  const renderTable = () => {
    const rows = getFiltered();
    const canAdd = can(user, 'add', 'doctors');
    const canEdit = can(user, 'edit', 'doctors');
    const canDelete = can(user, 'delete', 'doctors');
    const canPrint = can(user, 'print', 'doctors');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.doctors}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة الأطباء المحولين ونسب العمولة الافتراضية (تُحسب فقط على المبالغ المحصلة من الطلبات المحولة)',
                'Manage referring doctors and default commission percentages (calculated strictly on collected referred requests)'
              )}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${
              canPrint
                ? `<button id="doc-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>`
                : ''
            }
            ${
              canAdd
                ? `<button id="doc-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>`
                : ''
            }
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <input
            id="doc-search-input"
            type="search"
            value="${searchQuery}"
            placeholder="${i18n.dict.actions.search}"
            class="w-full sm:w-80 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs focus:border-sky-600 focus:outline-none"
          />
          <span class="text-xs text-slate-500 font-mono tabular-nums">${rows.length} / ${allDoctors.length}</span>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم الطبيب (عربي / إنجليزي)', 'Doctor Name (AR / EN)')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التخصص', 'Specialty')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النوع', 'Type')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('نسبة الطبيب الافتراضية', 'Commission Rate %')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.phone}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map(
                  (d) => `
                  <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-mono font-semibold text-slate-700 tabular-nums">${d.code}</td>
                    <td class="py-2.5 px-3">
                      <div class="font-bold text-slate-900">${d.nameAr}</div>
                      <div class="text-[11px] text-slate-500">${d.nameEn}</div>
                    </td>
                    <td class="py-2.5 px-3 text-slate-700">${d.specialty}</td>
                    <td class="py-2.5 px-3 text-slate-600">${d.type}</td>
                    <td class="py-2.5 px-3 font-mono font-bold ${d.commissionEnabled ? 'text-emerald-700' : 'text-slate-400'} tabular-nums">
                      ${d.commissionRate}% ${d.commissionEnabled ? '' : '(Disabled)'}
                    </td>
                    <td class="py-2.5 px-3 font-mono text-slate-600 tabular-nums">${d.phone}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        ${
                          canEdit
                            ? `<button type="button" data-edit-id="${d.id}" class="doc-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>`
                            : ''
                        }
                        ${
                          canDelete
                            ? `<button type="button" data-del-id="${d.id}" class="doc-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>`
                            : ''
                        }
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

    const searchInput = document.getElementById('doc-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderTable();
      const newInput = document.getElementById('doc-search-input') as HTMLInputElement | null;
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    document.getElementById('doc-add-btn')?.addEventListener('click', () => openDoctorForm());

    document.getElementById('doc-print-btn')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.dict.common.code}</th>
              <th>${i18n.dict.common.name}</th>
              <th>${i18n.bi('التخصص', 'Specialty')}</th>
              <th>${i18n.bi('النوع', 'Type')}</th>
              <th>${i18n.bi('نسبة الطبيب %', 'Commission %')}</th>
              <th>${i18n.dict.common.phone}</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (d) => `
                <tr>
                  <td class="tabular-nums">${d.code}</td>
                  <td>${d.nameAr} / ${d.nameEn}</td>
                  <td>${d.specialty}</td>
                  <td>${d.type}</td>
                  <td class="tabular-nums">${d.commissionRate}%</td>
                  <td class="tabular-nums">${d.phone}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.doctors, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.doc-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-id');
        const target = allDoctors.find((d) => d.id === id);
        if (target) openDoctorForm(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.doc-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-id');
        const target = allDoctors.find((d) => d.id === id);
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${i18n.bi('الطبيب:', 'Doctor:')} ${target.nameAr} (${target.code})`,
          onConfirm: async (reason) => {
            const allowed = await enforcePermission('delete', 'doctors');
            if (!allowed) {
              showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
              return;
            }
            await doctorsRepository.delete(target.id);
            await authService.logAudit(`حذف طبيب: ${target.nameAr}`, 'doctors', target.id, reason || '');
            showToast(i18n.bi(`تم حذف الطبيب ${target.nameAr}`, `Deleted doctor ${target.nameEn}`), 'success');
            allDoctors = await doctorsRepository.getAll();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}
