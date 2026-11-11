import { authService } from '../../auth/auth.service';
import {
  closeModal,
  escapeHtml,
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

export async function renderQualityControlPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();

  let selectedLotId = '';

  const render = async () => {
    const [lots, allRuns, tests] = await Promise.all([
      db.qcControlLots.toArray(),
      db.qcRuns.toArray(),
      db.tests.toArray(),
    ]);

    if (!selectedLotId && lots.length > 0) {
      selectedLotId = lots[0].id;
    }

    const activeLot = lots.find((l) => l.id === selectedLotId) || lots[0];
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
          'متابعة محاليل الكنترول القياسية (Level 1 / Level 2 / Level 3)، تطبيق قواعد Westgard الإحصائية تلقائياً (1_2s, 1_3s, 2_2s, R_4s, 4_1s)، وإيقاف اعتماد التحليل عند خروج الجهاز عن المعايرة',
          'Daily control lot monitoring, interactive Levey-Jennings charting, automated Westgard multi-rule evaluation, and analyzer QC lock enforcement'
        ),
        `
          <div class="flex flex-wrap gap-2">
            <button id="qc-new-lot-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
              + ${i18n.bi('تعريف تشغيلة كنترول جديدة (Lot)', 'New Control Lot')}
            </button>
            <button id="qc-add-run-btn" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              🧪 ${i18n.bi('إدخال قراءة كنترول يومية (New QC Run)', 'Enter Daily QC Run')}
            </button>
          </div>
        `
      )}

      <!-- KPI Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div class="text-xs font-semibold text-slate-500">${i18n.bi('تشغيلات الكنترول الفعالة', 'Active Control Lots')}</div>
          <div class="text-2xl font-extrabold text-slate-900 mt-1">${lots.length}</div>
          <div class="text-[11px] text-sky-600 font-semibold mt-1">Sysmex / Roche Cobas</div>
        </div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-emerald-800">${i18n.bi('قراءات مطابقة للمواصفات (In-Control)', 'In-Control Runs')}</div>
          <div class="text-2xl font-extrabold text-emerald-700 mt-1">
            ${allRuns.filter((r) => r.status === 'accepted').length}
          </div>
          <div class="text-[11px] text-emerald-600 font-semibold mt-1">|Z-Score| < 2.0 SD</div>
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

      ${
        activeLot
          ? `
        <!-- Control Lot Selector & Levey-Jennings Chart Card -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 mb-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div class="flex flex-wrap items-center gap-3">
              <label class="text-xs font-extrabold text-slate-700">${i18n.bi('اختر محلول الكنترول / الجهاز:', 'Select Control Lot:')}</label>
              <select id="qc-lot-selector" class="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900">
                ${lots
                  .map(
                    (l) => `
                  <option value="${l.id}" ${l.id === activeLot.id ? 'selected' : ''}>
                    [${escapeHtml(l.lotNumber)}] ${escapeHtml(l.testNameEn)} — ${escapeHtml(l.level)} (${escapeHtml(l.analyzerName)})
                  </option>
                `
                  )
                  .join('')}
              </select>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <span class="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-mono font-bold">
                Target Mean: ${activeLot.targetMean} ${escapeHtml(activeLot.unit)} | SD: ±${activeLot.targetSd}
              </span>
              <button
                id="qc-toggle-lock-btn"
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
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                📊 ${i18n.bi('منحنى ليفي-جينينغز التفاعلي (Interactive Levey-Jennings Control Chart)', 'Interactive Levey-Jennings Control Chart (±1SD, ±2SD, ±3SD)')}
              </h4>
              <div class="flex items-center gap-3 text-[11px] font-bold">
                <span class="text-emerald-700">● In-Control (< 2SD)</span>
                <span class="text-amber-600">● 1_2s Warning (2SD - 3SD)</span>
                <span class="text-rose-600">● Westgard Violation (1_3s / 2_2s / R_4s)</span>
              </div>
            </div>
            ${generateLeveyJenningsSvg(activeLot, lotRuns)}
          </div>
        </div>

        <!-- Runs History Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h4 class="text-xs font-extrabold text-slate-800">
              📋 ${i18n.bi('سجل قراءات الكنترول اليومية وتقييم قواعد Westgard', 'Daily QC Run Log & Westgard Rule Evaluations')}
            </h4>
            <span class="text-xs text-slate-500">${lotRuns.length} ${i18n.bi('قراءة مسجلة', 'Runs')}</span>
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
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${lotRuns
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
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : ''
      }
    `;

    document.getElementById('qc-lot-selector')?.addEventListener('change', (e) => {
      selectedLotId = (e.target as HTMLSelectElement).value;
      render();
    });

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

    document.getElementById('qc-add-run-btn')?.addEventListener('click', async () => {
      if (!activeLot) return;
      if (!(await enforcePermission('add', 'qualityControl'))) return;
      openAddQcRunModal(activeLot, lotRuns, render);
    });

    document.getElementById('qc-new-lot-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('add', 'qualityControl'))) return;
      openNewLotModal(tests, (newId) => {
        selectedLotId = newId;
        render();
      });
    });
  };

  await render();
}

