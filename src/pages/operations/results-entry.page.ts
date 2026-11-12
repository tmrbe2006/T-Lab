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
  let [results, patients, tests, allParameters] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
    testsRepository.getAllParameters(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));
  const paramMap = new Map(allParameters.map((p) => [p.id, p]));

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
    const deltaAlerts = evaluateDeltaChecksForResult(res, results);

    openCustomModal(
      `${i18n.bi('إدخال وتعديل نتائج التحليل:', 'Result Entry:')} ${tst?.nameEn || ''} — ${pat?.name || ''}`,
      `
        <form id="res-entry-form" class="space-y-4 text-xs">
          <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 flex justify-between">
            <span><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''} (${pat?.age || ''} Y · ${pat?.gender === 'female' ? 'أنثى F' : 'ذكر M'})</span>
            <span><strong>${i18n.bi('الحالة الحالية:', 'Current Status:')}</strong> ${res.status}</span>
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
                    <select name="val_${idx}" class="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900">
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
                      step="0.001"
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
            <input name="notes" value="${res.notes || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="submit" data-mode="draft" class="res-submit-btn rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
              ${i18n.bi('حفظ كمسودة (Draft)', 'Save Draft')}
            </button>
            <button type="submit" data-mode="pending_review" class="res-submit-btn rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.bi('إرسال للمراجعة والاعتماد', 'Send for Medical Review')}
            </button>
          </div>
        </form>
      `,
      (close) => {
        let targetMode: LabResult['status'] = 'pending_review';
        document.querySelectorAll<HTMLButtonElement>('.res-submit-btn').forEach((b) => {
          b.addEventListener('click', () => {
            targetMode = (b.getAttribute('data-mode') as LabResult['status']) || 'pending_review';
          });
        });

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

              // If the user is directly typing into this calculated field, auto-check manual override
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
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission('edit', 'results'))) return;
          const fd = new FormData(form);
          let hasCritical = false;
          const isFemale = pat?.gender === 'female';

          res.values = res.values.map((v, idx) => {
            const rawVal = fd.get(`val_${idx}`);
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

            const num = Number(rawVal);
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

          res.status = targetMode;
          res.notes = String(fd.get('notes') || '').trim();
          res.enteredBy = user?.username || 'chemist';

          await requestsRepository.saveResult(res);
          await authService.logAudit(`إدخال نتائج التحليل ${res.id} (${targetMode})`, 'results', res.id);
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
          } else {
            showToast(i18n.bi('تم حفظ النتيجة بنجاح', 'Result saved successfully'), 'success');
          }
        });
      }
    );
  };

  const renderView = () => {
    const canPrint = can(user, 'print', 'results');
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.results}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدخال قيم البارامترات، التمييز التلقائي للنتائج المرتفعة والحرجة، وحفظ وطباعة المسودات', 'Enter parameter values, auto-flag abnormal/critical limits, and print drafts')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="res-print-list" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التحليل', 'Test')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('القيم المسجلة', 'Entered Values')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${results
                .map((r) => {
                  const pat = patMap.get(r.patientId);
                  const tst = tstMap.get(r.testId);
                  const valSummary = r.values
                    .map((v) => `${v.parameterNameEn}: ${v.value} ${v.unit} (${v.flag})`)
                    .join(' · ');
                  const isCrit = r.values.some((v) => v.flag.startsWith('critical'));
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-bold text-slate-900">${pat?.name || r.patientId}</td>
                      <td class="py-2.5 px-3 font-semibold text-slate-700">${tst ? i18n.bi(tst.nameAr, tst.nameEn) : r.testId}</td>
                      <td class="py-2.5 px-3 font-mono ${isCrit ? 'text-rose-700 font-bold' : 'text-slate-600'} tabular-nums">${valSummary}</td>
                      <td class="py-2.5 px-3 font-semibold">${i18n.dict.statuses[r.status] || r.status}</td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" data-entry="${r.id}" class="res-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">
                            ${i18n.bi('إدخال / تعديل القيم', 'Enter / Edit Values')}
                          </button>
                          <button type="button" data-draft-prt="${r.id}" class="res-draft-prt-btn text-indigo-700 hover:underline font-semibold cursor-pointer">
                            ${i18n.bi('طباعة مسودة', 'Print Draft')}
                          </button>
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

    document.getElementById('res-print-list')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>Patient</th><th>Test</th><th>Values</th><th>Status</th></tr></thead>
          <tbody>
            ${results.map((r) => `<tr><td>${patMap.get(r.patientId)?.name || ''}</td><td>${tstMap.get(r.testId)?.nameAr || ''}</td><td class="tabular-nums">${r.values.map((v) => `${v.parameterNameEn}: ${v.value} ${v.unit}`).join(', ')}</td><td>${r.status}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.results, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.res-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-entry'));
        if (target) openEntryModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.res-draft-prt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-draft-prt'));
        if (!target) return;
        const pat = patMap.get(target.patientId);
        const tst = tstMap.get(target.testId);
        const html = `
          <div style="margin-bottom:10px; padding:8px; border:1px dashed #64748b; border-radius:6px;">
            <strong>${i18n.bi('مسودة أولية للمراجعة الداخلية - غير معتمدة للتسليم', 'INITIAL DRAFT FOR INTERNAL REVIEW')}</strong><br/>
            ${i18n.bi('المريض:', 'Patient:')} ${pat?.name || ''} | ${i18n.bi('التحليل:', 'Test:')} ${tst?.nameAr || ''}
          </div>
          <table class="print-table">
            <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Normal Range</th><th>Flag</th></tr></thead>
            <tbody>
              ${target.values.map((v) => `<tr><td>${v.parameterNameAr} / ${v.parameterNameEn}</td><td class="tabular-nums">${v.value}</td><td>${v.unit}</td><td class="tabular-nums">${v.normalRange}</td><td>${v.flag}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
        printService.printA4(`${i18n.bi('مسودة نتيجة تحليل', 'Draft Result')} — ${pat?.name || ''}`, html);
      });
    });
  };

  renderView();
}
