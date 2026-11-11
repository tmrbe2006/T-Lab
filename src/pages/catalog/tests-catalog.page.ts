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
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { lookupsRepository, testsRepository } from '../../repositories';
import { router } from '../../router';
import type { LabTest } from '../../types';

let selectedTestForParams = 'tst_1';

export function getSelectedTestForParams(): string {
  return selectedTestForParams;
}

export function setSelectedTestForParams(testId: string): void {
  selectedTestForParams = testId;
}

export async function renderTestsCatalogPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [tests, departments, sampleTubes] = await Promise.all([
    testsRepository.getAllTests(),
    lookupsRepository.getScientificDepartments(),
    lookupsRepository.getSampleTubes(),
  ]);
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.nameAr.toLowerCase().includes(q) ||
        t.nameEn.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.tubeType.toLowerCase().includes(q)
    );
  };

  const generateNextTestCode = (): string => {
    const nums = tests.map((t) => {
      const m = t.code.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 1000;
    });
    const maxNum = nums.length > 0 ? Math.max(1000, ...nums) : 1000;
    return `TST-${maxNum + 1}`;
  };

  const openTestForm = async (existing?: LabTest) => {
    [departments, sampleTubes] = await Promise.all([
      lookupsRepository.getScientificDepartments(),
      lookupsRepository.getSampleTubes(),
    ]);
    const activeDepts = departments.filter((d) => d.active !== false);
    const activeTubes = sampleTubes.filter((t) => t.active !== false);

    const isEdit = Boolean(existing);
    const autoCode = existing?.code || generateNextTestCode();
    const currentDept = existing?.department || activeDepts[0]?.nameAr || 'الكيمياء الحيوية';
    const hasCurrentDept = activeDepts.some((d) => d.nameAr === currentDept);

    const currentTube = existing?.tubeType || activeTubes[0]?.nameAr || 'Plain Red';
    const hasCurrentTube = activeTubes.some((t) => t.nameAr === currentTube || t.nameEn === currentTube);

    openCustomModal(
      isEdit
        ? i18n.bi(`تعديل تحليل: ${existing?.nameAr}`, `Edit Test: ${existing?.nameEn}`)
        : i18n.bi('إضافة تحليل جديد للكتالوج', 'Add New Lab Test'),
      `
        <form id="test-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('كود التحليل (يُولّد أوتوماتيكيًا) *', 'Test Code (Auto-generated) *')}</label>
            <input name="code" required value="${autoCode}" class="w-full rounded-lg border border-sky-300 bg-sky-50/40 px-3 py-2 text-sm font-mono font-bold text-slate-900" />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-semibold text-slate-700">${i18n.bi('القسم العلمي *', 'Scientific Department *')}</label>
              <button type="button" id="tst-manage-depts-link" class="text-[11px] font-bold text-sky-700 hover:underline cursor-pointer">
                + ${i18n.bi('إدارة الأقسام العلمية', 'Manage Departments')}
              </button>
            </div>
            <select name="department" required class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
              ${
                !hasCurrentDept && currentDept
                  ? `<option value="${currentDept}" selected>${currentDept}</option>`
                  : ''
              }
              ${activeDepts
                .map(
                  (d) =>
                    `<option value="${d.nameAr}" ${d.nameAr === currentDept ? 'selected' : ''}>${d.nameAr}${
                      d.nameEn ? ` — ${d.nameEn}` : ''
                    }</option>`
                )
                .join('')}
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم التحليل (عربي) *', 'Test Name (AR) *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم التحليل (إنجليزي) *', 'Test Name (EN) *')}</label>
            <input name="nameEn" required value="${existing?.nameEn || ''}" dir="ltr" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('نوع العينة', 'Sample Type')}</label>
            <input name="sampleType" required value="${existing?.sampleType || 'Serum'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-semibold text-slate-700">${i18n.bi('أنبوبة السحب *', 'Sample Collection Tube *')}</label>
              <button type="button" id="tst-manage-tubes-link" class="text-[11px] font-bold text-sky-700 hover:underline cursor-pointer">
                + ${i18n.bi('إدارة أنابيب السحب', 'Manage Sample Tubes')}
              </button>
            </div>
            <select name="tubeType" required class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">
              ${
                !hasCurrentTube && currentTube
                  ? `<option value="${currentTube}" selected>${currentTube}</option>`
                  : ''
              }
              ${activeTubes
                .map((tb) => {
                  const isSel = tb.nameAr === currentTube || tb.nameEn === currentTube;
                  return `<option value="${tb.nameAr}" ${isSel ? 'selected' : ''}>${tb.nameAr}${
                    tb.capColor ? ` [${tb.capColor}]` : ''
                  }</option>`;
                })
                .join('')}
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('مدة النتيجة', 'Turnaround Time')}</label>
            <input name="turnaroundTime" required value="${existing?.turnaroundTime || '2 Hours'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('سعر التحليل (EGP) *', 'Price (EGP) *')}</label>
            <input name="price" type="number" min="0" required value="${existing?.price ?? 150}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('التكلفة التقريبية (EGP)', 'Estimated Cost')}</label>
            <input name="estimatedCost" type="number" min="0" value="${existing?.estimatedCost ?? 40}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('يدخل في عمولة الطبيب المحول؟', 'Eligible for Doctor Commission?')}</label>
            <select name="commissionEligible" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="true" ${existing?.commissionEligible !== false ? 'selected' : ''}>${i18n.bi('نعم - يدخل في العمولة', 'Yes - Eligible')}</option>
              <option value="false" ${existing?.commissionEligible === false ? 'selected' : ''}>${i18n.bi('لا - مستثنى من العمولة', 'No - Excluded')}</option>
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
        document.getElementById('tst-manage-depts-link')?.addEventListener('click', () => {
          close();
          router.navigate('scientificDepartments');
        });
        document.getElementById('tst-manage-tubes-link')?.addEventListener('click', () => {
          close();
          router.navigate('sampleTubes');
        });

        const form = document.getElementById('test-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission(isEdit ? 'edit' : 'add', 'tests'))) return;
          const fd = new FormData(form);
          const rec: LabTest = {
            id: existing?.id || `tst_${Date.now()}`,
            code: String(fd.get('code') || autoCode).trim().toUpperCase(),
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            department: String(fd.get('department') || '').trim(),
            sampleType: String(fd.get('sampleType') || '').trim(),
            tubeType: String(fd.get('tubeType') || '').trim(),
            turnaroundTime: String(fd.get('turnaroundTime') || '').trim(),
            price: Math.max(0, Number(fd.get('price')) || 0),
            estimatedCost: Math.max(0, Number(fd.get('estimatedCost')) || 0),
            active: true,
            commissionEligible: fd.get('commissionEligible') === 'true',
            notes: existing?.notes || '',
          };
          await testsRepository.saveTest(rec);
          await authService.logAudit(
            isEdit ? `تعديل تحليل: ${rec.code}` : `إضافة تحليل: ${rec.code}`,
            'tests',
            rec.id,
            `Dept: ${rec.department} | Tube: ${rec.tubeType}`
          );
          showToast(i18n.bi('تم حفظ التحليل بنجاح', 'Test saved successfully'), 'success');
          close();
          tests = await testsRepository.getAllTests();
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
    const canAdd = can(user, 'add', 'tests');
    const canPrint = can(user, 'print', 'tests');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.tests}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('كتالوج التحاليل الطبية، التكويد التلقائي، الأقسام العلمية، وأنواع أنابيب السحب', 'Medical tests catalog, auto test codes, scientific departments, and sample collection tubes')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="tst-depts-btn" type="button" class="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer">
              ${i18n.bi('شاشة الأقسام العلمية', 'Scientific Departments')}
            </button>
            <button id="tst-tubes-btn" type="button" class="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100 cursor-pointer">
              ${i18n.bi('شاشة أنابيب السحب', 'Sample Tubes')}
            </button>
            ${canPrint ? `<button id="tst-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canAdd ? `<button id="tst-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>

        ${renderSearchFilterBar({
          searchInputId: 'tst-search',
          searchQuery,
          filteredCount: filteredRows.length,
          totalCount: tests.length,
        })}

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم التحليل (عربي / إنجليزي)', 'Test Name (AR / EN)')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('القسم العلمي', 'Department')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('العينة / أنبوبة السحب', 'Sample / Tube')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('السعر', 'Price')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('عمولة الطبيب', 'Comm. Eligible')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map(
                  (t) => `
                  <tr class="hover:bg-slate-50/80">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800 tabular-nums">${t.code}</td>
                    <td class="py-2.5 px-3">
                      <div class="font-bold text-slate-900">${t.nameAr}</div>
                      <div class="text-[11px] text-slate-500" dir="ltr">${t.nameEn}</div>
                    </td>
                    <td class="py-2.5 px-3 font-semibold text-slate-700">${t.department}</td>
                    <td class="py-2.5 px-3 text-slate-600">${t.sampleType} · <span class="font-semibold text-slate-800">${t.tubeType}</span></td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${t.price} EGP</td>
                    <td class="py-2.5 px-3 font-semibold ${t.commissionEligible ? 'text-emerald-700' : 'text-slate-400'}">
                      ${t.commissionEligible ? i18n.bi('نعم', 'Yes') : i18n.bi('لا', 'No')}
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <button data-prm="${t.id}" class="tst-prm-btn rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer">
                          ${i18n.bi('البارامترات', 'Parameters')}
                        </button>
                        <button data-edit="${t.id}" class="tst-edit-btn rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                          ${i18n.dict.actions.edit}
                        </button>
                        <button data-del="${t.id}" class="tst-del-btn rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
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
        ${createPaginationControls(pagState, undefined, 'tst-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'tst-pag'
    );

    bindSearchInputWithFocus('tst-search', searchQuery, (val) => {
      searchQuery = val;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('tst-depts-btn')?.addEventListener('click', () => router.navigate('scientificDepartments'));
    document.getElementById('tst-tubes-btn')?.addEventListener('click', () => router.navigate('sampleTubes'));
    document.getElementById('tst-add-btn')?.addEventListener('click', () => openTestForm());

    document.getElementById('tst-print-btn')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead><tr><th>Code</th><th>Test Name</th><th>Department</th><th>Sample / Tube</th><th>Price</th></tr></thead>
          <tbody>
            ${visible.map((t) => `<tr><td class="tabular-nums">${t.code}</td><td>${t.nameAr} / ${t.nameEn}</td><td>${t.department}</td><td>${t.sampleType} (${t.tubeType})</td><td class="tabular-nums">${t.price} EGP</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.tests, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.tst-prm-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTestForParams = btn.getAttribute('data-prm') || 'tst_1';
        router.navigate('testParameters');
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.tst-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = tests.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openTestForm(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.tst-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = tests.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.code} — ${target.nameAr}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'tests'))) return;
            await testsRepository.deleteTest(target.id);
            await authService.logAudit(`حذف تحليل: ${target.code}`, 'tests', target.id, reason || '');
            showToast(i18n.bi('تم حذف التحليل وبارامتراته', 'Test deleted'), 'success');
            tests = await testsRepository.getAllTests();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}