function openAddQcRunModal(
  lot: QcControlLot,
  existingRuns: QcRunRecord[],
  onSaved: () => void
): void {
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
      runDate: new Date().toISOString(),
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

    // Automatically lock or unlock the lot based on Westgard rejection
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

function openNewLotModal(
  tests: Array<{ id: string; code: string; nameAr: string; nameEn: string }>,
  onCreated: (id: string) => void
): void {
  openModal({
    title: i18n.bi('➕ تعريف تشغيلة كنترول قياسية جديدة (New QC Control Lot)', '➕ Define New QC Control Lot'),
    size: 'md',
    content: `
      <form id="new-qclot-form" class="space-y-3">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('رقم التشغيلة (Lot Number) *', 'Lot Number *')}</label>
          <input id="nql-lot" type="text" required value="CTRL-2025-${Math.floor(100 + Math.random() * 899)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('اسم الجهاز التحليلي *', 'Analyzer Name *')}</label>
          <input id="nql-analyzer" type="text" required value="Beckman Coulter AU480 Chemistry" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('التحليل المرتبط *', 'Linked Test *')}</label>
            <select id="nql-test" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${tests.map((t) => `<option value="${t.id}">${escapeHtml(t.code)} - ${escapeHtml(t.nameEn)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المستوى (Level) *', 'Control Level *')}</label>
            <select id="nql-level" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="Level 1 (Low)">Level 1 (Low)</option>
              <option value="Level 2 (Normal)" selected>Level 2 (Normal)</option>
              <option value="Level 3 (High)">Level 3 (High)</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المتوسط (Mean) *', 'Target Mean *')}</label>
            <input id="nql-mean" type="number" step="0.01" required value="100" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الانحراف (SD) *', 'Target SD *')}</label>
            <input id="nql-sd" type="number" step="0.01" required value="2.5" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الوحدة (Unit)', 'Unit')}</label>
            <input id="nql-unit" type="text" value="mg/dL" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
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

  document.getElementById('nql-cancel')?.addEventListener('click', closeModal);
  document.getElementById('new-qclot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const testId = (document.getElementById('nql-test') as HTMLSelectElement).value;
    const t = tests.find((x) => x.id === testId) || tests[0];
    const lot: QcControlLot = {
      id: generateId('QCLOT'),
      lotNumber: (document.getElementById('nql-lot') as HTMLInputElement).value.trim(),
      analyzerName: (document.getElementById('nql-analyzer') as HTMLInputElement).value.trim(),
      department: 'Clinical Chemistry',
      testId: t?.id || 'TST-1',
      testCode: t?.code || 'TEST',
      testNameAr: t?.nameAr || 'تحليل قياسي',
      testNameEn: t?.nameEn || 'Standard Control',
      unit: (document.getElementById('nql-unit') as HTMLInputElement).value.trim(),
      level: (document.getElementById('nql-level') as HTMLSelectElement).value as QcControlLot['level'],
      targetMean: parseFloat((document.getElementById('nql-mean') as HTMLInputElement).value) || 100,
      targetSd: parseFloat((document.getElementById('nql-sd') as HTMLInputElement).value) || 2.5,
      expiryDate: '2026-12-31',
      qcLocked: false,
      active: true,
    };

    await db.qcControlLots.put(lot);
    closeModal();
    showToast(i18n.bi('تم تعريف تشغيلة الكنترول بنجاح', 'Control lot created'), 'success');
    onCreated(lot.id);
  });
}
