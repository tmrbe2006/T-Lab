import { authService } from '../../auth/auth.service';
import {
  openCustomModal,
  openDeleteConfirmModal,
  showToast,
} from '../../components/common';
import { syncGlobalMedicalCatalog } from '../../db/global-medical-tests';
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
  let tests = await testsRepository.getAllTests();
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
            <input name="normalMaleMin" type="number" step="0.001" value="${existing?.normalMaleMin ?? 4.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الطبيعي الأعلى (ذكور)', 'Normal Male Max')}</label>
            <input name="normalMaleMax" type="number" step="0.001" value="${existing?.normalMaleMax ?? 11.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الطبيعي الأدنى (إناث)', 'Normal Female Min')}</label>
            <input name="normalFemaleMin" type="number" step="0.001" value="${existing?.normalFemaleMin ?? existing?.normalMaleMin ?? 4.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الطبيعي الأعلى (إناث)', 'Normal Female Max')}</label>
            <input name="normalFemaleMax" type="number" step="0.001" value="${existing?.normalFemaleMax ?? existing?.normalMaleMax ?? 11.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold mb-1">${i18n.bi('نص المعدل الطبيعي المطبوع في التقرير (Reference Range Text)', 'Printed Reference Range Text')}</label>
            <input name="normalRangeText" value="${existing?.normalRangeText || ''}" placeholder="e.g., M: 13.5-17.5 / F: 12.0-16.0 g/dL" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الحرج المنخفض (Critical Low)', 'Critical Low')}</label>
            <input name="criticalLow" type="number" step="0.001" value="${existing?.criticalLow ?? 2.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('الحد الحرج المرتفع (Critical High)', 'Critical High')}</label>
            <input name="criticalHigh" type="number" step="0.001" value="${existing?.criticalHigh ?? 30.0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('نوع النتيجة', 'Result Type')}</label>
            <select name="resultType" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="numeric" ${existing?.resultType === 'numeric' ? 'selected' : ''}>رقمي (Numeric)</option>
              <option value="select" ${existing?.resultType === 'select' ? 'selected' : ''}>قائمة اختيار (Select / Qualitative)</option>
              <option value="text" ${existing?.resultType === 'text' ? 'selected' : ''}>نصي (Text / Microscopic)</option>
              <option value="boolean" ${existing?.resultType === 'boolean' ? 'selected' : ''}>نعم / لا (Positive/Negative)</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.bi('ترتيب الظهور', 'Sort Order')}</label>
            <input name="sortOrder" type="number" value="${existing?.sortOrder ?? params.length + 1}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold mb-1">${i18n.bi('خيارات القائمة (مفصولة بفاصلة للنوع Select)', 'Select Options (Comma-separated)')}</label>
            <input name="optionsText" value="${existing?.options?.join(', ') || ''}" placeholder="Negative (سلبي), Positive (إيجابي), Borderline" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2.5">
            <label class="flex items-center gap-2 font-bold text-amber-950 cursor-pointer">
              <input type="checkbox" name="isCalculated" value="1" ${existing?.isCalculated ? 'checked' : ''} class="rounded border-amber-400 text-amber-600" />
              <span>ƒx ${i18n.bi('بارامتر يُحسب تلقائياً بمعادلة طبية (Auto-Calculated Parameter)', 'Auto-Calculated Formula Parameter')}</span>
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-amber-900 mb-1">${i18n.bi('المعادلة الحسابية (Formula Expression)', 'Formula Expression')}</label>
                <input name="formula" dir="ltr" value="${existing?.formula || ''}" placeholder="e.g. CHOL - HDL - (TG / 5)" class="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900" />
              </div>
              <div>
                <label class="block font-semibold text-amber-900 mb-1">${i18n.bi('شرط صلاحية المعادلة (Condition)', 'Clinical Validity Condition')}</label>
                <input name="formulaCondition" dir="ltr" value="${existing?.formulaCondition || ''}" placeholder="e.g. TG <= 400" class="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900" />
              </div>
            </div>
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
          const minF = Number(fd.get('normalFemaleMin')) || minM;
          const maxF = Number(fd.get('normalFemaleMax')) || maxM;
          const customRangeText = String(fd.get('normalRangeText') || '').trim();
          const rawOptions = String(fd.get('optionsText') || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const formulaStr = String(fd.get('formula') || '').trim();
          const formulaCondStr = String(fd.get('formulaCondition') || '').trim();
          const isCalc = Boolean(fd.get('isCalculated')) || Boolean(formulaStr);
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
            normalFemaleMin: minF,
            normalFemaleMax: maxF,
            normalRangeText: customRangeText || `${minM} - ${maxM}`,
            criticalLow: Number(fd.get('criticalLow')) || 0,
            criticalHigh: Number(fd.get('criticalHigh')) || 100,
            resultType: (fd.get('resultType') as ParameterResultType) || 'numeric',
            options: rawOptions.length > 0 ? rawOptions : existing?.options,
            decimalPlaces: existing?.decimalPlaces ?? 1,
            sortOrder: Number(fd.get('sortOrder')) || 1,
            active: true,
            isCalculated: isCalc,
            formula: formulaStr || undefined,
            formulaCondition: formulaCondStr || undefined,
            formulaNoteAr: existing?.formulaNoteAr,
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
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدارة البارامترات الفرعية، الوحدات الدولية، المعدلات الطبيعية للذكور والإناث، والحدود الحرجة لكل تحليل طبقاً للتقارير العالمية', 'Manage sub-parameters, international units, male/female reference ranges, and critical limits per test')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="prm-sync-global-btn" type="button" class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer">
              🌍 ${i18n.bi('استعادة البارامترات العالمية المعتمدة', 'Restore Global Reference Parameters')}
            </button>
            ${canPrint ? `<button id="prm-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canAdd ? `<button id="prm-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
          <div class="flex flex-wrap items-center gap-3">
            <label class="text-xs font-bold text-slate-700">${i18n.bi('اختر التحليل لعرض بارامتراته:', 'Select Lab Test:')}</label>
            <select id="prm-test-select" class="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 max-w-xl">
              ${tests
                .map(
                  (t) => `<option value="${t.id}" ${t.id === activeTestId ? 'selected' : ''}>[${t.code}] ${i18n.bi(t.nameAr, t.nameEn)} — (${t.department})</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 font-bold text-indigo-900">
              ${params.length} ${i18n.bi('بارامتر مسجل لهذا التحليل', 'Parameters in this Test')}
            </span>
            <span class="text-slate-500 font-semibold">
              ${currentTest ? `${currentTest.department} · ${currentTest.sampleType} (${currentTest.tubeType})` : ''}
            </span>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">#</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم البارامتر (عربي / إنجليزي)', 'Parameter Name')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النوع / المعادلة', 'Type / Formula')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الوحدة', 'Unit')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المعدل الطبيعي المعتمد (Reference Range)', 'Normal Reference Range')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الحد الحرج (Critical Limits)', 'Critical Low / High')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${params
                .map((p) => {
                  const isNumeric = p.resultType === 'numeric';
                  const typeBadge =
                    p.resultType === 'numeric'
                      ? `<span class="rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">رقمي Numeric</span>`
                      : p.resultType === 'select'
                      ? `<span class="rounded bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">اختياري Select</span>`
                      : `<span class="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">نصي Text</span>`;
                  const formulaBadge =
                    p.isCalculated && p.formula
                      ? `<div class="mt-1"><span class="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-900" dir="ltr">ƒx = ${p.formula}${p.formulaCondition ? ` [${p.formulaCondition}]` : ''}</span></div>`
                      : '';
                  return `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono tabular-nums">${p.sortOrder}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${p.code}</td>
                    <td class="py-2.5 px-3">
                      <div class="font-bold text-slate-900">${p.nameAr}</div>
                      <div class="text-[11px] text-slate-500" dir="ltr">${p.nameEn}</div>
                      ${p.formulaNoteAr ? `<div class="text-[10px] text-amber-800 font-semibold mt-0.5">${p.formulaNoteAr}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-3">${typeBadge}${formulaBadge}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${p.unit}</td>
                    <td class="py-2.5 px-3 font-mono text-emerald-700 font-semibold tabular-nums">${p.normalRangeText}</td>
                    <td class="py-2.5 px-3 font-mono text-rose-700 tabular-nums">
                      ${isNumeric ? `&lt; ${p.criticalLow} | &gt; ${p.criticalHigh}` : '<span class="text-slate-400">Qualitative</span>'}
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        ${canEdit ? `<button data-edit="${p.id}" class="prm-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>` : ''}
                        ${canDelete ? `<button data-del="${p.id}" class="prm-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
                })
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

    document.getElementById('prm-sync-global-btn')?.addEventListener('click', async () => {
      await syncGlobalMedicalCatalog(true);
      tests = await testsRepository.getAllTests();
      params = await testsRepository.getParametersByTestId(getSelectedTestForParams());
      renderView();
      showToast(
        i18n.bi('تمت استعادة وتحديث كافة البارامترات العالمية بنجاح', 'Global reference parameters restored'),
        'success'
      );
    });

    document.getElementById('prm-add-btn')?.addEventListener('click', () => openParamForm());
    document.getElementById('prm-print-btn')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>#</th><th>Code</th><th>Parameter Name</th><th>Type</th><th>Unit</th><th>Reference Range</th><th>Critical Limits</th></tr></thead>
          <tbody>
            ${params.map((p) => `<tr><td class="tabular-nums">${p.sortOrder}</td><td>${p.code}</td><td>${p.nameAr} / ${p.nameEn}</td><td>${p.resultType}</td><td>${p.unit}</td><td class="tabular-nums">${p.normalRangeText}</td><td class="tabular-nums">${p.resultType === 'numeric' ? `&lt; ${p.criticalLow} | &gt; ${p.criticalHigh}` : 'Qualitative'}</td></tr>`).join('')}
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
