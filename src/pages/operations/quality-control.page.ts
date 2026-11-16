import { authService } from '../../auth/auth.service';
import {
  closeModal,
  escapeHtml,
  openDeleteConfirmModal,
  openModal,
  renderPageHeader,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import {
  ensureEnterpriseSeedData,
  evaluateWestgardRules,
  generateLeveyJenningsSvg,
} from '../../services/enterprise-lab.service';
import type { QcControlLot, QcRunRecord } from '../../types';
import { formatDate, generateId } from '../../utils/format';

const ANALYZERS_STORAGE_KEY = 'tlab_qc_analyzers_v1';

const DEFAULT_ANALYZERS: string[] = [
  'Roche Cobas c311 Chemistry',
  'Roche Cobas e411 Immunoassay',
  'Sysmex XN-550 Hematology',
  'Beckman Coulter AU480 Chemistry',
  'Abbott Architect i1000SR',
  'Stago STA Compact Max Coagulation',
];

function getSavedAnalyzers(lots: QcControlLot[]): string[] {
  let list: string[] = [];
  try {
    const raw = localStorage.getItem(ANALYZERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed.filter((x) => typeof x === 'string' && x.trim().length > 0);
      }
    }
  } catch {
    // ignore
  }
  if (list.length === 0) {
    list = [...DEFAULT_ANALYZERS];
  }
  for (const l of lots) {
    if (l.analyzerName && !list.includes(l.analyzerName)) {
      list.push(l.analyzerName);
    }
  }
  return list;
}

function saveAnalyzersList(list: string[]): void {
  try {
    localStorage.setItem(ANALYZERS_STORAGE_KEY, JSON.stringify(Array.from(new Set(list))));
  } catch {
    // ignore
  }
}

async function recalculateLotRunsWestgard(lot: QcControlLot): Promise<void> {
  const runs = await db.qcRuns.where('lotId').equals(lot.id).toArray();
  const sortedAsc = [...runs].sort((a, b) => a.runDate.localeCompare(b.runDate));
  const updated: QcRunRecord[] = [];

  for (let i = 0; i < sortedAsc.length; i++) {
    const cur = sortedAsc[i];
    const prev = sortedAsc.slice(0, i);
    const evalRes = evaluateWestgardRules(cur.measuredValue, lot.targetMean, lot.targetSd, prev);
    const nextRun: QcRunRecord = {
      ...cur,
      lotNumber: lot.lotNumber,
      testId: lot.testId,
      testCode: lot.testCode,
      testNameEn: lot.testNameEn,
      analyzerName: lot.analyzerName,
      level: lot.level,
      targetMean: lot.targetMean,
      targetSd: lot.targetSd,
      zScore: evalRes.zScore,
      westgardRule: evalRes.rule,
      status: evalRes.status,
    };
    sortedAsc[i] = nextRun;
    updated.push(nextRun);
  }

  if (updated.length > 0) {
    await db.qcRuns.bulkPut(updated);
  }
}

