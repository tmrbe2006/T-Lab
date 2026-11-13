import { authService } from '../../auth/auth.service';
import { escapeHtml, openCustomModal, showToast } from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import {
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../../repositories';
import {
  evaluateDeltaChecksForResult,
  openCriticalReadBackModal,
} from '../../services/enterprise-lab.service';
import {
  evaluateParameterFormula,
  getDefaultFormulaMetadata,
} from '../../services/clinical-formula.service';
import type { LabResult } from '../../types';

export async function renderResultsEntryPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  // Ensure every request with a received sample has its LabResult draft rows generated
  await requestsRepository.ensureDraftResultsForAllRequests();

  let [results, patients, tests, allParameters, allRequests, allSamples] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
    testsRepository.getAllParameters(),
    requestsRepository.getAllRequests(),
    requestsRepository.getAllSamples(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));
  const paramMap = new Map(allParameters.map((p) => [p.id, p]));
  const reqMap = new Map(allRequests.map((r) => [r.id, r]));
  const sampleByReqId = new Map(allSamples.map((s) => [s.requestId, s]));

  let searchQuery = '';
  let statusFilter = 'all';

  const openEntryModal = (res: LabResult) => {
    const canReopen = can(user, 'reopenResult', 'results');
    if (res.status === 'approved' && !canReopen) {
      showToast(
        i18n.bi('النتيجة معتمدة نهائيًا. لا يمكن تعديلها إلا بصلاحية (إعادة فتح نتيجة).', 'Result is approved. Reopen permission required to edit.'),
        'warning'
      );
      return;
    }

    const pat = patMap.get(res.patientId);
    const tst = tstMap.get(res.testId);
    const req = reqMap.get(res.requestId);
    const smp = sampleByReqId.get(res.requestId);
    const deltaAlerts = evaluateDeltaChecksForResult(res, results);

    openCustomModal(
      `${i18n.bi('إدخال وتعديل نتائج التحليل:', 'Result Entry:')} ${tst ? i18n.bi(tst.nameAr, tst.nameEn) : ''} — ${pat?.name || ''}`,
      `
        <form id="res-entry-form" novalidate class="space-y-4 text-xs">
          <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
            <span><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''} (${pat?.age || ''} Y · ${pat?.gender === 'female' ? 'أنثى F' : 'ذكر M'})</span>
            <span><strong>${i18n.bi('رقم الطلب / العينة:', 'Request / Sample:')}</strong> <span class="font-mono">${req?.requestNumber || res.requestId} · ${smp?.sampleCode || 'SMP'}</span></span>
            <span><strong>${i18n.bi('الحالة الحالية:', 'Current Status:')}</strong> ${i18n.dict.statuses[res.status] || res.status}</span>
          </div>
          ${
            deltaAlerts.length > 0
              ? `<div class="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-950 font-bold space-y-1">
                  ${deltaAlerts.map((da) => `<div>⚡ ${escapeHtml(i18n.bi(da.messageAr, da.messageEn))}</div>`).join('')}
                </div>`
              : ''
          }
          <div class="max-h-96 overflow-y-auto space-y-2.5 pr-1">
            ${res.values
              .map((v, idx) => {
                const prmDef = paramMap.get(v.parameterId);
                const fallbackFormula = prmDef?.code ? getDefaultFormulaMetadata(prmDef.code) : { isCalculated: false };
                const isCalcParam = Boolean((prmDef?.isCalculated && prmDef?.formula) || (fallbackFormula.isCalculated && fallbackFormula.formula));
                const formulaExpr = prmDef?.formula || fallbackFormula.formula || '';
                const formulaNote = prmDef?.formulaNoteAr || fallbackFormula.formulaNoteAr || '';
                const isSelect = prmDef?.resultType === 'select' && prmDef.options && prmDef.options.length > 0;
                const isText = prmDef?.resultType === 'text' || prmDef?.resultType === 'boolean';

                let inputHtml = '';
                if (isSelect) {
                  inputHtml = `
                    <select id="res_input_${idx}" name="val_${idx}" class="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900">
                      ${prmDef!
                        .options!.map(
                          (opt) =>
                            `<option value="${escapeHtml(opt)}" ${String(v.value) === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        )
                        .join('')}
                    </select>
                  `;
                } else if (isText) {
                  inputHtml = `
                    <input
                      id="res_input_${idx}"
                      name="val_${idx}"
                      type="text"
                      value="${escapeHtml(String(v.value))}"
                      class="w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono font-bold text-slate-900"
                    />
                  `;
                } else {
                  inputHtml = `
                    <input
                      id="res_input_${idx}"
                      name="val_${idx}"
                      data-param-code="${escapeHtml(prmDef?.code || '')}"
                      data-is-calc="${isCalcParam ? '1' : '0'}"
                      type="number"
                      step="any"
                      value="${v.value}"
                      class="w-full rounded border ${isCalcParam ? 'border-amber-300 bg-amber-50/60 text-amber-950' : 'border-slate-300 bg-white text-slate-900'} px-2.5 py-1.5 font-mono font-bold"
                    />
                  `;
                }

                return `
                <div class="border-b border-slate-100 pb-2 space-y-1">
                  <div class="grid grid-cols-12 items-center gap-2">
                    <div class="col-span-5">
                      <div class="font-semibold text-slate-800">${v.parameterNameAr} / <span class="text-slate-500">${v.parameterNameEn}</span></div>
                      ${
                        isCalcParam
                          ? `<div class="flex flex-wrap items-center gap-2 mt-0.5">
                              <span class="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-900" title="${escapeHtml(formulaNote)}" dir="ltr">ƒx ${escapeHtml(formulaExpr)}</span>
                              <label class="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 cursor-pointer">
                                <input type="checkbox" data-manual-override="${idx}" class="rounded border-slate-300" />
                                <span>🔓 ${i18n.bi('تعديل يدوي', 'Manual Override')}</span>
                              </label>
                            </div>`
                          : ''
                      }
                    </div>
                    <div class="col-span-3">${inputHtml}</div>
                    <div class="col-span-2 font-mono text-slate-500">${v.unit}</div>
                    <div class="col-span-2 font-mono text-emerald-700 text-[11px]">${v.normalRange}</div>
                  </div>
                  <div id="formula_warn_${idx}" class="hidden rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800"></div>
                </div>
              `;
              })
              .join('')}
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.dict.common.notes}</label>
            <input id="res_notes_input" name="notes" value="${escapeHtml(res.notes || '')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button id="res-save-draft-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
              ${i18n.bi('حفظ كمسودة (Draft)', 'Save Draft')}
            </button>
            <button id="res-submit-review-btn" type="button" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.bi('إرسال للمراجعة والاعتماد', 'Send for Medical Review')}
            </button>
            <button id="res-submit-and-goto-review-btn" type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer">
              ${i18n.bi('إرسال والانتقال لشاشة الاعتماد ←', 'Send & Open Review Screen')}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('res-entry-form') as HTMLFormElement | null;

        // Real-time Clinical Formula Recalculation Engine
        const recalculateFormulas = (changedInput?: HTMLElement) => {
          if (!form) return;
          const rawValuesByCode: Record<string, number> = {};
          res.values.forEach((v, idx) => {
            const prmDef = paramMap.get(v.parameterId);
            const code = prmDef?.code;
            const inp = document.getElementById(`res_input_${idx}`) as HTMLInputElement | null;
            if (code && inp) {
              const numVal = Number(inp.value);
              if (Number.isFinite(numVal)) {
                rawValuesByCode[code] = numVal;
              }
            }
          });

          // Two passes so dependent formulas (e.g. LDL -> LDL/HDL Ratio, or GLOB -> A/G Ratio) resolve cleanly
          for (let pass = 0; pass < 2; pass++) {
            res.values.forEach((v, idx) => {
              const prmDef = paramMap.get(v.parameterId);
              if (!prmDef) return;
              const fallback = getDefaultFormulaMetadata(prmDef.code);
              const isCalc = Boolean((prmDef.isCalculated && prmDef.formula) || (fallback.isCalculated && fallback.formula));
              if (!isCalc) return;

              const inp = document.getElementById(`res_input_${idx}`) as HTMLInputElement | null;
              const warnEl = document.getElementById(`formula_warn_${idx}`);
              const overrideChk = form.querySelector<HTMLInputElement>(`input[data-manual-override="${idx}"]`);

              if (changedInput && changedInput === inp && overrideChk && !overrideChk.checked) {
                overrideChk.checked = true;
              }

              if (overrideChk?.checked) {
                if (inp && prmDef.code) {
                  rawValuesByCode[prmDef.code] = Number(inp.value) || 0;
                }
                return;
              }

              const evalRes = evaluateParameterFormula(
                {
                  code: prmDef.code,
                  formula: prmDef.formula || fallback.formula,
                  formulaCondition: prmDef.formulaCondition || fallback.formulaCondition,
                  decimalPlaces: prmDef.decimalPlaces,
                },
                rawValuesByCode,
                { age: pat?.age, gender: pat?.gender }
              );

              if (warnEl) {
                if (evalRes.conditionViolated && evalRes.warningMessageAr) {
                  warnEl.textContent = i18n.bi(evalRes.warningMessageAr, evalRes.warningMessageEn || evalRes.warningMessageAr);
                  warnEl.classList.remove('hidden');
                } else {
                  warnEl.textContent = '';
                  warnEl.classList.add('hidden');
                }
              }

              if (inp && evalRes.computedValue !== null) {
                inp.value = String(evalRes.computedValue);
                rawValuesByCode[prmDef.code] = evalRes.computedValue;
              }
            });
          }
        };

        form?.addEventListener('input', (ev) => {
          recalculateFormulas(ev.target as HTMLElement);
        });
        recalculateFormulas();

        let isSubmitting = false;
        const handleSaveResult = async (targetMode: LabResult['status'], navigateToReview = false) => {
          if (isSubmitting) return;
          isSubmitting = true;
          try {
            if (!(await enforcePermission('edit', 'results'))) {
              isSubmitting = false;
              return;
            }

            // Ensure all calculated formulas are up to date before reading values
            recalculateFormulas();

            let hasCritical = false;
            const isFemale = pat?.gender === 'female';

            res.values = res.values.map((v, idx) => {
              const inputEl = document.getElementById(`res_input_${idx}`) as HTMLInputElement | HTMLSelectElement | null;
              const rawVal = inputEl ? inputEl.value : v.value;
              const prmDef = paramMap.get(v.parameterId);

              if (prmDef && prmDef.resultType !== 'numeric') {
                const strVal = String(rawVal ?? '').trim();
                const lower = strVal.toLowerCase();
                let flag: typeof v.flag = 'normal';
                if (lower.includes('critical') || lower.includes('falciparum')) {
                  flag = 'critical_high';
                  hasCritical = true;
                } else if (
                  lower.includes('positive') ||
                  lower.includes('reactive') ||
                  lower.includes('detected') ||
                  lower.includes('+++')
                ) {
                  if (!lower.includes('non-reactive') && !lower.includes('not detected')) {
                    flag = 'high';
                  }
                }
                return { ...v, value: strVal, flag };
              }

              const parsedNum = Number(rawVal);
              const num = Number.isFinite(parsedNum) ? parsedNum : 0;
              let flag: typeof v.flag = 'normal';
              const minNorm = prmDef
                ? isFemale
                  ? prmDef.normalFemaleMin
                  : prmDef.normalMaleMin
                : 4;
              const maxNorm = prmDef
                ? isFemale
                  ? prmDef.normalFemaleMax
                  : prmDef.normalMaleMax
                : 15;
              const critLow = prmDef ? prmDef.criticalLow : 2;
              const critHigh = prmDef ? prmDef.criticalHigh : 30;

              if (critHigh > 0 && num >= critHigh) {
                flag = 'critical_high';
                hasCritical = true;
              } else if (critLow > 0 && num <= critLow) {
                flag = 'critical_low';
                hasCritical = true;
              } else if (maxNorm > 0 && num > maxNorm) {
                flag = 'high';
              } else if (minNorm > 0 && num < minNorm) {
                flag = 'low';
              }
              return { ...v, value: num, flag };
            });

            const notesEl = document.getElementById('res_notes_input') as HTMLInputElement | null;
            res.status = targetMode;
            res.notes = (notesEl?.value ?? '').trim();
            res.enteredBy = user?.username || 'chemist';
            res.enteredAt = new Date().toISOString().replace('T', ' ').slice(0, 16);

            await requestsRepository.saveResult(res);
            try {
              await authService.logAudit(`إدخال نتائج التحليل ${res.id} (${targetMode})`, 'results', res.id);
            } catch {
              // ignore audit error so modal always closes
            }

            close();
            results = await requestsRepository.getAllResults();
            renderView();

            if (hasCritical) {
              showToast(
                i18n.bi(
                  '🚨 تم رصد قيمة حرجة تهدد الحياة! تم فتح نافذة إبلاغ الطوارئ الإلزامية (ISO 15189 Read-Back).',
                  '🚨 CRITICAL VALUE detected! Opening mandatory ISO 15189 Read-Back Escalation.'
                ),
                'critical'
              );
              openCriticalReadBackModal({
                result: res,
                patient: pat,
                test: tst,
              });
            } else if (targetMode === 'pending_review') {
              showToast(
                i18n.bi(
                  '✓ تم حفظ النتيجة وإرسالها إلى شاشة (مراجعة واعتماد النتائج) بنجاح',
                  '✓ Result saved and sent to Medical Review & Approval'
                ),
                'success'
              );
              if (navigateToReview) {
                window.location.hash = '#/resultReview';
              }
            } else {
              showToast(i18n.bi('تم حفظ النتيجة كمسودة بنجاح', 'Draft result saved successfully'), 'success');
            }
          } catch (err) {
            console.error('Failed to save lab result:', err);
            showToast(
              i18n.bi('حدث خطأ أثناء حفظ النتيجة، يرجى المحاولة مرة أخرى', 'Error saving result, please try again'),
              'error'
            );
          } finally {
            isSubmitting = false;
          }
        };

        document.getElementById('res-save-draft-btn')?.addEventListener('click', () => {
          void handleSaveResult('draft', false);
        });

        document.getElementById('res-submit-review-btn')?.addEventListener('click', () => {
          void handleSaveResult('pending_review', false);
        });

        document.getElementById('res-submit-and-goto-review-btn')?.addEventListener('click', () => {
          void handleSaveResult('pending_review', true);
        });

        form?.addEventListener('submit', (e) => {
          e.preventDefault();
          void handleSaveResult('pending_review', false);
        });
      }
    );
  };

  const getFilteredResults = () => {
    const q = searchQuery.trim().toLowerCase();
    return results.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const pat = patMap.get(r.patientId);
      const tst = tstMap.get(r.testId);
      const req = reqMap.get(r.requestId);
      const smp = sampleByReqId.get(r.requestId);
      const blob = `${pat?.name || ''} ${pat?.nameEn || ''} ${pat?.code || ''} ${tst?.code || ''} ${tst?.nameAr || ''} ${tst?.nameEn || ''} ${req?.requestNumber || ''} ${req?.barcode || ''} ${smp?.sampleCode || ''}`.toLowerCase();
      return blob.includes(q);
    });
  };

  const renderView = () => {
    const canPrint = can(user, 'print', 'results');
    const filteredResults = getFilteredResults();

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.results}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدخال قيم البارامترات للعينات المستلمة، الحساب التلقائي للمعادلات الطبية، وحفظ وطباعة المسودات', 'Enter parameter values for received samples, auto-calculate clinical formulas, and print drafts')}</p>
          </div>
          <div class="flex items-center gap-2">
            <a href="#/resultReview" class="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer">
              ✓ ${i18n.bi('شاشة مراجعة واعتماد النتائج', 'Medical Review & Approval')} (${results.filter((r) => r.status === 'pending_review').length})
            </a>
            ${canPrint ? `<button id="res-print-list" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
          </div>
        </div>

        <!-- Search & Status Filter Bar -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl bg-white border border-slate-200 p-3">
          <div class="sm:col-span-8">
            <input
              id="res-search-input"
              type="search"
              value="${escapeHtml(searchQuery)}"
              placeholder="${i18n.bi('🔍 ابحث باسم المريض أو رقم الطلب أو كود العينة أو اسم التحليل...', '🔍 Search by patient name, request #, sample code, or test name...')}"
              class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            />
          </div>
          <div class="sm:col-span-4">
            <select
              id="res-status-filter"
              class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-sky-600 focus:bg-white focus:outline-none"
            >
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>${i18n.bi(`جميع النتائج (${results.length})`, `All Results (${results.length})`)}</option>
              <option value="draft" ${statusFilter === 'draft' ? 'selected' : ''}>${i18n.bi(`بانتظار الإدخال / مسودة (${results.filter((r) => r.status === 'draft').length})`, `Draft (${results.filter((r) => r.status === 'draft').length})`)}</option>
              <option value="pending_review" ${statusFilter === 'pending_review' ? 'selected' : ''}>${i18n.bi(`مرسلة للمراجعة والاعتماد (${results.filter((r) => r.status === 'pending_review').length})`, `Pending Review (${results.filter((r) => r.status === 'pending_review').length})`)}</option>
              <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>${i18n.bi(`معتمدة نهائياً (${results.filter((r) => r.status === 'approved').length})`, `Approved (${results.filter((r) => r.status === 'approved').length})`)}</option>
            </select>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الطلب / العينة', 'Request / Sample')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التحليل', 'Test')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('القيم المسجلة', 'Entered Values')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${
                filteredResults.length > 0
                  ? filteredResults
                      .map((r) => {
                        const pat = patMap.get(r.patientId);
                        const tst = tstMap.get(r.testId);
                        const req = reqMap.get(r.requestId);
                        const smp = sampleByReqId.get(r.requestId);
                        const valSummary = r.values
                          .slice(0, 4)
                          .map((v) => `${v.parameterNameEn}: ${v.value} ${v.unit} (${v.flag})`)
                          .join(' · ');
                        const extraCount = r.values.length > 4 ? ` +${r.values.length - 4}` : '';
                        const isCrit = r.values.some((v) => v.flag.startsWith('critical'));
                        const statusBadge =
                          r.status === 'approved'
                            ? `<span class="inline-block rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">✓ ${i18n.dict.statuses.approved}</span>`
                            : r.status === 'pending_review'
                            ? `<span class="inline-block rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-bold text-sky-800">⏳ ${i18n.dict.statuses.pending_review}</span>`
                            : `<span class="inline-block rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800">📝 ${i18n.dict.statuses[r.status] || r.status}</span>`;

                        return `
                          <tr class="hover:bg-slate-50">
                            <td class="py-2.5 px-3 font-mono">
                              <div class="font-bold text-slate-900 tabular-nums">${req?.requestNumber || r.requestId}</div>
                              <div class="text-[11px] text-emerald-700 font-semibold tabular-nums">${smp?.sampleCode || 'SMP'} · ${i18n.dict.statuses[smp?.status || 'received'] || 'مستلمة'}</div>
                            </td>
                            <td class="py-2.5 px-3">
                              <div class="font-bold text-slate-900">${pat?.name || r.patientId}</div>
                              ${pat?.code ? `<div class="text-[11px] font-mono text-slate-400">${pat.code}</div>` : ''}
                            </td>
                            <td class="py-2.5 px-3 font-semibold text-slate-700">${tst ? `${tst.code} — ${i18n.bi(tst.nameAr, tst.nameEn)}` : r.testId}</td>
                            <td class="py-2.5 px-3 font-mono ${isCrit ? 'text-rose-700 font-bold' : 'text-slate-600'} tabular-nums">${valSummary}${extraCount}</td>
                            <td class="py-2.5 px-3">${statusBadge}</td>
                            <td class="py-2.5 px-3">
                              <div class="flex flex-wrap items-center gap-1.5">
                                <button type="button" data-entry="${r.id}" class="res-edit-btn rounded-md bg-sky-600 px-2.5 py-1 text-white hover:bg-sky-700 font-semibold cursor-pointer">
                                  ${i18n.bi('إدخال / تعديل القيم', 'Enter / Edit Values')}
                                </button>
                                ${
                                  r.status === 'draft'
                                    ? `<button type="button" data-quick-send="${r.id}" class="res-quick-send-btn rounded-md bg-amber-600 px-2.5 py-1 text-white hover:bg-amber-700 font-semibold cursor-pointer">
                                        ${i18n.bi('إرسال للمراجعة', 'Send for Review')}
                                      </button>`
                                    : r.status === 'pending_review'
                                    ? `<a href="#/resultReview" class="rounded-md bg-emerald-600 px-2.5 py-1 text-white hover:bg-emerald-700 font-semibold cursor-pointer">
                                        ✓ ${i18n.bi('شاشة الاعتماد', 'Approve')}
                                      </a>`
                                    : ''
                                }
                                <button type="button" data-draft-prt="${r.id}" class="res-draft-prt-btn text-indigo-700 hover:underline font-semibold cursor-pointer">
                                  ${i18n.bi('طباعة مسودة', 'Print Draft')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
                  : `
                    <tr>
                      <td colspan="6" class="py-8 text-center text-slate-500">
                        <div class="font-bold text-slate-700 mb-1">${i18n.bi('لا توجد نتائج مطابقة حالياً', 'No results found')}</div>
                        <div class="text-xs">${i18n.bi('تأكد من إنشاء طلب تحاليل للمريض واستلام عينته في شاشة (طلبات التحاليل) أو (استقبال العينات).', 'Create a lab request and mark the sample received in Lab Requests or Sample Reception.')}</div>
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    const searchInputEl = document.getElementById('res-search-input') as HTMLInputElement | null;
    searchInputEl?.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      const pos = searchInputEl.selectionStart || searchQuery.length;
      renderView();
      const nextInput = document.getElementById('res-search-input') as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(pos, pos);
      }
    });

    const statusSelectEl = document.getElementById('res-status-filter') as HTMLSelectElement | null;
    statusSelectEl?.addEventListener('change', () => {
      statusFilter = statusSelectEl.value;
      renderView();
    });

    document.getElementById('res-print-list')?.addEventListener('click', () => {
      const html = `
        <table class="print-table" dir="ltr" style="direction:ltr; text-align:left;">
          <thead><tr><th>Patient</th><th>Test</th><th>Values</th><th>Status</th></tr></thead>
          <tbody>
            ${filteredResults.map((r) => `<tr><td>${patMap.get(r.patientId)?.nameEn || patMap.get(r.patientId)?.name || ''}</td><td>${tstMap.get(r.testId)?.nameEn || tstMap.get(r.testId)?.nameAr || ''}</td><td class="tabular-nums">${r.values.map((v) => `${v.parameterNameEn}: ${v.value} ${v.unit}`).join(', ')}</td><td>${r.status}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      void printService.printA4('Laboratory Results Entry Summary', html, '', {
        forceEnglishLtr: true,
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.res-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-entry'));
        if (target) openEntryModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.res-quick-send-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-quick-send'));
        if (!target) return;
        if (!(await enforcePermission('edit', 'results'))) return;
        target.status = 'pending_review';
        target.enteredBy = user?.username || 'chemist';
        target.enteredAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
        await requestsRepository.saveResult(target);
        try {
          await authService.logAudit(`إرسال نتيجة للمراجعة والاعتماد ${target.id}`, 'results', target.id);
        } catch {
          // ignore
        }
        results = await requestsRepository.getAllResults();
        renderView();
        showToast(
          i18n.bi(
            '✓ تم إرسال النتيجة إلى شاشة (مراجعة واعتماد النتائج) بنجاح',
            '✓ Result sent to Medical Review & Approval'
          ),
          'success'
        );
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.res-draft-prt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-draft-prt'));
        if (!target) return;
        const pat = patMap.get(target.patientId);
        const tst = tstMap.get(target.testId);
        const patNameEn = pat?.nameEn || pat?.name || '';
        const tstNameEn = tst?.nameEn || tst?.nameAr || '';
        const html = `
          <div dir="ltr" style="direction:ltr; text-align:left;">
            <div style="margin-bottom:10px; padding:8px; border:1px dashed #64748b; border-radius:6px;">
              <strong>PRELIMINARY DRAFT FOR INTERNAL REVIEW — NOT VALIDATED FOR RELEASE</strong><br/>
              <strong>Patient:</strong> ${patNameEn} | <strong>Test:</strong> ${tstNameEn} ${tst?.code ? `(${tst.code})` : ''}
            </div>
            <table class="print-table" dir="ltr" style="direction:ltr; text-align:left;">
              <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Reference Interval</th><th>Flag</th></tr></thead>
              <tbody>
                ${target.values.map((v) => `<tr><td><strong>${v.parameterNameEn || v.parameterNameAr}</strong></td><td class="tabular-nums">${v.value}</td><td>${v.unit}</td><td class="tabular-nums">${v.normalRange}</td><td>${v.flag}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        `;
        void printService.printA4(`Preliminary Result Draft — ${patNameEn}`, html, tstNameEn, {
          forceEnglishLtr: true,
        });
      });
    });
  };

  renderView();
}
