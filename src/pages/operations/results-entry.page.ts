import { authService } from '../../auth/auth.service';
import { openCustomModal, showToast } from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import {
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../../repositories';
import type { LabResult } from '../../types';

export async function renderResultsEntryPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [results, patients, tests] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));

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

    openCustomModal(
      `${i18n.bi('إدخال وتعديل نتائج التحليل:', 'Result Entry:')} ${tst?.nameEn || ''} — ${pat?.name || ''}`,
      `
        <form id="res-entry-form" class="space-y-4 text-xs">
          <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 flex justify-between">
            <span><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''} (${pat?.age || ''} Y)</span>
            <span><strong>${i18n.bi('الحالة الحالية:', 'Current Status:')}</strong> ${res.status}</span>
          </div>
          <div class="space-y-2.5">
            ${res.values
              .map(
                (v, idx) => `
                <div class="grid grid-cols-12 items-center gap-2 border-b border-slate-100 pb-2">
                  <div class="col-span-5 font-semibold text-slate-800">${v.parameterNameAr} / ${v.parameterNameEn}</div>
                  <div class="col-span-3">
                    <input
                      name="val_${idx}"
                      type="number"
                      step="0.01"
                      value="${v.value}"
                      class="w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div class="col-span-2 font-mono text-slate-500">${v.unit}</div>
                  <div class="col-span-2 font-mono text-emerald-700 text-[11px]">${v.normalRange}</div>
                </div>
              `
              )
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
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission('edit', 'results'))) return;
          const fd = new FormData(form);
          let hasCritical = false;

          res.values = res.values.map((v, idx) => {
            const num = Number(fd.get(`val_${idx}`));
            let flag: typeof v.flag = 'normal';
            if (num >= 30 || num <= 2) {
              flag = num >= 30 ? 'critical_high' : 'critical_low';
              hasCritical = true;
            } else if (num > 15) {
              flag = 'high';
            } else if (num < 4) {
              flag = 'low';
            }
            return { ...v, value: num, flag };
          });

          res.status = targetMode;
          res.notes = String(fd.get('notes') || '').trim();
          res.enteredBy = user?.username || 'chemist';

          await requestsRepository.saveResult(res);
          await authService.logAudit(`إدخال نتائج التحليل ${res.id} (${targetMode})`, 'results', res.id);
          if (hasCritical) {
            showToast(i18n.bi('تنبيه: تم رصد قيمة حرجة (Critical Value) في النتيجة المدخلة!', 'CRITICAL VALUE detected in entered result!'), 'critical');
          } else {
            showToast(i18n.bi('تم حفظ النتيجة بنجاح', 'Result saved successfully'), 'success');
          }
          close();
          results = await requestsRepository.getAllResults();
          renderView();
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