export async function renderQualityControlPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();

  let selectedLotId = '';
  let selectedAnalyzerFilter = 'all';

  const render = async () => {
    const [lots, allRuns, tests] = await Promise.all([
      db.qcControlLots.toArray(),
      db.qcRuns.toArray(),
      db.tests.toArray(),
    ]);

    const analyzers = getSavedAnalyzers(lots);

    const filteredLots =
      selectedAnalyzerFilter === 'all'
        ? lots
        : lots.filter((l) => l.analyzerName === selectedAnalyzerFilter);

    if ((!selectedLotId || !filteredLots.some((l) => l.id === selectedLotId)) && filteredLots.length > 0) {
      selectedLotId = filteredLots[0].id;
    }

    const activeLot = filteredLots.find((l) => l.id === selectedLotId) || filteredLots[0] || lots[0];
    const lotRuns = allRuns
      .filter((r) => r.lotId === activeLot?.id)
      .sort((a, b) => b.runDate.localeCompare(a.runDate));

    const rejectedCount = allRuns.filter((r) => r.status === 'rejected').length;
    const lockedLotsCount = lots.filter((l) => l.qcLocked).length;

    container.innerHTML = `
      ${renderPageHeader(
        i18n.bi(
          '📈 لوحة رقابة الجودة اليومية ومنحنيات (Levey-Jennings & Westgard Rules)',
          '📈 Internal Quality Control (IQC), Levey-Jennings Charts & Westgard Multi-Rules'
        ),
        i18n.bi(
          'إدارة الأجهزة التحليلية ومحاليل الكنترول القياسية (Level 1 / Level 2 / Level 3)، وتعديل أو حذف نقاط القراءات على منحنى Levey-Jennings',
          'Manage analyzers, control lots, interactive Levey-Jennings chart points, and Westgard multi-rule evaluations'
        ),
        `
          <div class="flex flex-wrap gap-2">
            <button id="qc-manage-analyzers-btn" type="button" class="rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100 cursor-pointer">
              ⚙️ ${i18n.bi('إدارة الأجهزة التحليلية (إضافة / تعديل / حذف)', 'Manage Analyzers (Add / Edit / Delete)')}
            </button>
            <button id="qc-new-lot-btn" type="button" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              + ${i18n.bi('إضافة كنترول جديد (Lot)', 'New Control Lot')}
            </button>
            <button id="qc-add-run-btn" type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              🧪 ${i18n.bi('إدخال قراءة كنترول يومية (New QC Run)', 'Enter Daily QC Run')}
            </button>
          </div>
        `
      )}

      <!-- KPI Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div class="text-xs font-semibold text-slate-500">${i18n.bi('الأجهزة وتشغيلات الكنترول الفعالة', 'Analyzers & Active Control Lots')}</div>
          <div class="text-2xl font-extrabold text-slate-900 mt-1">${lots.length} <span class="text-xs font-semibold text-slate-500">(${analyzers.length} ${i18n.bi('جهاز', 'Analyzers')})</span></div>
          <div class="text-[11px] text-sky-600 font-semibold mt-1">${escapeHtml(analyzers.slice(0, 2).join(' / '))}</div>
        </div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-emerald-800">${i18n.bi('قراءات مطابقة للمواصفات (In-Control)', 'In-Control Runs')}</div>
          <div class="text-2xl font-extrabold text-emerald-700 mt-1">
            ${allRuns.filter((r) => r.status === 'accepted').length}
          </div>
          <div class="text-[11px] text-emerald-600 font-semibold mt-1">|Z-Score| &lt; 2.0 SD</div>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-amber-800">${i18n.bi('خروقات قواعد Westgard (1_3s / 2_2s)', 'Westgard Rule Violations')}</div>
          <div class="text-2xl font-extrabold text-amber-700 mt-1">${rejectedCount}</div>
          <div class="text-[11px] text-amber-700 font-semibold mt-1">${i18n.bi('تتطلب إجراء تصحيحي CAPA', 'Requires CAPA Log')}</div>
        </div>
        <div class="rounded-xl border ${lockedLotsCount > 0 ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'} p-4 shadow-2xs">
          <div class="text-xs font-semibold ${lockedLotsCount > 0 ? 'text-rose-800' : 'text-slate-500'}">
            ${i18n.bi('حالة قفل الاعتماد (QC Lock Status)', 'Analyzer QC Lock Status')}
          </div>
          <div class="text-xl font-extrabold ${lockedLotsCount > 0 ? 'text-rose-700' : 'text-emerald-700'} mt-1">
            ${
              lockedLotsCount > 0
                ? `🔒 ${lockedLotsCount} ${i18n.bi('تحليل موقوف مؤقتاً', 'Locked Tests')}`
                : `✅ ${i18n.bi('جميع الأجهزة معايرة ومتاحة', 'All Analyzers Calibrated')}`
            }
          </div>
        </div>
      </div>

      <!-- Analyzers & Control Lot Selector Bar -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 mb-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div class="flex flex-wrap items-center gap-2.5">
            <label class="text-xs font-extrabold text-slate-700">${i18n.bi('الجهاز التحليلي:', 'Analyzer:')}</label>
            <select id="qc-analyzer-filter" class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900">
              <option value="all" ${selectedAnalyzerFilter === 'all' ? 'selected' : ''}>${i18n.bi(`كل الأجهزة (${analyzers.length})`, `All Analyzers (${analyzers.length})`)}</option>
              ${analyzers
                .map(
                  (an) => `<option value="${escapeHtml(an)}" ${selectedAnalyzerFilter === an ? 'selected' : ''}>${escapeHtml(an)}</option>`
                )
                .join('')}
            </select>
            <button id="qc-quick-add-analyzer" type="button" class="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 cursor-pointer" title="${i18n.bi('إضافة جهاز جديد', 'Add Analyzer')}">
              + ${i18n.bi('إضافة جهاز', 'Add Analyzer')}
            </button>
            <button id="qc-quick-edit-analyzer" type="button" class="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 cursor-pointer" title="${i18n.bi('تعديل اسم الجهاز', 'Edit Analyzer')}">
              ✏️ ${i18n.bi('تعديل جهاز', 'Edit Analyzer')}
            </button>
            <button id="qc-quick-del-analyzer" type="button" class="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer" title="${i18n.bi('حذف جهاز مع رسالة تأكيد', 'Delete Analyzer')}">
              🗑️ ${i18n.bi('حذف جهاز', 'Delete Analyzer')}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs font-extrabold text-slate-700">${i18n.bi('اختر محلول الكنترول / الجهاز:', 'Select Control Lot:')}</label>
            <select id="qc-lot-selector" class="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900 max-w-md">
              ${(filteredLots.length > 0 ? filteredLots : lots)
                .map(
                  (l) => `
                <option value="${l.id}" ${activeLot && l.id === activeLot.id ? 'selected' : ''}>
                  [${escapeHtml(l.lotNumber)}] ${escapeHtml(l.testNameEn)} — ${escapeHtml(l.level)} (${escapeHtml(l.analyzerName)})
                </option>
              `
                )
                .join('')}
            </select>
            ${
              activeLot
                ? `
              <button id="qc-edit-lot-btn" type="button" class="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 cursor-pointer">
                ✏️ ${i18n.bi('تعديل الكنترول', 'Edit Control')}
              </button>
              <button id="qc-delete-lot-btn" type="button" class="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                🗑️ ${i18n.bi('حذف الكنترول', 'Delete Control')}
              </button>
            `
                : ''
            }
          </div>
        </div>

        ${
          activeLot
            ? `
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                Target Mean: ${activeLot.targetMean} ${escapeHtml(activeLot.unit)} | SD: ±${activeLot.targetSd}
              </span>
              <span class="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-800 text-xs font-semibold">
                🖥️ ${escapeHtml(activeLot.analyzerName)}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                id="qc-toggle-lock-btn"
                type="button"
                class="rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
                  activeLot.qcLocked
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-rose-600 text-white hover:bg-rose-500'
                }"
              >
                ${
                  activeLot.qcLocked
                    ? `🔓 ${i18n.bi('فك قفل التحليل بعد المعايرة (Unlock QC)', 'Unlock Analyzer QC')}`
                    : `🔒 ${i18n.bi('إيقاف اعتماد التحليل مؤقتاً (Activate QC Lock)', 'Lock Test Verification')}`
                }
              </button>
            </div>
          </div>

          ${
            activeLot.qcLocked
              ? `
            <div class="rounded-xl border-2 border-rose-500 bg-rose-50 p-3.5 text-xs text-rose-950 flex items-center justify-between gap-3">
              <div>
                <strong class="font-extrabold">🚨 ${i18n.bi('تحذير: هذا التحليل موقوف حالياً بسبب خروج الكنترول عن حدود Westgard (QC Locked)!', 'WARNING: Test verification is currently LOCKED due to Westgard QC failure!')}</strong>
                <p class="mt-0.5">${i18n.bi('سيظهر تحذير في شاشة مراجعة واعتماد النتائج لمنع اعتماد نتائج المرضى حتى يتم إعادة معايرة الجهاز وإدخال قراءة كنترول مقبولة.', 'Result approval screen will block/warn specialists until calibration and passing QC run are completed.')}</p>
              </div>
            </div>
          `
              : ''
          }

          <div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  📊 ${i18n.bi('منحنى ليفي-جينينغز التفاعلي (اضغط على أي نقطة في المنحنى لتعديلها أو حذفها)', 'Interactive Levey-Jennings Chart (Click any point on chart to Edit or Delete)')}
                </h4>
              </div>
              <div class="flex flex-wrap items-center gap-3 text-[11px] font-bold">
                <span class="text-emerald-700">● In-Control (&lt; 2SD)</span>
                <span class="text-amber-600">● 1_2s Warning (2SD - 3SD)</span>
                <span class="text-rose-600">● Westgard Violation (1_3s / 2_2s / R_4s)</span>
              </div>
            </div>
            <div id="qc-chart-wrapper">
              ${generateLeveyJenningsSvg(activeLot, lotRuns)}
            </div>
          </div>
        `
            : `<div class="py-8 text-center text-xs text-slate-400">${i18n.bi('لا توجد تشغيلات كنترول مسجلة حالياً. اضغط (+ إضافة كنترول جديد) للبدء.', 'No control lots found. Click (+ New Control Lot) to start.')}</div>`
        }
      </div>

      ${
        activeLot
          ? `
        <!-- Runs History Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-xs font-extrabold text-slate-800">
              📋 ${i18n.bi('سجل قراءات ونقاط الكنترول وتقييم قواعد Westgard (تعديل أو حذف أي نقطة)', 'Daily QC Run Log & Westgard Evaluations (Edit or Delete Any Point)')}
            </h4>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500 font-bold">${lotRuns.length} ${i18n.bi('قراءة مسجلة', 'Runs')}</span>
              ${
                lotRuns.length > 0
                  ? `<button id="qc-clear-old-runs-btn" type="button" class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                      🗑️ ${i18n.bi('حذف جميع قراءات هذا الكنترول القديمة', 'Delete All Runs for This Control')}
                    </button>`
                  : ''
              }
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-100 text-slate-700">
                <tr>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('التاريخ', 'Run Date')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('القراءة الفعلية', 'Measured Value')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('المتوسط والانحراف', 'Target Mean ± SD')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('معامل الانحراف (Z-Score)', 'Z-Score (SDI)')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('قاعدة Westgard', 'Westgard Rule')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('الإجراء التصحيحي (CAPA)', 'Corrective Action')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('الأخصائي', 'Operator')}</th>
                  <th class="px-4 py-2.5 text-start">${i18n.bi('إجراءات النقطة', 'Point Actions')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${
                  lotRuns.length === 0
                    ? `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">${i18n.bi('لا توجد قراءات مسجلة لهذا الكنترول بعد.', 'No QC runs recorded for this control lot yet.')}</td></tr>`
                    : lotRuns
                        .map((r) => {
                          const badgeCls =
                            r.status === 'accepted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'warning'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800';
                          const ruleLabel =
                            r.westgardRule === 'in_control'
                              ? 'In-Control (مقبول)'
                              : r.westgardRule === '1_2s'
                              ? '1_2s Warning (تحذير)'
                              : `${r.westgardRule} Violation (مرفوض - خطأ قياس)`;
                          return `
                            <tr class="hover:bg-slate-50">
                              <td class="px-4 py-2.5 font-mono text-slate-600">${escapeHtml(formatDate(r.runDate))}</td>
                              <td class="px-4 py-2.5 font-mono font-extrabold text-slate-900">${r.measuredValue} ${escapeHtml(activeLot.unit)}</td>
                              <td class="px-4 py-2.5 font-mono text-slate-500">${r.targetMean} ± ${r.targetSd}</td>
                              <td class="px-4 py-2.5 font-mono font-bold ${
                                Math.abs(r.zScore) >= 3
                                  ? 'text-rose-700'
                                  : Math.abs(r.zScore) >= 2
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }">
                                ${r.zScore > 0 ? `+${r.zScore}` : r.zScore} SD
                              </td>
                              <td class="px-4 py-2.5">
                                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badgeCls}">${escapeHtml(ruleLabel)}</span>
                              </td>
                              <td class="px-4 py-2.5 text-slate-600">${escapeHtml(r.correctiveAction || '-')}</td>
                              <td class="px-4 py-2.5 text-slate-600">${escapeHtml(r.operatorName)}</td>
                              <td class="px-4 py-2.5">
                                <div class="flex items-center gap-1.5">
                                  <button type="button" data-edit-run="${escapeHtml(r.id)}" class="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                                    ✏️ ${i18n.bi('تعديل', 'Edit')}
                                  </button>
                                  <button type="button" data-del-run="${escapeHtml(r.id)}" class="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                                    🗑️ ${i18n.bi('حذف', 'Delete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          `;
                        })
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `
          : ''
      }
    `;

    // Analyzer filter selector
    document.getElementById('qc-analyzer-filter')?.addEventListener('change', (e) => {
      selectedAnalyzerFilter = (e.target as HTMLSelectElement).value;
      render();
    });

    // Lot selector
    document.getElementById('qc-lot-selector')?.addEventListener('change', (e) => {
      selectedLotId = (e.target as HTMLSelectElement).value;
      render();
    });

    // Manage Analyzers modal button
    document.getElementById('qc-manage-analyzers-btn')?.addEventListener('click', () => {
      openManageAnalyzersModal(lots, render);
    });

    // Quick Add Analyzer
    document.getElementById('qc-quick-add-analyzer')?.addEventListener('click', () => {
      openAddOrEditAnalyzerModal(lots, undefined, (newAnalyzerName) => {
        selectedAnalyzerFilter = newAnalyzerName;
        render();
      });
    });

    // Quick Edit Analyzer
    document.getElementById('qc-quick-edit-analyzer')?.addEventListener('click', () => {
      const targetAnalyzer =
        selectedAnalyzerFilter !== 'all'
          ? selectedAnalyzerFilter
          : activeLot?.analyzerName || analyzers[0];
      if (!targetAnalyzer) return;
      openAddOrEditAnalyzerModal(lots, targetAnalyzer, (updatedName) => {
        if (selectedAnalyzerFilter !== 'all') {
          selectedAnalyzerFilter = updatedName;
        }
        render();
      });
    });

    // Quick Delete Analyzer with confirmation
    document.getElementById('qc-quick-del-analyzer')?.addEventListener('click', () => {
      const targetAnalyzer =
        selectedAnalyzerFilter !== 'all'
          ? selectedAnalyzerFilter
          : activeLot?.analyzerName || analyzers[0];
      if (!targetAnalyzer) return;
      openDeleteConfirmModal({
        recordLabel: `${i18n.bi('الجهاز التحليلي:', 'Analyzer:')} ${targetAnalyzer}`,
        onConfirm: async () => {
          const updatedList = analyzers.filter((a) => a !== targetAnalyzer);
          saveAnalyzersList(updatedList);
          // Also delete lots belonging to this analyzer if any
          const lotsToRemove = lots.filter((l) => l.analyzerName === targetAnalyzer);
          for (const l of lotsToRemove) {
            await db.qcRuns.where('lotId').equals(l.id).delete();
            await db.qcControlLots.delete(l.id);
          }
          selectedAnalyzerFilter = 'all';
          selectedLotId = '';
          showToast(
            i18n.bi('تم حذف الجهاز التحليلي بنجاح', 'Analyzer deleted successfully'),
            'success'
          );
          render();
        },
      });
    });

    // Toggle Lock
    document.getElementById('qc-toggle-lock-btn')?.addEventListener('click', async () => {
      if (!activeLot) return;
      if (!(await enforcePermission('edit', 'qualityControl'))) return;
      activeLot.qcLocked = !activeLot.qcLocked;
      await db.qcControlLots.put(activeLot);
      showToast(
        activeLot.qcLocked
          ? i18n.bi('تم تفعيل قفل الاعتماد لهذا التحليل لحين المعايرة', 'QC Lock activated for this test')
          : i18n.bi('تم فك قفل الاعتماد بعد نجاح المعايرة', 'QC Lock released'),
        activeLot.qcLocked ? 'info' : 'success'
      );
      render();
    });

    // New QC Run
    document.getElementById('qc-add-run-btn')?.addEventListener('click', async () => {
      if (!activeLot) return;
      if (!(await enforcePermission('add', 'qualityControl'))) return;
      openAddQcRunModal(activeLot, lotRuns, render);
    });

    // New Lot
    document.getElementById('qc-new-lot-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('add', 'qualityControl'))) return;
      openLotFormModal(tests, analyzers, undefined, (newId) => {
        selectedLotId = newId;
        render();
      });
    });

    // Edit Current Lot
    document.getElementById('qc-edit-lot-btn')?.addEventListener('click', async () => {
      if (!activeLot) return;
      if (!(await enforcePermission('edit', 'qualityControl'))) return;
      openLotFormModal(tests, analyzers, activeLot, (id) => {
        selectedLotId = id;
        render();
      });
    });

    // Delete Current Lot with confirmation
    document.getElementById('qc-delete-lot-btn')?.addEventListener('click', async () => {
      if (!activeLot) return;
      if (!(await enforcePermission('delete', 'qualityControl'))) return;
      openDeleteConfirmModal({
        recordLabel: `[${activeLot.lotNumber}] ${activeLot.testNameEn} — ${activeLot.level} (${activeLot.analyzerName})`,
        onConfirm: async (reason) => {
          await db.qcRuns.where('lotId').equals(activeLot.id).delete();
          await db.qcControlLots.delete(activeLot.id);
          await authService.logAudit(
            `حذف تشغيلة كنترول: ${activeLot.lotNumber}`,
            'qualityControl',
            activeLot.id,
            reason || ''
          );
          selectedLotId = '';
          showToast(
            i18n.bi('تم حذف تشغيلة الكنترول وقراءاتها بنجاح', 'Control lot and its runs deleted'),
            'success'
          );
          render();
        },
      });
    });

    // Clear all old runs for current lot with confirmation
    document.getElementById('qc-clear-old-runs-btn')?.addEventListener('click', async () => {
      if (!activeLot) return;
      openDeleteConfirmModal({
        recordLabel: `${i18n.bi('جميع القراءات القديمة للكنترول', 'All runs for control')} [${activeLot.lotNumber}] (${lotRuns.length} ${i18n.bi('نقطة', 'points')})`,
        onConfirm: async (reason) => {
          await db.qcRuns.where('lotId').equals(activeLot.id).delete();
          activeLot.qcLocked = false;
          await db.qcControlLots.put(activeLot);
          await authService.logAudit(
            `مسح قراءات الكنترول القديمة: ${activeLot.lotNumber}`,
            'qualityControl',
            activeLot.id,
            reason || ''
          );
          showToast(
            i18n.bi('تم حذف القراءات القديمة لهذا الكنترول بنجاح', 'Old QC runs deleted successfully'),
            'success'
          );
          render();
        },
      });
    });

    // Click any point on the Levey-Jennings SVG chart to Edit or Delete that point
    container.querySelectorAll<SVGGElement>('[data-qc-point-id]').forEach((ptEl) => {
      ptEl.addEventListener('click', () => {
        if (!activeLot) return;
        const runId = ptEl.getAttribute('data-qc-point-id');
        const targetRun = lotRuns.find((r) => r.id === runId);
        if (targetRun) {
          openEditOrDeleteQcRunModal(activeLot, targetRun, render);
        }
      });
    });

    // Edit Run button in table
    container.querySelectorAll<HTMLButtonElement>('[data-edit-run]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!activeLot) return;
        const runId = btn.getAttribute('data-edit-run');
        const targetRun = lotRuns.find((r) => r.id === runId);
        if (targetRun) {
          openEditOrDeleteQcRunModal(activeLot, targetRun, render);
        }
      });
    });

    // Delete Run button in table with confirmation
    container.querySelectorAll<HTMLButtonElement>('[data-del-run]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!activeLot) return;
        const runId = btn.getAttribute('data-del-run');
        const targetRun = lotRuns.find((r) => r.id === runId);
        if (!targetRun) return;
        openDeleteConfirmModal({
          recordLabel: `${i18n.bi('نقطة كنترول بتاريخ', 'QC Point on')} ${formatDate(targetRun.runDate)} — ${i18n.bi('القيمة:', 'Value:')} ${targetRun.measuredValue} ${activeLot.unit}`,
          onConfirm: async (reason) => {
            await db.qcRuns.delete(targetRun.id);
            await recalculateLotRunsWestgard(activeLot);
            await authService.logAudit(
              `حذف نقطة كنترول: ${targetRun.measuredValue}`,
              'qualityControl',
              targetRun.id,
              reason || ''
            );
            showToast(
              i18n.bi('تم حذف نقطة الكنترول وتحديث المنحنى بنجاح', 'QC point deleted and chart updated'),
              'success'
            );
            render();
          },
        });
      });
    });
  };

  await render();
}

