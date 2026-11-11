import { authService } from '../../auth/auth.service';
import {
  bindSearchInputWithFocus,
  bindTablePagination,
  createPaginationControls,
  openCustomModal,
  openDeleteConfirmModal,
  paginateArray,
  renderSearchFilterBar,
  showToast,
} from '../../components/common';
import { enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { lookupsRepository } from '../../repositories';
import { router } from '../../router';
import type { DoctorSpecialty, SampleTube, ScientificDepartment } from '../../types';

/**
 * 1. شاشة تخصصات الأطباء (Doctor Specialties Screen)
 */
export async function renderDoctorSpecialtiesPage(container: HTMLElement): Promise<void> {
  let rows = await lookupsRepository.getDoctorSpecialties();
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = (): DoctorSpecialty[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.nameAr.toLowerCase().includes(q) ||
        r.nameEn.toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
    );
  };

  const generateNextCode = (): string => {
    const nums = rows.map((r) => {
      const m = r.code.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return `SPC-${String(maxNum + 1).padStart(2, '0')}`;
  };

  const openSpecialtyModal = (existing?: DoctorSpecialty) => {
    const isEdit = Boolean(existing);
    const autoCode = existing?.code || generateNextCode();

    openCustomModal(
      isEdit
        ? i18n.bi(`تعديل التخصص الطبي: ${existing?.nameAr}`, `Edit Medical Specialty: ${existing?.nameEn}`)
        : i18n.bi('إضافة تخصص طبي جديد للأطباء', 'Add New Doctor Specialty'),
      `
        <form id="spec-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('كود التخصص (تلقائي) *', 'Specialty Code (Auto) *')}</label>
            <input name="code" required value="${autoCode}" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-bold" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.status}</label>
            <select name="active" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.active !== false ? 'selected' : ''}>${i18n.dict.common.active}</option>
              <option value="false" ${existing?.active === false ? 'selected' : ''}>${i18n.dict.common.inactive}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم التخصص الطبي (عربي) *', 'Specialty Name (Arabic) *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" placeholder="مثال: باطنة عامة، أطفال، نساء وتوليد..." class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم التخصص الطبي (إنجليزي)', 'Specialty Name (English)')}</label>
            <input name="nameEn" value="${existing?.nameEn || ''}" placeholder="e.g. Internal Medicine, Pediatrics..." dir="ltr" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.notes}</label>
            <input name="notes" value="${existing?.notes || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('spec-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const rec: DoctorSpecialty = {
            id: existing?.id || `spec_${Date.now()}`,
            code: String(fd.get('code') || autoCode).trim().toUpperCase(),
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            notes: String(fd.get('notes') || '').trim(),
            active: fd.get('active') === 'true',
          };
          await lookupsRepository.saveDoctorSpecialty(rec);
          await authService.logAudit(
            isEdit ? `تعديل تخصص طبي: ${rec.nameAr}` : `إضافة تخصص طبي: ${rec.nameAr}`,
            'doctorSpecialties',
            rec.id
          );
          showToast(i18n.bi('تم حفظ التخصص الطبي بنجاح', 'Doctor specialty saved successfully'), 'success');
          close();
          rows = await lookupsRepository.getDoctorSpecialties();
          renderTable();
        });
      }
    );
  };

  const renderTable = () => {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const pageRows = paginateArray(filtered, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filtered.length };

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.bi('تخصصات الأطباء (جدول التخصصات الطبية)', 'Doctor Specialties Catalog')}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة جدول التخصصات الطبية التي تظهر في قائمة الاختيار (Combobox) بشاشة الأطباء المحولين والمتعاقدين',
                'Manage medical specialties displayed in the Doctor form Combobox'
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="spec-go-doctors" type="button" class="rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer">
              ${i18n.bi('الانتقال لشاشة الأطباء', 'Go to Doctors Screen')}
            </button>
            <button id="spec-print-all" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              ${i18n.dict.actions.print}
            </button>
            <button id="spec-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              + ${i18n.bi('إضافة تخصص جديد', 'Add Specialty')}
            </button>
          </div>
        </div>

        ${renderSearchFilterBar({
          searchInputId: 'spec-search',
          searchQuery,
          filteredCount: filtered.length,
          totalCount: rows.length,
        })}

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التخصص الطبي (عربي)', 'Specialty (AR)')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التخصص الطبي (إنجليزي)', 'Specialty (EN)')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.notes}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${pageRows
                .map(
                  (r) => `
                  <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800 tabular-nums">${r.code}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-900">${r.nameAr}</td>
                    <td class="py-2.5 px-3 text-slate-600" dir="ltr">${r.nameEn || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-500">${r.notes || '-'}</td>
                    <td class="py-2.5 px-3 font-semibold ${r.active ? 'text-emerald-700' : 'text-slate-400'}">
                      ${r.active ? i18n.dict.common.active : i18n.dict.common.inactive}
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-print="${r.id}" class="spec-row-print rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                          ${i18n.bi('طباعة', 'Print')}
                        </button>
                        <button type="button" data-edit="${r.id}" class="spec-row-edit rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                          ${i18n.dict.actions.edit}
                        </button>
                        <button type="button" data-del="${r.id}" class="spec-row-del rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
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
        ${createPaginationControls(pagState, undefined, 'spec-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'spec-pag'
    );

    bindSearchInputWithFocus('spec-search', searchQuery, (val) => {
      searchQuery = val;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('spec-go-doctors')?.addEventListener('click', () => router.navigate('doctors'));
    document.getElementById('spec-add-btn')?.addEventListener('click', () => openSpecialtyModal());

    document.getElementById('spec-print-all')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.dict.common.code}</th>
              <th>${i18n.bi('التخصص (عربي)', 'Specialty AR')}</th>
              <th>${i18n.bi('التخصص (إنجليزي)', 'Specialty EN')}</th>
              <th>${i18n.dict.common.notes}</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (r) => `
                <tr>
                  <td class="tabular-nums">${r.code}</td>
                  <td>${r.nameAr}</td>
                  <td>${r.nameEn || '-'}</td>
                  <td>${r.notes || '-'}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.bi('جدول تخصصات الأطباء', 'Doctor Specialties Catalog'), html);
    });

    document.querySelectorAll<HTMLButtonElement>('.spec-row-print').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-print'));
        if (!target) return;
        const html = `
          <table class="print-table">
            <tbody>
              <tr><th>${i18n.dict.common.code}</th><td>${target.code}</td></tr>
              <tr><th>${i18n.bi('التخصص الطبي (عربي)', 'Specialty (AR)')}</th><td>${target.nameAr}</td></tr>
              <tr><th>${i18n.bi('التخصص الطبي (إنجليزي)', 'Specialty (EN)')}</th><td>${target.nameEn || '-'}</td></tr>
              <tr><th>${i18n.dict.common.notes}</th><td>${target.notes || '-'}</td></tr>
            </tbody>
          </table>
        `;
        printService.printA4(`${i18n.bi('بطاقة تخصص طبي:', 'Medical Specialty:')} ${target.nameAr}`, html);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.spec-row-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openSpecialtyModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.spec-row-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.code} — ${target.nameAr}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'doctorSpecialties'))) return;
            await lookupsRepository.deleteDoctorSpecialty(target.id);
            await authService.logAudit(`حذف تخصص طبي: ${target.nameAr}`, 'doctorSpecialties', target.id, reason || '');
            showToast(i18n.bi('تم حذف التخصص الطبي بنجاح', 'Specialty deleted'), 'success');
            rows = await lookupsRepository.getDoctorSpecialties();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}

/**
 * 2. شاشة الأقسام العلمية للتحاليل (Scientific Departments Screen)
 */
export async function renderScientificDepartmentsPage(container: HTMLElement): Promise<void> {
  let rows = await lookupsRepository.getScientificDepartments();
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = (): ScientificDepartment[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.nameAr.toLowerCase().includes(q) ||
        r.nameEn.toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
    );
  };

  const generateNextCode = (): string => {
    const nums = rows.map((r) => {
      const m = r.code.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return `DEP-${String(maxNum + 1).padStart(2, '0')}`;
  };

  const openDepartmentModal = (existing?: ScientificDepartment) => {
    const isEdit = Boolean(existing);
    const autoCode = existing?.code || generateNextCode();

    openCustomModal(
      isEdit
        ? i18n.bi(`تعديل القسم العلمي: ${existing?.nameAr}`, `Edit Scientific Department: ${existing?.nameEn}`)
        : i18n.bi('إضافة قسم علمي جديد للمعمل', 'Add New Scientific Department'),
      `
        <form id="dept-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('كود القسم العلمي (تلقائي) *', 'Department Code (Auto) *')}</label>
            <input name="code" required value="${autoCode}" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-bold" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.status}</label>
            <select name="active" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.active !== false ? 'selected' : ''}>${i18n.dict.common.active}</option>
              <option value="false" ${existing?.active === false ? 'selected' : ''}>${i18n.dict.common.inactive}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم القسم العلمي (عربي) *', 'Department Name (Arabic) *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" placeholder="مثال: الكيمياء الحيوية، أمراض الدم، الهرمونات..." class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم القسم العلمي (إنجليزي)', 'Department Name (English)')}</label>
            <input name="nameEn" value="${existing?.nameEn || ''}" placeholder="e.g. Clinical Biochemistry, Hematology..." dir="ltr" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.notes}</label>
            <input name="notes" value="${existing?.notes || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('dept-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const rec: ScientificDepartment = {
            id: existing?.id || `dept_${Date.now()}`,
            code: String(fd.get('code') || autoCode).trim().toUpperCase(),
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            notes: String(fd.get('notes') || '').trim(),
            active: fd.get('active') === 'true',
          };
          await lookupsRepository.saveScientificDepartment(rec);
          await authService.logAudit(
            isEdit ? `تعديل قسم علمي: ${rec.nameAr}` : `إضافة قسم علمي: ${rec.nameAr}`,
            'scientificDepartments',
            rec.id
          );
          showToast(i18n.bi('تم حفظ القسم العلمي بنجاح', 'Scientific department saved successfully'), 'success');
          close();
          rows = await lookupsRepository.getScientificDepartments();
          renderTable();
        });
      }
    );
  };

  const renderTable = () => {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const pageRows = paginateArray(filtered, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filtered.length };

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.bi('الأقسام العلمية للتحاليل (Scientific Departments)', 'Scientific Departments')}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة جدول الأقسام العلمية التي تظهر في قائمة الاختيار (Combobox) بشاشة إضافة وتعديل التحاليل الطبية',
                'Manage scientific departments displayed in the Test Catalog Combobox'
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="dept-go-tests" type="button" class="rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer">
              ${i18n.bi('الانتقال لكتالوج التحاليل', 'Go to Test Catalog')}
            </button>
            <button id="dept-print-all" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              ${i18n.dict.actions.print}
            </button>
            <button id="dept-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              + ${i18n.bi('إضافة قسم علمي', 'Add Department')}
            </button>
          </div>
        </div>

        ${renderSearchFilterBar({
          searchInputId: 'dept-search',
          searchQuery,
          filteredCount: filtered.length,
          totalCount: rows.length,
        })}

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم القسم العلمي (عربي)', 'Department (AR)')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم القسم العلمي (إنجليزي)', 'Department (EN)')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.notes}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${pageRows
                .map(
                  (r) => `
                  <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800 tabular-nums">${r.code}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-900">${r.nameAr}</td>
                    <td class="py-2.5 px-3 text-slate-600" dir="ltr">${r.nameEn || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-500">${r.notes || '-'}</td>
                    <td class="py-2.5 px-3 font-semibold ${r.active ? 'text-emerald-700' : 'text-slate-400'}">
                      ${r.active ? i18n.dict.common.active : i18n.dict.common.inactive}
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-print="${r.id}" class="dept-row-print rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                          ${i18n.bi('طباعة', 'Print')}
                        </button>
                        <button type="button" data-edit="${r.id}" class="dept-row-edit rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                          ${i18n.dict.actions.edit}
                        </button>
                        <button type="button" data-del="${r.id}" class="dept-row-del rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
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
        ${createPaginationControls(pagState, undefined, 'dept-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'dept-pag'
    );

    bindSearchInputWithFocus('dept-search', searchQuery, (val) => {
      searchQuery = val;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('dept-go-tests')?.addEventListener('click', () => router.navigate('tests'));
    document.getElementById('dept-add-btn')?.addEventListener('click', () => openDepartmentModal());

    document.getElementById('dept-print-all')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.dict.common.code}</th>
              <th>${i18n.bi('القسم العلمي (عربي)', 'Department AR')}</th>
              <th>${i18n.bi('القسم العلمي (إنجليزي)', 'Department EN')}</th>
              <th>${i18n.dict.common.notes}</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (r) => `
                <tr>
                  <td class="tabular-nums">${r.code}</td>
                  <td>${r.nameAr}</td>
                  <td>${r.nameEn || '-'}</td>
                  <td>${r.notes || '-'}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.bi('جدول الأقسام العلمية للتحاليل', 'Scientific Departments'), html);
    });

    document.querySelectorAll<HTMLButtonElement>('.dept-row-print').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-print'));
        if (!target) return;
        const html = `
          <table class="print-table">
            <tbody>
              <tr><th>${i18n.dict.common.code}</th><td>${target.code}</td></tr>
              <tr><th>${i18n.bi('اسم القسم العلمي (عربي)', 'Department (AR)')}</th><td>${target.nameAr}</td></tr>
              <tr><th>${i18n.bi('اسم القسم العلمي (إنجليزي)', 'Department (EN)')}</th><td>${target.nameEn || '-'}</td></tr>
              <tr><th>${i18n.dict.common.notes}</th><td>${target.notes || '-'}</td></tr>
            </tbody>
          </table>
        `;
        printService.printA4(`${i18n.bi('بطاقة قسم علمي:', 'Scientific Department:')} ${target.nameAr}`, html);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.dept-row-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openDepartmentModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.dept-row-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.code} — ${target.nameAr}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'scientificDepartments'))) return;
            await lookupsRepository.deleteScientificDepartment(target.id);
            await authService.logAudit(`حذف قسم علمي: ${target.nameAr}`, 'scientificDepartments', target.id, reason || '');
            showToast(i18n.bi('تم حذف القسم العلمي بنجاح', 'Department deleted'), 'success');
            rows = await lookupsRepository.getScientificDepartments();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}

