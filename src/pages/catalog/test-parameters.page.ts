import { authService } from '../../auth/auth.service';
import {
  openCustomModal,
  openDeleteConfirmModal,
  showToast,
} from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { testsRepository } from '../../repositories';
import type { ParameterResultType, TestParameter } from '../../types';
import {
  getSelectedTestForParams,
  setSelectedTestForParams,
} from './tests-catalog.page';

export async function renderTestParametersPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  const tests = await testsRepository.getAllTests();
  let params = await testsRepository.getParametersByTestId(getSelectedTestForParams());

  const openParamForm = (existing?: TestParameter) => {
    const isEdit = Boolean(existing);
    openCustomModal(
      isEdit ? i18n.bi('تعديل بارامتر تحليل', 'Edit Test Parameter') : i18n.bi('إضافة بارامتر جديد للتحليل', 'Add Test Parameter'),
      `
        <form id="prm-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('كود البارامتر *', 'Parameter Code *')}</label>
            <input name="code" required value="${existing?.code || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الوحدة القياسية (Unit) *', 'Unit *')}</label>
            <input name="unit" required value="${existing?.unit || 'mg/dL'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الاسم بالعربي *', 'Name (AR) *')}</label>
            <input name="nameAr" required value="${existing?.nameAr || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الاسم بالإنجليزي *', 'Name (EN) *')}</label>
            <input name="nameEn" required value="${existing?.nameEn || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الطبيعي الأدنى (ذكور)', 'Normal Male Min')}</label>
            <input name="normalMaleMin" type="number" step="0.01" value="${existing?.normalMaleMin ?? 4.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الطبيعي الأعلى (ذكور)', 'Normal Male Max')}</label>
            <input name="normalMaleMax" type="number" step="0.01" value="${existing?.normalMaleMax ?? 11.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الحرج المنخفض (Critical Low)', 'Critical Low')}</label>
            <input name="criticalLow" type="number" step="0.01" value="${existing?.criticalLow ?? 2.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الحرج المرتفع (Critical High)', 'Critical High')}</label>
            <input name="criticalHigh" type="number" step="0.01" value="${existing?.criticalHigh ?? 30.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('نوع النتيجة', 'Result Type')}</label>
            <select name="resultType" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="numeric" ${existing?.resultType === 'numeric' ? 'selected' : ''}>رقمي (Numeric)</option>
              <option value="text" ${existing?.resultType === 'text' ? 'selected' : ''}>نصي (Text)</option>
              <option value="boolean" ${existing?.resultType === 'boolean' ? 'selected' : ''}>نعم / لا (Positive/Negative)</option>
              <option value="select" ${existing?.resultType === 'select' ? 'selected' : ''}>قائمة اختيار (Select)</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('ترتيب الظهور', 'Sort Order')}</label>
            <input name="sortOrder" type="number" value="${existing?.sortOrder ?? params.length + 1}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="sm:col-span-2 flex justify-end pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('prm-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission(isEdit ? 'edit' : 'add', 'testParameters'))) return;
          const fd = new FormData(form);
          const minM = Number(fd.get('normalMaleMin')) || 0;
          const maxM = Number(fd.get('normalMaleMax')) || 0;
          const currentTestId = getSelectedTestForParams();
          const rec: TestParameter = {
            id: existing?.id || `prm_${Date.now()}`,
            testId: currentTestId,
            code: String(fd.get('code') || '').trim().toUpperCase(),
            nameAr: String(fd.get('nameAr') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            unit: String(fd.get('unit') || '').trim(),
            normalMaleMin: minM,
            normalMaleMax: maxM,
            normalFemaleMin: minM,
            normalFemaleMax: maxM,
            normalRangeText: `${minM} - ${maxM}`,
            criticalLow: Number(fd.get('criticalLow')) || 0,
            criticalHigh: Number(fd.get('criticalHigh')) || 100,
            resultType: (fd.get('resultType') as ParameterResultType) || 'numeric',
            decimalPlaces: 1,
            sortOrder: Number(fd.get('sortOrder')) || 1,
            active: true,
          };
          await testsRepository.saveParameter(rec);
          await authService.logAudit(`حفظ بارامتر: ${rec.code}`, 'testParameters', rec.id);
          showToast(i18n.bi('تم حفظ البارامتر بنجاح', 'Parameter saved'), 'success');
          close();
          params = await testsRepository.getParametersByTestId(currentTestId);
          renderView();
        });
      }
    );
  };

  const renderView = () => {
    const canAdd = can(user, 'add', 'testParameters');
    const canEdit = can(user, 'edit', 'testParameters');
    const canDelete = can(user, 'delete', 'testParameters');
    const canPrint = can(user, 'print', 'testParameters');
    const activeTestId = getSelectedTestForParams();
    const currentTest = tests.find((t) => t.id === activeTestId);

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.testParameters}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدارة البارامترات الفرعية، الوحدات، المعدلات الطبيعية، والحدود الحرجة لكل تحليل', 'Manage sub-parameters, units, reference ranges, and critical limits per test')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="prm-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canAdd ? `<button id="prm-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
          <label class="text-xs font-bold text-slate-700">${i18n.bi('اختر التحليل لعرض بارامتراته:', 'Select Lab Test:')}</label>
          <select id="prm-test-select" class="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900">
            ${tests
              .map(
                (t) => `<option value="${t.id}" ${t.id === activeTestId ? 'selected' : ''}>${t.code} — ${i18n.bi(t.nameAr, t.nameEn)}</option>`
              )
              .join('')}
          </select>
          <span class="text-xs text-slate-500">
            ${currentTest ? `${currentTest.department} · ${currentTest.sampleType}` : ''}
          </span>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">#</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم البارامتر (عربي / إنجليزي)', 'Parameter Name')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الوحدة', 'Unit')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المعدل الطبيعي', 'Normal Range')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الحد الحرج (منخفض / مرتفع)', 'Critical Low / High')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${params
                .map(
                  (p) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono tabular-nums">${p.sortOrder}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${p.code}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-900">${p.nameAr} / ${p.nameEn}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${p.unit}</td>
                    <td class="py-2.5 px-3 font-mono text-emerald-700 tabular-nums">${p.normalRangeText}</td>
                    <td class="py-2.5 px-3 font-mono text-rose-700 tabular-nums">&lt; ${p.criticalLow} | &gt; ${p.criticalHigh}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        ${canEdit ? `<button data-edit="${p.id}" class="prm-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>` : ''}
                        ${canDelete ? `<button data-del="${p.id}" class="prm-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>` : ''}
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

    const sel = document.getElementById('prm-test-select') as HTMLSelectElement | null;
    sel?.addEventListener('change', async () => {
      setSelectedTestForParams(sel.value);
      params = await testsRepository.getParametersByTestId(getSelectedTestForParams());
      renderView();
    });

    document.getElementById('prm-add-btn')?.addEventListener('click', () => openParamForm());
    document.getElementById('prm-print-btn')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>#</th><th>Code</th><th>Parameter Name</th><th>Unit</th><th>Normal Range</th><th>Critical Limits</th></tr></thead>
          <tbody>
            ${params.map((p) => `<tr><td class="tabular-nums">${p.sortOrder}</td><td>${p.code}</td><td>${p.nameAr} / ${p.nameEn}</td><td>${p.unit}</td><td class="tabular-nums">${p.normalRangeText}</td><td class="tabular-nums">&lt; ${p.criticalLow} | &gt; ${p.criticalHigh}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(
        `${i18n.dict.nav.testParameters} — ${currentTest ? i18n.bi(currentTest.nameAr, currentTest.nameEn) : ''}`,
        html
      );
    });
    document.querySelectorAll<HTMLButtonElement>('.prm-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = params.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openParamForm(target);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('.prm-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = params.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.code} — ${target.nameAr}`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'testParameters'))) return;
            await testsRepository.deleteParameter(target.id);
            await authService.logAudit(`حذف بارامتر: ${target.code}`, 'testParameters', target.id, reason || '');
            showToast(i18n.bi('تم حذف البارامتر بنجاح', 'Parameter deleted'), 'success');
            params = await testsRepository.getParametersByTestId(getSelectedTestForParams());
            renderView();
          },
        });
      });
    });
  };

  renderView();
}
