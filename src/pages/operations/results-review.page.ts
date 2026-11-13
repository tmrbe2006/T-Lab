import { authService } from '../../auth/auth.service';
import { escapeHtml, showToast } from '../../components/common';
import { db } from '../../db/database';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import {
  doctorsRepository,
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../../repositories';
import {
  buildConsolidatedPatientReportHtml,
  buildConsolidatedWhatsAppMessage,
  buildQrVerificationFooterHtml,
  buildResultWhatsAppMessage,
  ensureEnterpriseSeedData,
  evaluateDeltaChecksForResult,
  getCriticalValuesFromResult,
  openConsolidatedSmartReportModal,
  openCriticalLogsHistoryModal,
  openCriticalReadBackModal,
  openSmartPatientReportModal,
  openWhatsAppDispatchModal,
} from '../../services/enterprise-lab.service';
import type { LabResult } from '../../types';

export async function renderResultReviewPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();
  const user = authService.getCurrentUser();
  let [results, patients, tests, qcLots, critLogs, allRequests, allDoctors] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
    db.qcControlLots.toArray(),
    db.criticalValueLogs.toArray(),
    requestsRepository.getAllRequests(),
    doctorsRepository.getAll(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));
  const reqMap = new Map(allRequests.map((r) => [r.id, r]));
  const docMap = new Map(allDoctors.map((d) => [d.id, d]));

  let searchQuery = '';
  let statusFilter = 'all';

  // Consolidated Multi-Test Report Selection State (Restricted to 1 Patient at a time)
  const selectedResultIds = new Set<string>();
  let selectedPatientId: string | null = null;
  let pageBreakPerDepartment = false;

  const syncSelectedPatientLock = () => {
    if (selectedResultIds.size === 0) {
      selectedPatientId = null;
      return;
    }
    const firstId = Array.from(selectedResultIds)[0];
    const firstRes = results.find((r) => r.id === firstId);
    selectedPatientId = firstRes?.patientId || null;
  };

  const sortResultsForReview = (list: typeof results) => {
    const rank = (s: string) => (s === 'pending_review' ? 0 : s === 'draft' ? 1 : 2);
    return list.slice().sort((a, b) => {
      const rDiff = rank(a.status) - rank(b.status);
      if (rDiff !== 0) return rDiff;
      const aIsNew = a.id.startsWith('res_req_') ? 1 : 0;
      const bIsNew = b.id.startsWith('res_req_') ? 1 : 0;
      if (aIsNew !== bIsNew) return bIsNew - aIsNew;
      return (b.enteredAt || '').localeCompare(a.enteredAt || '');
    });
  };

  results = sortResultsForReview(results);

  const refreshData = async () => {
    [results, qcLots, critLogs, allRequests] = await Promise.all([
      requestsRepository.getAllResults(),
      db.qcControlLots.toArray(),
      db.criticalValueLogs.toArray(),
      requestsRepository.getAllRequests(),
    ]);
    results = sortResultsForReview(results);
    syncSelectedPatientLock();
  };

  const getFilteredResults = () => {
    const q = searchQuery.trim().toLowerCase();
    return results.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const pat = patMap.get(r.patientId);
      const tst = tstMap.get(r.testId);
      const req = reqMap.get(r.requestId);
      const blob = `${pat?.name || ''} ${pat?.nameEn || ''} ${pat?.code || ''} ${pat?.phone || ''} ${tst?.code || ''} ${tst?.nameAr || ''} ${tst?.nameEn || ''} ${req?.requestNumber || ''} ${r.requestId || ''}`.toLowerCase();
      return blob.includes(q);
    });
  };

  const executeConsolidatedPrint = (targetResults: LabResult[], forcePageBreak?: boolean) => {
    const approvedOnly = targetResults.filter((r) => r.status === 'approved');
    if (approvedOnly.length === 0) {
      showToast(
        i18n.bi(
          '⛔ لا يمكن طباعة تقرير النتائج إلا بعد اعتماده رسمياً. يرجى اعتماد التحليل أولاً.',
          '⛔ Result reports can only be printed after official approval. Please approve the test first.'
        ),
        'warning'
      );
      return;
    }
    const pat = patMap.get(approvedOnly[0].patientId);
    const { html, subtitle } = buildConsolidatedPatientReportHtml({
      results: approvedOnly,
      patient: pat,
      testsMap: tstMap,
      requestsMap: reqMap,
      doctorsMap: docMap,
      pageBreakPerDepartment: forcePageBreak ?? pageBreakPerDepartment,
    });
    void printService.printA4(
      'Official Laboratory Results Report',
      html,
      subtitle,
      { forceEnglishLtr: true }
    );
  };

  const renderView = () => {
    const canApprove = can(user, 'approve', 'resultReview');
    const canPrint = can(user, 'print', 'resultReview');
    const filteredResults = getFilteredResults();
    const pendingCount = results.filter((r) => r.status === 'pending_review').length;

    // Count results per patient for quick selection badges
    const resultsByPatient = new Map<string, LabResult[]>();
    for (const r of results) {
      const list = resultsByPatient.get(r.patientId) || [];
      list.push(r);
      resultsByPatient.set(r.patientId, list);
    }

    const selectedResultsList = results.filter((r) => selectedResultIds.has(r.id));
    const activePatient = selectedPatientId ? patMap.get(selectedPatientId) : undefined;
    const activePatientAllResults = selectedPatientId ? resultsByPatient.get(selectedPatientId) || [] : [];
    const activePatientApprovedResults = activePatientAllResults.filter((r) => r.status === 'approved');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.resultReview}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'مراجعة واعتماد النتائج، اختيار أكثر من تحليل للمريض لطباعتها في تقرير طبي واحد مجمّع (Consolidated Report)، فحص التغير التاريخي، والإرسال عبر واتساب',
                'Review & approve results, select multiple patient tests to print in a single Consolidated Report, Delta Check, and 1-Click WhatsApp'
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
                    ✓ ${i18n.bi('اعتماد جماعي لكافة النتائج بانتظار المراجعة', 'Bulk Approve All Pending Results')} (${pendingCount})
                  </button>`
                : ''
            }
          </div>
        </div>

        <!-- Consolidated Multi-Test Report Action Bar -->
        ${
          selectedResultsList.length > 0
            ? `
          <div class="rounded-xl border-2 border-sky-600 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-4 shadow-md space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-extrabold text-white">
                    🖨️ ${i18n.bi(`التقرير المجمّع الموحد (${selectedResultsList.length} تحاليل مختارة)`, `Consolidated Report (${selectedResultsList.length} Selected Tests)`)}
                  </span>
                  <span class="text-sm font-extrabold text-slate-900">
                    ${i18n.bi('المريض:', 'Patient:')} ${escapeHtml(activePatient?.name || '-')}
                  </span>
                  ${
                    activePatient?.code
                      ? `<span class="text-xs font-mono text-slate-500">(${escapeHtml(activePatient.code)})</span>`
                      : ''
                  }
                </div>
                <div class="flex flex-wrap items-center gap-1.5 pt-1">
                  ${selectedResultsList
                    .map((sr) => {
                      const st = tstMap.get(sr.testId);
                      return `
                        <span class="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-900 shadow-2xs">
                          <span>🧪 ${escapeHtml(st ? `${st.code} (${st.nameAr})` : sr.testId)}</span>
                          <button type="button" data-unselect-res="${sr.id}" class="rev-unselect-chip text-rose-600 hover:text-rose-800 font-extrabold cursor-pointer" title="${i18n.bi('إزالة من التقرير المجمع', 'Remove')}">✕</button>
                        </span>
                      `;
                    })
                    .join('')}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                ${
                  activePatientApprovedResults.length > selectedResultsList.length
                    ? `<button id="rev-select-all-pat-approved" type="button" class="rounded-lg border border-sky-600 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 cursor-pointer">
                        ☑ ${i18n.bi(`تحديد كل التحاليل المعتمدة للمريض (${activePatientApprovedResults.length})`, `Select All Approved (${activePatientApprovedResults.length})`)}
                      </button>`
                    : ''
                }
                <button id="rev-consolidated-print-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-sky-700 shadow-xs cursor-pointer">
                  🖨️ ${i18n.bi(`طباعة التقرير الموحد (${selectedResultsList.length} تحاليل في تقرير واحد A4)`, `Print Consolidated Report (${selectedResultsList.length} Tests A4)`)}
                </button>
                <button id="rev-consolidated-smart-btn" type="button" class="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer">
                  📱 ${i18n.bi('التقرير الذكي الموحد + QR', 'Consolidated Smart QR')}
                </button>
                <button id="rev-consolidated-wa-btn" type="button" class="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-600 cursor-pointer">
                  💬 ${i18n.bi('إرسال التقرير المجمع واتساب', 'Send Consolidated WhatsApp')}
                </button>
                <button id="rev-clear-selection-btn" type="button" class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                  ✕ ${i18n.bi('إلغاء التحديد', 'Clear')}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-sky-200/80 pt-2 text-xs text-slate-600">
              <label class="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input id="rev-pagebreak-dept-chk" type="checkbox" ${pageBreakPerDepartment ? 'checked' : ''} class="w-4 h-4 rounded border-slate-300 accent-sky-600" />
                <span>📄 ${i18n.bi('فصل كل قسم علمي في صفحة مستقلة عند الطباعة (اتركه غير محدد لطباعة جميع التحاليل متتالية في نفس الصفحة)', 'Start each scientific department on a new page (uncheck to print consecutively on the same page)')}</span>
              </label>
              <span class="text-[11px] font-semibold text-sky-800">
                🔒 ${i18n.bi('الحماية الذكية مفعلة: يتم تجميع تحاليل نفس المريض فقط بترويسة واحدة ورمز QR موحد', 'Smart Guard Active: Only tests for the same patient can be combined')}
              </span>
            </div>
          </div>
        `
            : `
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div class="flex items-center gap-2">
              <span class="text-base">💡</span>
              <span>
                <strong>${i18n.bi('طباعة أكثر من تحليل في تقرير واحد:', 'Multi-Test Consolidated Report:')}</strong>
                ${i18n.bi(
                  'قم بتحديد مربعات الاختيار (☑) بجانب التحاليل المطلوبة للمريض، أو اضغط زر (طباعة مجمعة للمريض) لدمجها في تقرير A4 واحد بترويسة موحدة.',
                  'Check (☑) multiple tests for a patient or click (Consolidated Print) to merge them into a single A4 report.'
                )}
              </span>
            </div>
          </div>
        `
        }

        <!-- Search & Status Filter Bar -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl bg-white border border-slate-200 p-3">
          <div class="sm:col-span-8">
            <input
              id="rev-search-input"
              type="search"
              value="${escapeHtml(searchQuery)}"
              placeholder="${i18n.bi('🔍 ابحث باسم المريض أو رقم الطلب أو الهاتف أو اسم التحليل...', '🔍 Search by patient name, request #, phone, or test name...')}"
              class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            />
          </div>
          <div class="sm:col-span-4">
            <select
              id="rev-status-filter"
              class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-sky-600 focus:bg-white focus:outline-none"
            >
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>${i18n.bi(`جميع النتائج (${results.length})`, `All Results (${results.length})`)}</option>
              <option value="pending_review" ${statusFilter === 'pending_review' ? 'selected' : ''}>${i18n.bi(`بانتظار المراجعة والاعتماد (${pendingCount})`, `Pending Review (${pendingCount})`)}</option>
              <option value="draft" ${statusFilter === 'draft' ? 'selected' : ''}>${i18n.bi(`مسودة (${results.filter((r) => r.status === 'draft').length})`, `Draft (${results.filter((r) => r.status === 'draft').length})`)}</option>
              <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>${i18n.bi(`معتمدة نهائياً (${results.filter((r) => r.status === 'approved').length})`, `Approved (${results.filter((r) => r.status === 'approved').length})`)}</option>
            </select>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-center w-10">${i18n.bi('دمج', 'Select')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض والتقرير المجمع', 'Patient & Consolidated')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التحليل وحالة الكنترول', 'Test & QC')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النتيجة وفحص التغير التاريخي (Delta Check)', 'Values & Delta Check')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المعتمد / توثيق الطوارئ', 'Approval / Escalation')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filteredResults
                .map((r) => {
                  const pat = patMap.get(r.patientId);
                  const tst = tstMap.get(r.testId);
                  const req = reqMap.get(r.requestId);
                  const deltaAlerts = evaluateDeltaChecksForResult(r, results);
                  const critVals = getCriticalValuesFromResult(r);
                  const hasCritLog = critLogs.some((l) => l.resultId === r.id);
                  const lockedLots = qcLots.filter((l) => l.testId === r.testId && l.qcLocked);

                  const isChecked = selectedResultIds.has(r.id);
                  const isOtherPatientLocked = Boolean(selectedPatientId && selectedPatientId !== r.patientId);
                  const patResults = resultsByPatient.get(r.patientId) || [];
                  const patApprovedResults = patResults.filter((pr) => pr.status === 'approved');

                  return `
                    <tr class="hover:bg-slate-50 transition-colors ${
                      isChecked
                        ? 'bg-sky-50/90 ring-1 ring-inset ring-sky-300'
                        : r.status === 'pending_review'
                        ? 'bg-amber-50/30'
                        : ''
                    } ${isOtherPatientLocked ? 'opacity-60' : ''}">
                      <td class="py-2.5 px-3 text-center">
                        ${
                          r.status === 'approved'
                            ? `<input
                                type="checkbox"
                                data-select-res="${r.id}"
                                data-pat-id="${r.patientId}"
                                ${isChecked ? 'checked' : ''}
                                class="rev-select-chk w-4 h-4 rounded border-slate-300 accent-sky-600 cursor-pointer"
                                title="${i18n.bi('تحديد هذا التحليل المعتمد لطباعته ضمن تقرير مجمع للمريض', 'Select this approved test for consolidated printing')}"
                              />`
                            : `<span class="inline-block text-slate-400 text-xs cursor-not-allowed" title="${i18n.bi('لا يمكن اختيار التحليل للطباعة قبل اعتماده', 'Approve test first to enable printing')}">🔒</span>`
                        }
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(pat?.name || r.patientId)}</div>
                        <div class="text-[11px] font-mono text-slate-500">
                          ${escapeHtml(req?.requestNumber || r.requestId)} · ${escapeHtml(pat?.phone || '')}
                        </div>
                        ${
                          patApprovedResults.length > 0
                            ? `<div class="flex flex-wrap items-center gap-1 mt-1.5">
                                <button
                                  type="button"
                                  data-select-pat="${r.patientId}"
                                  class="rev-select-pat-btn rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 hover:bg-sky-100 cursor-pointer"
                                >
                                  ☑ ${i18n.bi(`تحديد المعتمدة للمريض (${patApprovedResults.length})`, `Select Approved (${patApprovedResults.length})`)}
                                </button>
                                ${
                                  canPrint
                                    ? `<button
                                        type="button"
                                        data-print-pat-all="${r.patientId}"
                                        class="rev-print-pat-all-btn rounded bg-sky-700 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-sky-800 cursor-pointer"
                                        title="${i18n.bi('طباعة جميع تحاليل هذا المريض المعتمدة في تقرير واحد مباشرة', 'Print all approved tests for this patient in 1 report')}"
                                      >
                                        🖨️ ${i18n.bi('طباعة مجمعة', 'Print Approved')}
                                      </button>`
                                    : ''
                                }
                              </div>`
                            : ''
                        }
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="font-semibold text-slate-800">${escapeHtml(tst ? `${tst.code} — ${i18n.bi(tst.nameAr, tst.nameEn)}` : r.testId)}</div>
                        <div class="text-[10px] text-slate-500">${escapeHtml(tst?.department || '')}</div>
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
                          ${
                            r.status === 'approved'
                              ? `
                                <button type="button" data-smart="${r.id}" class="rev-smart-btn rounded bg-indigo-600 px-2.5 py-1 text-[11px] text-white font-bold hover:bg-indigo-500 cursor-pointer">
                                  📱 ${i18n.bi('تقرير ذكي + QR', 'Smart QR & Trend')}
                                </button>
                                <button type="button" data-wa="${r.id}" class="rev-wa-btn rounded bg-emerald-700 px-2.5 py-1 text-[11px] text-white font-bold hover:bg-emerald-600 cursor-pointer">
                                  💬 واتساب
                                </button>
                                ${
                                  canPrint
                                    ? `<button type="button" data-prt="${r.id}" class="rev-prt-btn rounded border border-sky-600 px-2 py-1 text-[11px] text-sky-700 font-bold hover:bg-sky-50 cursor-pointer">🖨️ A4</button>`
                                    : ''
                                }
                              `
                              : `<span class="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-400" title="${i18n.bi('الطباعة متاحة فقط بعد اعتماد النتيجة', 'Printing is available only after approval')}">🔒 ${i18n.bi('الطباعة بعد الاعتماد', 'Approve to Print')}</span>`
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

    // Search & Status Filter Listeners
    const searchInputEl = document.getElementById('rev-search-input') as HTMLInputElement | null;
    searchInputEl?.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      const pos = searchInputEl.selectionStart || searchQuery.length;
      renderView();
      const nextInput = document.getElementById('rev-search-input') as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(pos, pos);
      }
    });

    const statusSelectEl = document.getElementById('rev-status-filter') as HTMLSelectElement | null;
    statusSelectEl?.addEventListener('change', () => {
      statusFilter = statusSelectEl.value;
      renderView();
    });

    // Multi-Test Selection Checkboxes with Smart Patient Lock Guard
    document.querySelectorAll<HTMLInputElement>('.rev-select-chk').forEach((chk) => {
      chk.addEventListener('change', () => {
        const resId = chk.getAttribute('data-select-res');
        const patId = chk.getAttribute('data-pat-id');
        if (!resId || !patId) return;

        if (chk.checked) {
          if (selectedPatientId && selectedPatientId !== patId) {
            chk.checked = false;
            const currentPatName = patMap.get(selectedPatientId)?.name || selectedPatientId;
            showToast(
              i18n.bi(
                `⚠️ لا يمكن دمج تحاليل مريضين مختلفين في تقرير واحد. التحديد الحالي خاص بالمريض (${currentPatName}). اضغط (إلغاء التحديد) أولاً أو (تحديد تحاليل المريض).`,
                `⚠️ Cannot combine two different patients in one report. Current selection is locked to (${currentPatName}).`
              ),
              'warning'
            );
            return;
          }
          selectedPatientId = patId;
          selectedResultIds.add(resId);
        } else {
          selectedResultIds.delete(resId);
          syncSelectedPatientLock();
        }
        renderView();
      });
    });

    // Unselect single chip from Consolidated Bar
    document.querySelectorAll<HTMLButtonElement>('.rev-unselect-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const resId = btn.getAttribute('data-unselect-res');
        if (resId) {
          selectedResultIds.delete(resId);
          syncSelectedPatientLock();
          renderView();
        }
      });
    });

    // Select all approved tests for a specific patient
    document.querySelectorAll<HTMLButtonElement>('.rev-select-pat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const patId = btn.getAttribute('data-select-pat');
        if (!patId) return;
        const patResults = resultsByPatient.get(patId) || [];
        const approvedOnly = patResults.filter((r) => r.status === 'approved');
        if (approvedOnly.length === 0) {
          showToast(
            i18n.bi(
              '⛔ لا توجد تحاليل معتمدة لهذا المريض حتى الآن. يرجى اعتماد التحاليل أولاً.',
              '⛔ No approved tests found for this patient. Please approve tests first.'
            ),
            'warning'
          );
          return;
        }

        selectedResultIds.clear();
        selectedPatientId = patId;
        for (const r of approvedOnly) {
          selectedResultIds.add(r.id);
        }
        const patName = patMap.get(patId)?.name || patId;
        showToast(
          i18n.bi(
            `✓ تم تحديد (${approvedOnly.length}) تحاليل معتمدة للمريض (${patName}) للطباعة في تقرير موحد`,
            `✓ Selected (${approvedOnly.length}) approved tests for (${patName}) for consolidated printing`
          ),
          'success'
        );
        renderView();
      });
    });

    // 1-Click Direct Print All Approved Tests for a Patient
    document.querySelectorAll<HTMLButtonElement>('.rev-print-pat-all-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const patId = btn.getAttribute('data-print-pat-all');
        if (!patId) return;
        const patResults = resultsByPatient.get(patId) || [];
        const approvedOnly = patResults.filter((r) => r.status === 'approved');
        if (approvedOnly.length === 0) {
          showToast(
            i18n.bi(
              '⛔ لا يمكن طباعة التقرير: لا توجد تحاليل معتمدة لهذا المريض حالياً.',
              '⛔ Cannot print report: No approved tests for this patient.'
            ),
            'warning'
          );
          return;
        }

        selectedResultIds.clear();
        selectedPatientId = patId;
        for (const r of approvedOnly) {
          selectedResultIds.add(r.id);
        }
        renderView();
        executeConsolidatedPrint(approvedOnly);
      });
    });

    // Consolidated Bar Controls
    document.getElementById('rev-pagebreak-dept-chk')?.addEventListener('change', (ev) => {
      pageBreakPerDepartment = (ev.target as HTMLInputElement).checked;
    });

    document.getElementById('rev-select-all-pat-approved')?.addEventListener('click', () => {
      if (!selectedPatientId) return;
      for (const r of activePatientApprovedResults) {
        selectedResultIds.add(r.id);
      }
      renderView();
    });

    document.getElementById('rev-clear-selection-btn')?.addEventListener('click', () => {
      selectedResultIds.clear();
      selectedPatientId = null;
      renderView();
    });

    document.getElementById('rev-consolidated-print-btn')?.addEventListener('click', () => {
      executeConsolidatedPrint(selectedResultsList);
    });

    document.getElementById('rev-consolidated-smart-btn')?.addEventListener('click', () => {
      if (selectedResultsList.length === 0) return;
      openConsolidatedSmartReportModal({
        results: selectedResultsList,
        patient: activePatient,
        testsMap: tstMap,
        allPatientResults: results,
        onPrintConsolidated: (splitByDept) => {
          executeConsolidatedPrint(selectedResultsList, splitByDept);
        },
      });
    });

    document.getElementById('rev-consolidated-wa-btn')?.addEventListener('click', () => {
      if (selectedResultsList.length === 0) return;
      const msg = buildConsolidatedWhatsAppMessage({
        patient: activePatient,
        results: selectedResultsList,
        testsMap: tstMap,
        requestsMap: reqMap,
      });
      openWhatsAppDispatchModal({
        recipientName: activePatient?.name || selectedPatientId || '',
        phone: activePatient?.phone || '01000000000',
        titleAr: `إرسال التقرير الطبي المجمّع (${selectedResultsList.length} تحاليل) عبر واتساب`,
        titleEn: `Send Consolidated Medical Report (${selectedResultsList.length} Tests) via WhatsApp`,
        messageBody: msg,
        referenceId: `CONSOLIDATED-${selectedPatientId || ''}`,
      });
    });

    document.getElementById('rev-crit-registry-btn')?.addEventListener('click', () => {
      openCriticalLogsHistoryModal();
    });

    document.getElementById('rev-print-list')?.addEventListener('click', () => {
      const approvedResults = results.filter((r) => r.status === 'approved');
      if (approvedResults.length === 0) {
        showToast(
          i18n.bi(
            '⛔ لا توجد نتائج معتمدة للطباعة حالياً — طباعة تقارير النتائج متاحة فقط للتحاليل المعتمدة.',
            '⛔ No approved results available to print — printing is restricted to approved results only.'
          ),
          'warning'
        );
        return;
      }
      const html = `
        <table class="print-table" dir="ltr" style="direction:ltr; text-align:left;">
          <thead><tr><th>Patient</th><th>Test</th><th>Status</th><th>Approved By</th><th>Approved At</th></tr></thead>
          <tbody>
            ${approvedResults.map((r) => `<tr><td>${patMap.get(r.patientId)?.nameEn || patMap.get(r.patientId)?.name || ''}</td><td>${tstMap.get(r.testId)?.nameEn || tstMap.get(r.testId)?.nameAr || ''}</td><td>${r.status}</td><td>${r.approvedBy || '-'}</td><td class="tabular-nums">${r.approvedAt || '-'}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      void printService.printA4('Approved Laboratory Results Summary Report', html, '', {
        forceEnglishLtr: true,
      });
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
          requestNumber: reqMap.get(target.requestId)?.requestNumber || target.requestId,
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
        executeConsolidatedPrint([target], false);
      });
    });
  };

  renderView();
}