/**
 * 3. شاشة أنواع أنابيب السحب (Sample Collection Tubes Screen)
 */
export async function renderSampleTubesPage(container: HTMLElement): Promise<void> {
  let rows = await lookupsRepository.getSampleTubes();
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = (): SampleTube[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.nameAr.toLowerCase().includes(q) ||
        r.nameEn.toLowerCase().includes(q) ||
        r.capColor.toLowerCase().includes(q) ||
        (r.additive || '').toLowerCase().includes(q)
    );
  };

  const generateNextCode = (): string => {
    const nums = rows.map((r) => {
      const m = r.code.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return `TUB-${String(maxNum + 1).padStart(2, '0')}`;
  };

  const openTubeModal = (existing?: SampleTube) => {
    const isEdit = Boolean(existing);
    const autoCode = existing?.code || generateNextCode();

    openCustomModal(
      isEdit
        ? i18n.bi(`تعديل أنبوبة السحب: ${existing?.nameAr}`, `Edit Sample Tube: ${existing?.nameEn}`)
        : i18n.bi('إضافة أنبوبة سحب عينة جديدة', 'Add New Sample Collection Tube'),
      `
        <form id="tube-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('كود الأنبوبة (تلقائي) *', 'Tube Code (Auto) *')}</label>
            <input name="code" required value="${autoCode}" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-bold" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.status}</label>
            <select name="active" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.active !== false ? 'selected' : ''}>${i18n.dict.common.active}</option>
              <option value="false" ${existing?.active === false ? 'selected' : ''}>${i18n.dict.common.inactive}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم أنبوبة السحب (عربي) *', 'Tube Name (Arabic) *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" placeholder="مثال: أنبوبة بنفسجي (EDTA Lavender)" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم أنبوبة السحب (إنجليزي) *', 'Tube Name (English) *')}</label>
            <input name="nameEn" required value="${existing?.nameEn || ''}" placeholder="e.g. Plain Red, EDTA Purple, Citrate Blue..." dir="ltr" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('لون الغطاء (Cap Color)', 'Cap Color')}</label>
            <input name="capColor" value="${existing?.capColor || ''}" placeholder="مثال: أحمر (Red) / بنفسجي (Purple)" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('المادة المضافة / مانع التجلط', 'Additive / Anticoagulant')}</label>
            <input name="additive" value="${existing?.additive || ''}" placeholder="مثال: K3-EDTA / Sodium Citrate 3.2%" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.notes}</label>
            <input name="notes" value="${existing?.notes || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('tube-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const rec: SampleTube = {
            id: existing?.id || `tube_${Date.now()}`,
            code: String(fd.get('code') || autoCode).trim().toUpperCase(),
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            capColor: String(fd.get('capColor') || '').trim(),
            additive: String(fd.get('additive') || '').trim(),
            notes: String(fd.get('notes') || '').trim(),
            active: fd.get('active') === 'true',
          };
          await lookupsRepository.saveSampleTube(rec);
          await authService.logAudit(
            isEdit ? `تعديل أنبوبة سحب: ${rec.nameAr}` : `إضافة أنبوبة سحب: ${rec.nameAr}`,
            'sampleTubes',
            rec.id
          );
          showToast(i18n.bi('تم حفظ أنبوبة السحب بنجاح', 'Sample tube saved successfully'), 'success');
          close();
          rows = await lookupsRepository.getSampleTubes();
          renderTable();
        });
      }
    );
  };

  const renderTable = () => {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const pageRows = paginateArray(filtered, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filtered.length };

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.bi('أنواع أنابيب السحب (Sample Collection Tubes)', 'Sample Collection Tubes')}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة جدول أنابيب سحب العينات التي تظهر في قائمة الاختيار (Combobox) بشاشة إضافة وتعديل التحاليل الطبية',
                'Manage sample collection tubes displayed in the Test Catalog Combobox'
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="tube-go-tests" type="button" class="rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer">
              ${i18n.bi('الانتقال لكتالوج التحاليل', 'Go to Test Catalog')}
            </button>
            <button id="tube-print-all" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              ${i18n.dict.actions.print}
            </button>
            <button id="tube-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              + ${i18n.bi('إضافة أنبوبة سحب', 'Add Sample Tube')}
            </button>
          </div>
        </div>

        ${renderSearchFilterBar({
          searchInputId: 'tube-search',
          searchQuery,
          filteredCount: filtered.length,
          totalCount: rows.length,
        })}

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('أنبوبة السحب (عربي / إنجليزي)', 'Tube Name (AR / EN)')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('لون الغطاء', 'Cap Color')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المادة المضافة', 'Additive')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.notes}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${pageRows
                .map(
                  (r) => `
                  <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800 tabular-nums">${r.code}</td>
                    <td class="py-2.5 px-3">
                      <div class="font-bold text-slate-900">${r.nameAr}</div>
                      <div class="text-[11px] text-slate-500" dir="ltr">${r.nameEn}</div>
                    </td>
                    <td class="py-2.5 px-3 font-semibold text-slate-700">${r.capColor || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-600">${r.additive || '-'}</td>
                    <td class="py-2.5 px-3 text-slate-500">${r.notes || '-'}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-print="${r.id}" class="tube-row-print rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                          ${i18n.bi('طباعة', 'Print')}
                        </button>
                        <button type="button" data-edit="${r.id}" class="tube-row-edit rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                          ${i18n.dict.actions.edit}
                        </button>
                        <button type="button" data-del="${r.id}" class="tube-row-del rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
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
        ${createPaginationControls(pagState, undefined, 'tube-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'tube-pag'
    );

    bindSearchInputWithFocus('tube-search', searchQuery, (val) => {
      searchQuery = val;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('tube-go-tests')?.addEventListener('click', () => router.navigate('tests'));
    document.getElementById('tube-add-btn')?.addEventListener('click', () => openTubeModal());

    document.getElementById('tube-print-all')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.dict.common.code}</th>
              <th>${i18n.bi('الأنبوبة (عربي / إنجليزي)', 'Tube AR / EN')}</th>
              <th>${i18n.bi('لون الغطاء', 'Cap Color')}</th>
              <th>${i18n.bi('المادة المضافة', 'Additive')}</th>
              <th>${i18n.dict.common.notes}</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (r) => `
                <tr>
                  <td class="tabular-nums">${r.code}</td>
                  <td>${r.nameAr} / ${r.nameEn}</td>
                  <td>${r.capColor || '-'}</td>
                  <td>${r.additive || '-'}</td>
                  <td>${r.notes || '-'}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.bi('جدول أنابيب سحب العينات', 'Sample Collection Tubes'), html);
    });

    document.querySelectorAll<HTMLButtonElement>('.tube-row-print').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-print'));
        if (!target) return;
        const html = `
          <table class="print-table">
            <tbody>
              <tr><th>${i18n.dict.common.code}</th><td>${target.code}</td></tr>
              <tr><th>${i18n.bi('اسم أنبوبة السحب (عربي)', 'Tube Name (AR)')}</th><td>${target.nameAr}</td></tr>
              <tr><th>${i18n.bi('اسم أنبوبة السحب (إنجليزي)', 'Tube Name (EN)')}</th><td>${target.nameEn}</td></tr>
              <tr><th>${i18n.bi('لون الغطاء', 'Cap Color')}</th><td>${target.capColor || '-'}</td></tr>
              <tr><th>${i18n.bi('المادة المضافة', 'Additive')}</th><td>${target.additive || '-'}</td></tr>
              <tr><th>${i18n.dict.common.notes}</th><td>${target.notes || '-'}</td></tr>
            </tbody>
          </table>
        `;
        printService.printA4(`${i18n.bi('بطاقة أنبوبة سحب:', 'Sample Tube:')} ${target.nameAr}`, html);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.tube-row-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openTubeModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.tube-row-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = rows.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.code} — ${target.nameAr}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'sampleTubes'))) return;
            await lookupsRepository.deleteSampleTube(target.id);
            await authService.logAudit(`حذف أنبوبة سحب: ${target.nameAr}`, 'sampleTubes', target.id, reason || '');
            showToast(i18n.bi('تم حذف أنبوبة السحب بنجاح', 'Sample tube deleted'), 'success');
            rows = await lookupsRepository.getSampleTubes();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}