function openAddOrEditAnalyzerModal(
  lots: QcControlLot[],
  existingName: string | undefined,
  onDone: (savedName: string) => void
): void {
  const isEdit = Boolean(existingName);
  openModal({
    title: isEdit
      ? i18n.bi(`✏️ تعديل اسم الجهاز التحليلي: ${existingName}`, `✏️ Edit Analyzer: ${existingName}`)
      : i18n.bi('➕ إضافة جهاز تحليلي جديد للمعمل', '➕ Add New Laboratory Analyzer'),
    size: 'md',
    content: `
      <form id="qc-analyzer-single-form" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            ${i18n.bi('اسم الجهاز التحليلي والموديل *', 'Analyzer Name & Model *')}
          </label>
          <input
            id="qc-an-name-input"
            type="text"
            required
            value="${escapeHtml(existingName || '')}"
            placeholder="e.g., Mindray BS-240 Chemistry / Roche Cobas c311"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          />
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="qc-an-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
            💾 ${i18n.dict.actions.save}
          </button>
        </div>
      </form>
    `,
  });

  document.getElementById('qc-an-cancel')?.addEventListener('click', closeModal);
  document.getElementById('qc-analyzer-single-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = (document.getElementById('qc-an-name-input') as HTMLInputElement).value.trim();
    if (!newName) return;
    const analyzers = getSavedAnalyzers(lots);
    if (isEdit && existingName) {
      const updated = analyzers.map((a) => (a === existingName ? newName : a));
      saveAnalyzersList(updated);
      // Update any lots & runs using the old analyzer name
      const matchingLots = lots.filter((l) => l.analyzerName === existingName);
      for (const l of matchingLots) {
        l.analyzerName = newName;
        await db.qcControlLots.put(l);
      }
      const allRuns = await db.qcRuns.toArray();
      const matchingRuns = allRuns.filter((r) => r.analyzerName === existingName);
      for (const r of matchingRuns) {
        r.analyzerName = newName;
        await db.qcRuns.put(r);
      }
      showToast(i18n.bi('تم تعديل اسم الجهاز بنجاح', 'Analyzer updated'), 'success');
    } else {
      if (!analyzers.includes(newName)) {
        analyzers.push(newName);
        saveAnalyzersList(analyzers);
      }
      showToast(i18n.bi('تمت إضافة الجهاز التحليلي بنجاح', 'Analyzer added'), 'success');
    }
    closeModal();
    onDone(newName);
  });
}

