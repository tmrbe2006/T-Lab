import { authService } from '../auth/auth.service';
import {
  bindTablePagination,
  createPaginationControls,
  openCustomModal,
  openDeleteConfirmModal,
  paginateArray,
  showToast,
} from '../components/common';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import { doctorsRepository, lookupsRepository } from '../repositories';
import { router } from '../router';
import type { Doctor, DoctorType } from '../types';

export async function renderDoctorsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [allDoctors, specialties] = await Promise.all([
    doctorsRepository.getAll(),
    lookupsRepository.getDoctorSpecialties(),
  ]);
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

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

  const generateNextDoctorCode = (): string => {
    const nums = allDoctors.map((d) => {
      const m = d.code.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return `DOC-${String(maxNum + 1).padStart(2, '0')}`;
  };

  const printSingleDoctor = (d: Doctor) => {
    const typeLabel =
      d.type === 'referred'
        ? i18n.bi('طبيب محول خارجي (Referred)', 'External Referring Doctor')
        : d.type === 'contracted'
        ? i18n.bi('طبيب متعاقد (Contracted)', 'Contracted Doctor')
        : i18n.bi('طبيب داخلي بالمعمل (Internal)', 'Internal Lab Doctor');

    const html = `
      <div style="border:1px solid #cbd5e1; border-radius:8px; padding:16px; margin-bottom:14px;">
        <h3 style="margin:0 0 12px 0; font-size:15px; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
          ${i18n.bi('بطاقة بيانات الطبيب المسجل', 'Registered Doctor Profile Card')} — ${d.code}
        </h3>
        <table class="print-table">
          <tbody>
            <tr>
              <th style="width:28%;">${i18n.bi('كود الطبيب', 'Doctor Code')}</th>
              <td class="tabular-nums"><strong>${d.code}</strong></td>
              <th style="width:28%;">${i18n.bi('نوع التعاقد', 'Doctor Type')}</th>
              <td>${typeLabel}</td>
            </tr>
            <tr>
              <th>${i18n.bi('اسم الطبيب (عربي)', 'Doctor Name (Arabic)')}</th>
              <td><strong>${d.nameAr}</strong></td>
              <th>${i18n.bi('اسم الطبيب (إنجليزي)', 'Doctor Name (English)')}</th>
              <td dir="ltr"><strong>${d.nameEn}</strong></td>
            </tr>
            <tr>
              <th>${i18n.bi('التخصص الطبي', 'Medical Specialty')}</th>
              <td><strong>${d.specialty}</strong></td>
              <th>${i18n.bi('رقم الهاتف', 'Phone Number')}</th>
              <td class="tabular-nums">${d.phone || '-'}</td>
            </tr>
            <tr>
              <th>${i18n.bi('نسبة عمولة الطبيب الافتراضية', 'Default Commission Rate')}</th>
              <td class="tabular-nums">${d.commissionRate}% (${d.commissionEnabled ? i18n.bi('فعالة', 'Active') : i18n.bi('غير فعالة', 'Disabled')})</td>
              <th>${i18n.dict.common.status}</th>
              <td>${d.active ? i18n.dict.common.active : i18n.dict.common.inactive}</td>
            </tr>
            <tr>
              <th>${i18n.dict.common.notes}</th>
              <td colspan="3">${d.notes || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    printService.printA4(`${i18n.bi('بيانات الطبيب:', 'Doctor Profile:')} ${d.nameAr}`, html);
  };

  const openDoctorForm = async (existing?: Doctor) => {
    specialties = await lookupsRepository.getDoctorSpecialties();
    const activeSpecialties = specialties.filter((s) => s.active !== false);
    const isEdit = Boolean(existing);
    const currentSpec = existing?.specialty || activeSpecialties[0]?.nameAr || 'باطنة عامة';
    const hasCurrentInList = activeSpecialties.some((s) => s.nameAr === currentSpec);

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
            <input name="nameEn" required value="${existing?.nameEn || ''}" dir="ltr" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-semibold text-slate-700">${i18n.bi('التخصص الطبي *', 'Medical Specialty *')}</label>
              <button type="button" id="doc-manage-specs-link" class="text-[11px] font-bold text-sky-700 hover:underline cursor-pointer">
                + ${i18n.bi('إدارة التخصصات', 'Manage Specialties')}
              </button>
            </div>
            <select name="specialty" required class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
              ${
                !hasCurrentInList && currentSpec
                  ? `<option value="${currentSpec}" selected>${currentSpec}</option>`
                  : ''
              }
              ${activeSpecialties
                .map(
                  (s) =>
                    `<option value="${s.nameAr}" ${s.nameAr === currentSpec ? 'selected' : ''}>${s.nameAr}${
                      s.nameEn ? ` — ${s.nameEn}` : ''
                    }</option>`
                )
                .join('')}
            </select>
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
        document.getElementById('doc-manage-specs-link')?.addEventListener('click', () => {
          close();
          router.navigate('doctorSpecialties');
        });

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
            code: existing?.code || generateNextDoctorCode(),
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
            `Specialty: ${record.specialty} | Commission Rate: ${record.commissionRate}%`
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
    const filteredRows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const rows = paginateArray(filteredRows, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filteredRows.length };
    const canAdd = can(user, 'add', 'doctors');
    const canPrint = can(user, 'print', 'doctors');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.doctors}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة الأطباء المحولين، اختيار التخصص من جدول التخصصات الطبية، ونسب العمولة الافتراضية',
                'Manage referring doctors, medical specialties combobox, and default commission percentages'
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="doc-specialties-btn" type="button" class="rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer">
              ${i18n.bi('شاشة تخصصات الأطباء', 'Doctor Specialties')}
            </button>
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
          <span class="text-xs text-slate-500 font-mono tabular-nums">${filteredRows.length} / ${allDoctors.length}</span>
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
                      <div class="text-[11px] text-slate-500" dir="ltr">${d.nameEn}</div>
                    </td>
                    <td class="py-2.5 px-3 font-semibold text-slate-700">${d.specialty}</td>
                    <td class="py-2.5 px-3 text-slate-600">${d.type}</td>
                    <td class="py-2.5 px-3 font-mono font-bold ${d.commissionEnabled ? 'text-emerald-700' : 'text-slate-400'} tabular-nums">
                      ${d.commissionRate}% ${d.commissionEnabled ? '' : '(Disabled)'}
                    </td>
                    <td class="py-2.5 px-3 font-mono text-slate-600 tabular-nums">${d.phone}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-print-id="${d.id}" class="doc-row-print-btn rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                          ${i18n.bi('طباعة', 'Print')}
                        </button>
                        <button type="button" data-edit-id="${d.id}" class="doc-edit-btn rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                          ${i18n.dict.actions.edit}
                        </button>
                        <button type="button" data-del-id="${d.id}" class="doc-del-btn rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                          ${i18n.dict.actions.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${createPaginationControls(pagState, undefined, 'doc-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'doc-pag'
    );

    const searchInput = document.getElementById('doc-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      searchQuery = searchInput.value;
      currentPage = 1;
      renderTable();
      const newInput = document.getElementById('doc-search-input') as HTMLInputElement | null;
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    document.getElementById('doc-specialties-btn')?.addEventListener('click', () => {
      router.navigate('doctorSpecialties');
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

    document.querySelectorAll<HTMLButtonElement>('.doc-row-print-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-print-id');
        const target = allDoctors.find((d) => d.id === id);
        if (target) printSingleDoctor(target);
      });
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
