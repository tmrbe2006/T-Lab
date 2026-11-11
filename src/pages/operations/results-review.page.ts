import { authService } from '../../auth/auth.service';
import { escapeHtml, showToast } from '../../components/common';
import { db } from '../../db/database';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import {
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../../repositories';
import {
  buildQrVerificationFooterHtml,
  buildResultWhatsAppMessage,
  ensureEnterpriseSeedData,
  evaluateDeltaChecksForResult,
  getCriticalValuesFromResult,
  openCriticalLogsHistoryModal,
  openCriticalReadBackModal,
  openSmartPatientReportModal,
  openWhatsAppDispatchModal,
} from '../../services/enterprise-lab.service';

export async function renderResultReviewPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();
  const user = authService.getCurrentUser();
  let [results, patients, tests, qcLots, critLogs] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
    db.qcControlLots.toArray(),
    db.criticalValueLogs.toArray(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));

  const refreshData = async () => {
    [results, qcLots, critLogs] = await Promise.all([
      requestsRepository.getAllResults(),
      db.qcControlLots.toArray(),
      db.criticalValueLogs.toArray(),
    ]);
  };

  const renderView = () => {
    const canApprove = can(user, 'approve', 'resultReview');
    const canPrint = can(user, 'print', 'resultReview');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.resultReview}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'مراجعة النتائج، فحص التغير التاريخي الذكي (Delta Check)، توثيق القيم الحرجة (ISO 15189 Read-Back)، التقرير التفاعلي الذكي برمز QR، والإرسال عبر واتساب',
                'Review lab results, automated Delta Check alerts, ISO 15189 Critical Read-Back logging, Smart QR Report with Historical Trends, and 1-Click WhatsApp'
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="rev-crit-registry-btn" type="button" class="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 cursor-pointer">
              🚨 ${i18n.bi('سجل إبلاغات القيم الحرجة (ISO 15189)', 'Critical Value Read-Back Log')} (${critLogs.length})
            </button>
            ${canPrint ? `<button id="rev-print-list" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${
              canApprove
                ? `<button id="rev-bulk-approve" type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer">
                    ✓ ${i18n.bi('اعتماد جماعي لكافة النتائج بانتظار المراجعة', 'Bulk Approve All Pending Results')}
                  </button>`
                : ''
            }
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التحليل وحالة الكنترول', 'Test & QC')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النتيجة وفحص التغير التاريخي (Delta Check)', 'Values & Delta Check')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المعتمد / توثيق الطوارئ', 'Approval / Escalation')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${results
                .map((r) => {
                  const pat = patMap.get(r.patientId);
                  const tst = tstMap.get(r.testId);
                  const deltaAlerts = evaluateDeltaChecksForResult(r, results);
                  const critVals = getCriticalValuesFromResult(r);
                  const hasCritLog = critLogs.some((l) => l.resultId === r.id);
                  const lockedLots = qcLots.filter((l) => l.testId === r.testId && l.qcLocked);

                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(pat?.name || r.patientId)}</div>
                        <div class="text-[11px] font-mono text-slate-400">${escapeHtml(pat?.phone || '')}</div>
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="font-semibold text-slate-800">${escapeHtml(tst ? i18n.bi(tst.nameAr, tst.nameEn) : r.testId)}</div>
                        ${
                          lockedLots.length > 0
                            ? `<span class="inline-block mt-1 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold">🔒 Westgard QC Locked</span>`
                            : `<span class="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">✓ QC In-Control</span>`
                        }
                      </td>
                      <td class="py-2.5 px-3 font-mono tabular-nums space-y-1">
                        ${r.values
                          .map(
                            (v) =>
                              `<div class="${
                                v.flag.startsWith('critical')
                                  ? 'text-rose-700 font-extrabold'
                                  : v.flag !== 'normal'
                                  ? 'text-amber-700 font-bold'
                                  : ''
                              }"><strong>${escapeHtml(v.parameterNameEn)}:</strong> ${escapeHtml(String(v.value))} ${escapeHtml(v.unit)} <span class="text-slate-400">[${escapeHtml(v.normalRange)}]</span></div>`
                          )
                          .join('')}
                        ${deltaAlerts
                          .map(
                            (da) => `
                          <div class="rounded bg-amber-50 border border-amber-300 px-2 py-1 text-[11px] font-sans font-bold text-amber-900">
                            ⚡ ${escapeHtml(i18n.bi(da.messageAr, da.messageEn))}
                          </div>
                        `
                          )
                          .join('')}
                      </td>
                      <td class="py-2.5 px-3 font-semibold ${r.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}">
                        ${i18n.dict.statuses[r.status] || r.status}
                      </td>
                      <td class="py-2.5 px-3 font-mono text-slate-500 tabular-nums space-y-1">
                        <div>${r.approvedBy ? `${escapeHtml(r.approvedBy)} (${escapeHtml(r.approvedAt || '')})` : '-'}</div>
                        ${
                          critVals.length > 0
                            ? hasCritLog
                              ? `<span class="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-sans font-bold">✓ ISO 15189 Read-Back Logged</span>`
                              : `<span class="inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-sans font-bold">⚠️ يتطلب إبلاغ طوارئ Read-Back</span>`
                            : ''
                        }
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-1.5">
                          ${
                            canApprove && r.status !== 'approved'
                              ? `<button type="button" data-app="${r.id}" class="rev-app-btn rounded bg-emerald-600 px-2.5 py-1 text-[11px] text-white font-bold hover:bg-emerald-500 cursor-pointer">${i18n.dict.actions.approve}</button>`
                              : ''
                          }
                          ${
                            critVals.length > 0
                              ? `<button type="button" data-crit="${r.id}" class="rev-crit-btn rounded bg-rose-600 px-2.5 py-1 text-[11px] text-white font-bold hover:bg-rose-500 cursor-pointer">
                                  🚨 ${i18n.bi('إبلاغ حرج Read-Back', 'Critical Escalation')}
                                </button>`
                              : ''
                          }
                          <button type="button" data-smart="${r.id}" class="rev-smart-btn rounded bg-indigo-600 px-2.5 py-1 text-[11px] text-white font-bold hover:bg-indigo-500 cursor-pointer">
                            📱 ${i18n.bi('تقرير ذكي + QR', 'Smart QR & Trend')}
                          </button>
                          <button type="button" data-wa="${r.id}" class="rev-wa-btn rounded bg-emerald-700 px-2.5 py-1 text-[11px] text-white font-bold hover:bg-emerald-600 cursor-pointer">
                            💬 واتساب
                          </button>
                          ${
                            canPrint
                              ? `<button type="button" data-prt="${r.id}" class="rev-prt-btn rounded border border-sky-600 px-2 py-1 text-[11px] text-sky-700 font-bold hover:bg-sky-50 cursor-pointer">A4</button>`
                              : ''
                          }
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

    document.getElementById('rev-crit-registry-btn')?.addEventListener('click', () => {
      openCriticalLogsHistoryModal();
    });

    document.getElementById('rev-print-list')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>Patient</th><th>Test</th><th>Status</th><th>Approved By</th><th>Approved At</th></tr></thead>
          <tbody>
            ${results.map((r) => `<tr><td>${patMap.get(r.patientId)?.name || ''}</td><td>${tstMap.get(r.testId)?.nameAr || ''}</td><td>${r.status}</td><td>${r.approvedBy || '-'}</td><td class="tabular-nums">${r.approvedAt || '-'}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.resultReview, html);
    });

    document.getElementById('rev-bulk-approve')?.addEventListener('click', async () => {
      if (!(await enforcePermission('approve', 'resultReview'))) return;
      const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
      for (const r of results) {
        if (r.status !== 'approved') {
          r.status = 'approved';
          r.approvedBy = user?.username || 'doctor';
          r.approvedAt = now;
          await requestsRepository.saveResult(r);
        }
      }
      await authService.logAudit('اعتماد جماعي للنتائج', 'resultReview', 'BULK-APPROVE');
      showToast(i18n.bi('تم اعتماد جميع النتائج المعلقة بنجاح', 'All pending results approved'), 'success');
      await refreshData();
      renderView();
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-app-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await enforcePermission('approve', 'resultReview'))) return;
        const target = results.find((x) => x.id === btn.getAttribute('data-app'));
        if (!target) return;

        // Check Westgard QC Lock first
        const lockedLots = qcLots.filter((l) => l.testId === target.testId && l.qcLocked);
        if (lockedLots.length > 0) {
          showToast(
            i18n.bi(
              `⛔ لا يمكن اعتماد النتيجة لأن الكنترول اليومي للتحليل خارج حدود Westgard (${lockedLots[0].lotNumber}). يرجى معايرة الجهاز أولاً من شاشة رقابة الجودة.`,
              `⛔ Cannot approve result: Westgard QC Lock is active for ${lockedLots[0].lotNumber}. Please calibrate in Internal QC screen.`
            ),
            'error'
          );
          return;
        }

        const critVals = getCriticalValuesFromResult(target);
        const alreadyLogged = critLogs.some((l) => l.resultId === target.id);

        const finalizeApprove = async () => {
          target.status = 'approved';
          target.approvedBy = user?.username || 'doctor';
          target.approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
          await requestsRepository.saveResult(target);
          await authService.logAudit(`اعتماد نتيجة تحليل: ${target.id}`, 'resultReview', target.id);
          showToast(i18n.bi('تم اعتماد النتيجة بنجاح', 'Result approved'), 'success');
          await refreshData();
          renderView();
        };

        // If result contains a critical value and hasn't had Read-Back logged yet, open mandatory ISO 15189 escalation modal
        if (critVals.length > 0 && !alreadyLogged) {
          openCriticalReadBackModal({
            result: target,
            patient: patMap.get(target.patientId),
            test: tstMap.get(target.testId),
            onSuccess: async () => {
              await finalizeApprove();
            },
          });
          return;
        }

        await finalizeApprove();
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-crit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-crit'));
        if (!target) return;
        openCriticalReadBackModal({
          result: target,
          patient: patMap.get(target.patientId),
          test: tstMap.get(target.testId),
          onSuccess: async () => {
            await refreshData();
            renderView();
          },
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-smart-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-smart'));
        if (!target) return;
        openSmartPatientReportModal({
          result: target,
          patient: patMap.get(target.patientId),
          test: tstMap.get(target.testId),
          requestNumber: target.requestId,
          allPatientResults: results,
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-wa-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-wa'));
        if (!target) return;
        const pat = patMap.get(target.patientId);
        const tst = tstMap.get(target.testId);
        const msg = buildResultWhatsAppMessage({
          patient: pat,
          test: tst,
          requestNumber: target.requestId,
          result: target,
        });
        openWhatsAppDispatchModal({
          recipientName: pat?.name || target.patientId,
          phone: pat?.phone || '01000000000',
          titleAr: 'إرسال النتيجة والتقرير الذكي عبر واتساب',
          titleEn: 'Send Lab Result & Smart Verification via WhatsApp',
          messageBody: msg,
          referenceId: target.id,
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-prt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-prt'));
        if (!target) return;
        const pat = patMap.get(target.patientId);
        const tst = tstMap.get(target.testId);
        const qrFooter = buildQrVerificationFooterHtml({
          reportNumber: target.id,
          patientName: pat?.name || '',
          testName: tst?.nameEn || '',
          approvedAt: target.approvedAt || target.enteredAt,
        });
        const html = `
          <div style="margin-bottom:12px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
            <div><strong>${i18n.bi('اسم المريض:', 'Patient Name:')}</strong> ${pat?.name || ''} · <strong>${i18n.bi('العمر:', 'Age:')}</strong> ${pat?.age || ''}</div>
            <div><strong>${i18n.bi('التحليل:', 'Test:')}</strong> ${tst ? `${tst.nameAr} (${tst.nameEn})` : ''} · <strong>${i18n.bi('حالة التقرير:', 'Status:')}</strong> ${target.status.toUpperCase()}</div>
          </div>
          <table class="print-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Result</th>
                <th>Unit</th>
                <th>Reference Interval</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              ${target.values
                .map(
                  (v) => `
                  <tr>
                    <td>${v.parameterNameAr} / ${v.parameterNameEn}</td>
                    <td class="tabular-nums" style="font-weight:700;">${v.value}</td>
                    <td>${v.unit}</td>
                    <td class="tabular-nums">${v.normalRange}</td>
                    <td>${v.flag.toUpperCase()}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
          <div style="margin-top:16px; font-size:11px;">
            <strong>${i18n.bi('اعتماد الطبيب المسؤول:', 'Approved By Doctor:')}</strong> ${target.approvedBy || 'Pending'} (${target.approvedAt || ''})
          </div>
          ${qrFooter}
        `;
        printService.printA4(
          i18n.bi('تقرير نتيجة تحاليل طبية معتمد', 'Official Laboratory Result Report'),
          html,
          `${pat?.name || ''} — ${tst?.code || ''}`
        );
      });
    });
  };

  renderView();
}