function openManageAnalyzersModal(lots: QcControlLot[], onChanged: () => void): void {
  const renderModalContent = () => {
    const analyzers = getSavedAnalyzers(lots);
    openModal({
      title: i18n.bi('⚙️ إدارة الأجهزة التحليلية (إضافة / تعديل / حذف)', '⚙️ Manage Laboratory Analyzers'),
      size: 'lg',
      content: `
        <div class="space-y-4">
          <form id="qc-add-an-inline" class="flex items-center gap-2">
            <input
              id="qc-inline-an-input"
              type="text"
              required
              placeholder="${i18n.bi('اكتب اسم وموديل الجهاز الجديد (مثال: Mindray BS-240)...', 'Enter new analyzer name...')}"
              class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
            />
            <button type="submit" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              + ${i18n.bi('إضافة جهاز جديد', 'Add Analyzer')}
            </button>
          </form>

          <div class="rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-100 text-slate-700">
                <tr>
                  <th class="px-3 py-2 text-start">#</th>
                  <th class="px-3 py-2 text-start">${i18n.bi('اسم الجهاز التحليلي', 'Analyzer Name')}</th>
                  <th class="px-3 py-2 text-start">${i18n.bi('عدد الكنترولات المرتبطة', 'Linked Controls')}</th>
                  <th class="px-3 py-2 text-start">${i18n.dict.common.actions}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${analyzers
                  .map((an, idx) => {
                    const count = lots.filter((l) => l.analyzerName === an).length;
                    return `
                      <tr class="hover:bg-slate-50">
                        <td class="px-3 py-2 font-mono">${idx + 1}</td>
                        <td class="px-3 py-2 font-bold text-slate-900">${escapeHtml(an)}</td>
                        <td class="px-3 py-2 font-mono text-slate-600">${count}</td>
                        <td class="px-3 py-2">
                          <div class="flex items-center gap-2">
                            <button type="button" data-an-edit="${escapeHtml(an)}" class="text-sky-700 font-bold hover:underline cursor-pointer">✏️ ${i18n.dict.actions.edit}</button>
                            <button type="button" data-an-del="${escapeHtml(an)}" class="text-rose-600 font-bold hover:underline cursor-pointer">🗑️ ${i18n.dict.actions.delete}</button>
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
      `,
    });

    document.getElementById('qc-add-an-inline')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = (document.getElementById('qc-inline-an-input') as HTMLInputElement).value.trim();
      if (!val) return;
      const list = getSavedAnalyzers(lots);
      if (!list.includes(val)) {
        list.push(val);
        saveAnalyzersList(list);
      }
      showToast(i18n.bi('تمت إضافة الجهاز بنجاح', 'Analyzer added'), 'success');
      closeModal();
      onChanged();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-an-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const oldName = btn.getAttribute('data-an-edit') || '';
        closeModal();
        openAddOrEditAnalyzerModal(lots, oldName, () => onChanged());
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-an-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetName = btn.getAttribute('data-an-del') || '';
        closeModal();
        openDeleteConfirmModal({
          recordLabel: `${i18n.bi('الجهاز التحليلي:', 'Analyzer:')} ${targetName}`,
          onConfirm: async () => {
            const list = getSavedAnalyzers(lots).filter((x) => x !== targetName);
            saveAnalyzersList(list);
            const lotsToRemove = lots.filter((l) => l.analyzerName === targetName);
            for (const l of lotsToRemove) {
              await db.qcRuns.where('lotId').equals(l.id).delete();
              await db.qcControlLots.delete(l.id);
            }
            showToast(i18n.bi('تم حذف الجهاز بنجاح', 'Analyzer deleted'), 'success');
            onChanged();
          },
        });
      });
    });
  };

  renderModalContent();
}

function openAddQcRunModal(
  lot: QcControlLot,
  existingRuns: QcRunRecord[],
  onSaved: () => void
): void {
  const nowStr = new Date().toISOString().slice(0, 16);
  openModal({
    title: `${i18n.bi('🧪 إدخال قراءة كنترول يومية:', '🧪 Enter Daily QC Run:')} ${lot.testNameEn} (${lot.level})`,
    size: 'md',
    content: `
      <form id="qc-run-form" class="space-y-4">
        <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
          <div><strong>${i18n.bi('الجهاز:', 'Analyzer:')}</strong> ${escapeHtml(lot.analyzerName)}</div>
          <div><strong>${i18n.bi('رقم التشغيلة:', 'Lot Number:')}</strong> <span class="font-mono">${escapeHtml(lot.lotNumber)}</span></div>
          <div><strong>${i18n.bi('المتوسط المستهدف (Target Mean):', 'Target Mean:')}</strong> <span class="font-mono font-bold text-emerald-700">${lot.targetMean} ${escapeHtml(lot.unit)}</span> | <strong>SD:</strong> ±${lot.targetSd}</div>
          <div class="text-[11px] text-slate-500">
            ±2SD Range: ${(lot.targetMean - 2 * lot.targetSd).toFixed(2)} — ${(lot.targetMean + 2 * lot.targetSd).toFixed(2)} ${escapeHtml(lot.unit)}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              ${i18n.bi('القراءة الفعلية الناتجة من الجهاز *', 'Measured Control Value *')} (${escapeHtml(lot.unit)})
            </label>
            <input
              id="qc-measured-val"
              type="number"
              step="0.01"
              required
              value="${lot.targetMean}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-mono font-bold"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              ${i18n.bi('تاريخ ووقت القراءة', 'Run Date & Time')}
            </label>
            <input
              id="qc-run-date"
              type="datetime-local"
              value="${nowStr}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            ${i18n.bi('الإجراء التصحيحي المتخذ (في حالة حيود القراءة CAPA)', 'Corrective Action (CAPA if Out-of-Control)')}
          </label>
          <input
            id="qc-capa-input"
            type="text"
            placeholder="${i18n.bi('مثال: إعادة معايرة الكاشف / تغيير لمبة الفوتوميتر...', 'e.g., Recalibrated reagent lot, repeated control...')}"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="qc-run-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
            📈 ${i18n.bi('حفظ القراءة وتطبيق قواعد Westgard', 'Evaluate Westgard & Save Run')}
          </button>
        </div>
      </form>
    `,
  });

  document.getElementById('qc-run-cancel')?.addEventListener('click', closeModal);
  document.getElementById('qc-run-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = parseFloat((document.getElementById('qc-measured-val') as HTMLInputElement).value);
    const dateVal = (document.getElementById('qc-run-date') as HTMLInputElement).value;
    const capa = (document.getElementById('qc-capa-input') as HTMLInputElement).value.trim();
    if (Number.isNaN(val)) return;

    const sortedAsc = [...existingRuns].sort((a, b) => a.runDate.localeCompare(b.runDate));
    const evalRes = evaluateWestgardRules(val, lot.targetMean, lot.targetSd, sortedAsc);
    const user = authService.getCurrentUser();

    const newRun: QcRunRecord = {
      id: generateId('QCRUN'),
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      testId: lot.testId,
      testCode: lot.testCode,
      testNameEn: lot.testNameEn,
      analyzerName: lot.analyzerName,
      level: lot.level,
      runDate: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
      measuredValue: val,
      targetMean: lot.targetMean,
      targetSd: lot.targetSd,
      zScore: evalRes.zScore,
      westgardRule: evalRes.rule,
      status: evalRes.status,
      correctiveAction: capa || undefined,
      operatorName: user?.fullNameAr || 'Lab Chemist',
    };

    await db.qcRuns.put(newRun);

    if (evalRes.status === 'rejected') {
      lot.qcLocked = true;
      await db.qcControlLots.put(lot);
      showToast(
        i18n.bi(
          `🚨 خرق قاعدة Westgard (${evalRes.rule})! تم إيقاف اعتماد التحليل تلقائياً لحين إعادة المعايرة.`,
          `🚨 Westgard ${evalRes.rule} violation! Test verification locked automatically.`
        ),
        'error'
      );
    } else {
      if (lot.qcLocked && evalRes.status === 'accepted') {
        lot.qcLocked = false;
        await db.qcControlLots.put(lot);
      }
      showToast(
        i18n.bi(
          `تم تسجيل قراءة الكنترول بنجاح (Z-Score: ${evalRes.zScore} SD — ${evalRes.rule})`,
          `QC Run recorded (Z-Score: ${evalRes.zScore} SD — ${evalRes.rule})`
        ),
        'success'
      );
    }

    closeModal();
    onSaved();
  });
}

function openEditOrDeleteQcRunModal(
  lot: QcControlLot,
  run: QcRunRecord,
  onChanged: () => void
): void {
  const dateInputVal = run.runDate.slice(0, 16);
  openModal({
    title: i18n.bi(
      `📍 تعديل أو حذف نقطة الكنترول على المنحنى (${lot.testNameEn})`,
      `📍 Edit or Delete QC Chart Point (${lot.testNameEn})`
    ),
    size: 'md',
    content: `
      <form id="qc-edit-point-form" class="space-y-4">
        <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
          <div><strong>${i18n.bi('الكنترول / الجهاز:', 'Control / Analyzer:')}</strong> [${escapeHtml(lot.lotNumber)}] ${escapeHtml(lot.analyzerName)}</div>
          <div><strong>Target Mean:</strong> ${lot.targetMean} ${escapeHtml(lot.unit)} | <strong>SD:</strong> ±${lot.targetSd}</div>
          <div><strong>Current Z-Score:</strong> <span class="font-mono font-bold">${run.zScore} SD (${run.westgardRule})</span></div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              ${i18n.bi('القراءة الفعلية للنقطة *', 'Measured Point Value *')} (${escapeHtml(lot.unit)})
            </label>
            <input
              id="qcep-val"
              type="number"
              step="0.01"
              required
              value="${run.measuredValue}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-mono font-bold"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">
              ${i18n.bi('تاريخ ووقت النقطة', 'Point Date & Time')}
            </label>
            <input
              id="qcep-date"
              type="datetime-local"
              value="${escapeHtml(dateInputVal)}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">
            ${i18n.bi('الإجراء التصحيحي (CAPA)', 'Corrective Action (CAPA)')}
          </label>
          <input
            id="qcep-capa"
            type="text"
            value="${escapeHtml(run.correctiveAction || '')}"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            id="qcep-delete-btn"
            class="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
          >
            🗑️ ${i18n.bi('حذف هذه النقطة من المنحنى', 'Delete This Point')}
          </button>
          <div class="flex items-center gap-2">
            <button type="button" id="qcep-cancel-btn" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              💾 ${i18n.bi('حفظ التعديل وتحديث المنحنى', 'Save & Update Chart')}
            </button>
          </div>
        </div>
      </form>
    `,
  });

  document.getElementById('qcep-cancel-btn')?.addEventListener('click', closeModal);

  document.getElementById('qcep-delete-btn')?.addEventListener('click', () => {
    closeModal();
    openDeleteConfirmModal({
      recordLabel: `${i18n.bi('نقطة كنترول بتاريخ', 'QC Point on')} ${formatDate(run.runDate)} — ${i18n.bi('القيمة:', 'Value:')} ${run.measuredValue} ${lot.unit}`,
      onConfirm: async (reason) => {
        await db.qcRuns.delete(run.id);
        await recalculateLotRunsWestgard(lot);
        await authService.logAudit(
          `حذف نقطة كنترول من المنحنى: ${run.measuredValue}`,
          'qualityControl',
          run.id,
          reason || ''
        );
        showToast(
          i18n.bi('تم حذف النقطة من المنحنى بنجاح', 'Point deleted from chart'),
          'success'
        );
        onChanged();
      },
    });
  });

  document.getElementById('qc-edit-point-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newVal = parseFloat((document.getElementById('qcep-val') as HTMLInputElement).value);
    const newDate = (document.getElementById('qcep-date') as HTMLInputElement).value;
    const newCapa = (document.getElementById('qcep-capa') as HTMLInputElement).value.trim();
    if (Number.isNaN(newVal)) return;

    run.measuredValue = newVal;
    if (newDate) {
      run.runDate = new Date(newDate).toISOString();
    }
    run.correctiveAction = newCapa || undefined;

    await db.qcRuns.put(run);
    await recalculateLotRunsWestgard(lot);
    closeModal();
    showToast(
      i18n.bi('تم تعديل قيمة نقطة الكنترول وإعادة حساب المنحنى بنجاح', 'QC point updated and chart recalculated'),
      'success'
    );
    onChanged();
  });
}

function openLotFormModal(
  tests: Array<{ id: string; code: string; nameAr: string; nameEn: string }>,
  analyzers: string[],
  existingLot: QcControlLot | undefined,
  onSaved: (id: string) => void
): void {
  const isEdit = Boolean(existingLot);
  openModal({
    title: isEdit
      ? i18n.bi(`✏️ تعديل تشغيلة الكنترول (${existingLot?.lotNumber})`, `✏️ Edit QC Control Lot (${existingLot?.lotNumber})`)
      : i18n.bi('➕ تعريف تشغيلة كنترول قياسية جديدة (New QC Control Lot)', '➕ Define New QC Control Lot'),
    size: 'md',
    content: `
      <form id="qclot-form" class="space-y-3">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('رقم التشغيلة (Lot Number) *', 'Lot Number *')}</label>
          <input id="nql-lot" type="text" required value="${escapeHtml(existingLot?.lotNumber || `CTRL-2026-${Math.floor(100 + Math.random() * 899)}`)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('اسم الجهاز التحليلي *', 'Analyzer Name *')}</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select id="nql-analyzer-select" class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold">
              ${analyzers
                .map(
                  (a) => `<option value="${escapeHtml(a)}" ${existingLot?.analyzerName === a ? 'selected' : ''}>${escapeHtml(a)}</option>`
                )
                .join('')}
              <option value="__custom__">+ ${i18n.bi('كتابة اسم جهاز جديد...', 'Type custom analyzer...')}</option>
            </select>
            <input id="nql-analyzer" type="text" required value="${escapeHtml(existingLot?.analyzerName || analyzers[0] || 'Beckman Coulter AU480 Chemistry')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('التحليل المرتبط *', 'Linked Test *')}</label>
            <select id="nql-test" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${tests
                .map(
                  (t) => `<option value="${t.id}" ${existingLot?.testId === t.id ? 'selected' : ''}>${escapeHtml(t.code)} - ${escapeHtml(t.nameEn)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المستوى (Level) *', 'Control Level *')}</label>
            <select id="nql-level" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="Level 1 (Low)" ${existingLot?.level === 'Level 1 (Low)' ? 'selected' : ''}>Level 1 (Low)</option>
              <option value="Level 2 (Normal)" ${!existingLot || existingLot.level === 'Level 2 (Normal)' ? 'selected' : ''}>Level 2 (Normal)</option>
              <option value="Level 3 (High)" ${existingLot?.level === 'Level 3 (High)' ? 'selected' : ''}>Level 3 (High)</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المتوسط (Mean) *', 'Target Mean *')}</label>
            <input id="nql-mean" type="number" step="0.01" required value="${existingLot?.targetMean ?? 100}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الانحراف (SD) *', 'Target SD *')}</label>
            <input id="nql-sd" type="number" step="0.01" required value="${existingLot?.targetSd ?? 2.5}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الوحدة (Unit)', 'Unit')}</label>
            <input id="nql-unit" type="text" value="${escapeHtml(existingLot?.unit || 'mg/dL')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="nql-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
            💾 ${i18n.bi('حفظ تشغيلة الكنترول', 'Save Control Lot')}
          </button>
        </div>
      </form>
    `,
  });

  const anSelect = document.getElementById('nql-analyzer-select') as HTMLSelectElement | null;
  const anInput = document.getElementById('nql-analyzer') as HTMLInputElement | null;
  anSelect?.addEventListener('change', () => {
    if (!anInput) return;
    if (anSelect.value === '__custom__') {
      anInput.value = '';
      anInput.focus();
    } else {
      anInput.value = anSelect.value;
    }
  });

  document.getElementById('nql-cancel')?.addEventListener('click', closeModal);
  document.getElementById('qclot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const testId = (document.getElementById('nql-test') as HTMLSelectElement).value;
    const t = tests.find((x) => x.id === testId) || tests[0];
    const analyzerName = (document.getElementById('nql-analyzer') as HTMLInputElement).value.trim();

    if (analyzerName && !analyzers.includes(analyzerName)) {
      saveAnalyzersList([...analyzers, analyzerName]);
    }

    const lot: QcControlLot = {
      id: existingLot?.id || generateId('QCLOT'),
      lotNumber: (document.getElementById('nql-lot') as HTMLInputElement).value.trim(),
      analyzerName: analyzerName || 'Analyzer',
      department: existingLot?.department || 'Clinical Chemistry',
      testId: t?.id || 'TST-1',
      testCode: t?.code || 'TEST',
      testNameAr: t?.nameEn || t?.nameAr || 'Standard Control',
      testNameEn: t?.nameEn || 'Standard Control',
      unit: (document.getElementById('nql-unit') as HTMLInputElement).value.trim(),
      level: (document.getElementById('nql-level') as HTMLSelectElement).value as QcControlLot['level'],
      targetMean: parseFloat((document.getElementById('nql-mean') as HTMLInputElement).value) || 100,
      targetSd: parseFloat((document.getElementById('nql-sd') as HTMLInputElement).value) || 2.5,
      expiryDate: existingLot?.expiryDate || '2027-12-31',
      qcLocked: existingLot?.qcLocked ?? false,
      active: true,
    };

    await db.qcControlLots.put(lot);
    if (isEdit) {
      await recalculateLotRunsWestgard(lot);
    }
    closeModal();
    showToast(
      isEdit
        ? i18n.bi('تم تحديث بيانات الكنترول بنجاح', 'Control lot updated')
        : i18n.bi('تم تعريف تشغيلة الكنترول بنجاح', 'Control lot created'),
      'success'
    );
    onSaved(lot.id);
  });
}
