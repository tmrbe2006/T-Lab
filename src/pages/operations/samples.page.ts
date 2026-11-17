import { authService } from '../../auth/auth.service';
import { openCustomModal, showToast } from '../../components/common';
import { db } from '../../db/database';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { patientsRepository, requestsRepository } from '../../repositories';
import { ensureEnterpriseSeedData } from '../../services/enterprise-lab.service';
import type { SampleStatus } from '../../types';
import {
  LAB_TO_LAB_STATUS_LABELS,
  openDispatchSampleLabToLabModal,
  printLabToLabManifestA4,
} from './lab-to-lab.page';

export async function renderSamplesPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();
  const user = authService.getCurrentUser();
  let [samples, patients, requests, l2lDispatches] = await Promise.all([
    requestsRepository.getAllSamples(),
    patientsRepository.getAll(),
    requestsRepository.getAllRequests(),
    db.labToLabDispatches.toArray(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const reqMap = new Map(requests.map((r) => [r.id, r]));

  const getTodayIso = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const todayIso = getTodayIso();

  const getSampleDate = (s: (typeof samples)[0]): string => {
    const req = reqMap.get(s.requestId);
    const raw = s.receivedAt || req?.createdAt || todayIso;
    const match = String(raw).match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    return match ? match[1] : todayIso;
  };

  let dateFilter = todayIso; // تلقائياً يظهر عينات وطلبات اليوم الحالي
  let searchQuery = '';

  const reloadSamplesAndDispatches = async () => {
    [samples, l2lDispatches] = await Promise.all([
      requestsRepository.getAllSamples(),
      db.labToLabDispatches.toArray(),
    ]);
    renderView();
  };

  const renderView = () => {
    const canEdit = can(user, 'edit', 'samples');
    const canPrint = can(user, 'print', 'samples');
    const dispatchBySampleId = new Map(l2lDispatches.map((d) => [d.sampleId, d]));
    const todaySamplesCount = samples.filter((s) => getSampleDate(s) === todayIso).length;
    const filteredSamples = samples.filter((s) => {
      if (dateFilter && getSampleDate(s) !== dateFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const pat = patMap.get(s.patientId);
      const l2l = dispatchBySampleId.get(s.id);
      return (
        s.sampleCode.toLowerCase().includes(q) ||
        (pat?.name || '').toLowerCase().includes(q) ||
        s.sampleType.toLowerCase().includes(q) ||
        s.receivedAt.toLowerCase().includes(q) ||
        (l2l?.refLabName || '').toLowerCase().includes(q)
      );
    });

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.samples}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('استلام العينات، إرسال العينات للمعامل المرجعية المتعاقدة (Lab-to-Lab)، الفلترة التلقائية لعينات اليوم، وطباعة الباركود', 'Sample reception, Lab-to-Lab reference sample dispatch, automatic Today filter, and barcode printing')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              id="smp-new-l2l-btn"
              type="button"
              class="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer shadow-2xs"
            >
              🚚 ${i18n.bi('إرسال عينة Lab-to-Lab', 'Dispatch Sample (Lab-to-Lab)')}
            </button>
            <a
              href="#/labToLab"
              class="rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100"
            >
              🏥 ${i18n.bi(`حافظات Lab-to-Lab (${l2lDispatches.length})`, `Lab-to-Lab Hub (${l2lDispatches.length})`)}
            </a>
            ${canPrint ? `<button id="smp-print-list" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl bg-white border border-slate-200 p-3 items-center">
          <div class="sm:col-span-6">
            <input
              id="smp-search-input"
              type="search"
              value="${searchQuery}"
              placeholder="${i18n.bi('🔍 ابحث بكود العينة أو اسم المريض أو نوع الأنبوبة أو المعمل المرجعي...', '🔍 Search by sample code, patient name, tube, or reference lab...')}"
              class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            />
          </div>
          <div class="sm:col-span-6 flex flex-wrap items-center justify-end gap-2">
            <label class="text-xs font-bold text-slate-700">📅 ${i18n.bi('فلتر بالتاريخ:', 'Date Filter:')}</label>
            <input
              id="smp-date-filter"
              type="date"
              value="${dateFilter}"
              class="rounded-lg border border-sky-300 bg-sky-50/50 px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            />
            <button
              id="smp-date-today-btn"
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                dateFilter === todayIso
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
              }"
            >
              📅 ${i18n.bi(`عينات اليوم (${todaySamplesCount})`, `Today (${todaySamplesCount})`)}
            </button>
            <button
              id="smp-date-all-btn"
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                dateFilter === ''
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              📋 ${i18n.bi(`كل التواريخ (${samples.length})`, `All Dates (${samples.length})`)}
            </button>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('كود العينة', 'Sample Code')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('نوع العينة / الأنبوبة', 'Sample / Tube')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('وقت الاستلام / المستلم', 'Received At / By')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الحالة / إرسال Lab-to-Lab', 'Status / Lab-to-Lab')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${
                filteredSamples.length > 0
                  ? filteredSamples
                      .map((s) => {
                        const pat = patMap.get(s.patientId);
                        const l2l = dispatchBySampleId.get(s.id);
                        const l2lStatusMeta = l2l ? LAB_TO_LAB_STATUS_LABELS[l2l.status] : null;
                        return `
                          <tr class="hover:bg-slate-50">
                            <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${s.sampleCode}</td>
                            <td class="py-2.5 px-3 font-bold text-slate-800">${pat?.name || s.patientId}</td>
                            <td class="py-2.5 px-3 text-slate-600">${s.sampleType} · ${s.tubeType}</td>
                            <td class="py-2.5 px-3 font-mono text-slate-500 tabular-nums">${s.receivedAt} (${s.receivedBy})</td>
                            <td class="py-2.5 px-3">
                              <span class="font-semibold ${s.status === 'received' ? 'text-emerald-700' : 'text-rose-700'}">
                                ${i18n.dict.statuses[s.status] || s.status}
                              </span>
                              ${s.rejectionReason ? `<div class="text-[11px] text-rose-600">${s.rejectionReason}</div>` : ''}
                              ${
                                l2l
                                  ? `<div class="mt-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2 py-1 text-[11px]">
                                      <div class="font-bold text-indigo-950">🚚 Lab-to-Lab: ${l2l.refLabName}</div>
                                      <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
                                        <span class="rounded border px-1.5 py-0.2 text-[10px] font-bold ${l2lStatusMeta?.badgeClass || ''}">${l2lStatusMeta?.ar || l2l.status}</span>
                                        <span class="font-mono text-[10px] text-slate-600">(${l2l.manifestNumber})</span>
                                      </div>
                                    </div>`
                                  : ''
                              }
                            </td>
                            <td class="py-2.5 px-3">
                              <div class="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  data-l2l-sample="${s.id}"
                                  class="smp-l2l-btn rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 cursor-pointer"
                                >
                                  🚚 ${l2l ? i18n.bi('تحديث Lab-to-Lab', 'Update Lab-to-Lab') : i18n.bi('إرسال Lab-to-Lab', 'Send Lab-to-Lab')}
                                </button>
                                ${
                                  l2l
                                    ? `<button
                                        type="button"
                                        data-l2l-manifest="${l2l.id}"
                                        class="smp-l2l-print-btn rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-100 cursor-pointer"
                                      >
                                        🖨️ حافظة A4
                                      </button>`
                                    : ''
                                }
                                <button type="button" data-bc="${s.id}" class="smp-bc-btn text-indigo-700 hover:underline font-semibold cursor-pointer">
                                  ${i18n.dict.actions.printBarcode}
                                </button>
                                <button type="button" data-th="${s.id}" class="smp-th-btn text-emerald-700 hover:underline font-semibold cursor-pointer">
                                  80mm
                                </button>
                                ${
                                  canEdit
                                    ? `<button type="button" data-status="${s.id}" class="smp-st-btn text-sky-700 hover:underline font-semibold cursor-pointer">
                                        ${i18n.bi('تحديث / رفض العينة', 'Update / Reject')}
                                      </button>`
                                    : ''
                                }
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
                  : `
                    <tr>
                      <td colspan="6" class="py-8 text-center text-slate-500">
                        <div class="font-bold text-slate-700 mb-1">${
                          dateFilter
                            ? i18n.bi(`لا توجد عينات مستلمة في تاريخ (${dateFilter})`, `No samples found for date (${dateFilter})`)
                            : i18n.bi('لا توجد عينات مطابقة', 'No matching samples')
                        }</div>
                        ${
                          dateFilter && samples.length > 0
                            ? `<button id="smp-empty-show-all-btn" type="button" class="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                                📋 ${i18n.bi(`عرض جميع العينات من كل التواريخ (${samples.length})`, `Show All Dates (${samples.length})`)}
                              </button>`
                            : ''
                        }
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    const smpSearchEl = document.getElementById('smp-search-input') as HTMLInputElement | null;
    smpSearchEl?.addEventListener('input', () => {
      searchQuery = smpSearchEl.value;
      renderView();
    });

    const smpDateEl = document.getElementById('smp-date-filter') as HTMLInputElement | null;
    smpDateEl?.addEventListener('change', () => {
      dateFilter = smpDateEl.value;
      renderView();
    });

    document.getElementById('smp-date-today-btn')?.addEventListener('click', () => {
      dateFilter = todayIso;
      renderView();
    });

    document.getElementById('smp-date-all-btn')?.addEventListener('click', () => {
      dateFilter = '';
      renderView();
    });

    document.getElementById('smp-empty-show-all-btn')?.addEventListener('click', () => {
      dateFilter = '';
      renderView();
    });

    document.getElementById('smp-new-l2l-btn')?.addEventListener('click', () => {
      openDispatchSampleLabToLabModal({
        onSaved: reloadSamplesAndDispatches,
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.smp-l2l-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = samples.find((x) => x.id === btn.getAttribute('data-l2l-sample'));
        if (!s) return;
        const existingDispatch = dispatchBySampleId.get(s.id);
        openDispatchSampleLabToLabModal({
          preselectedSample: s,
          editingDispatch: existingDispatch,
          onSaved: reloadSamplesAndDispatches,
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.smp-l2l-print-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const l2lId = btn.getAttribute('data-l2l-manifest');
        const rec = l2lDispatches.find((x) => x.id === l2lId);
        if (rec) printLabToLabManifestA4(rec);
      });
    });

    document.getElementById('smp-print-list')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>Sample Code</th><th>Patient</th><th>Sample Type / Tube</th><th>Received At</th><th>Status</th></tr></thead>
          <tbody>
            ${samples.map((s) => `<tr><td class="tabular-nums">${s.sampleCode}</td><td>${patMap.get(s.patientId)?.name || ''}</td><td>${s.sampleType} (${s.tubeType})</td><td class="tabular-nums">${s.receivedAt}</td><td>${s.status}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.samples, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.smp-bc-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const s = samples.find((x) => x.id === btn.getAttribute('data-bc'));
        if (!s) return;
        const pat = patMap.get(s.patientId);
        const req = reqMap.get(s.requestId);
        await printService.printBarcodeLabel({
          barcode: req?.barcode || s.sampleCode,
          requestNumber: req?.requestNumber || s.sampleCode,
          patientName: pat?.name || s.patientId,
          date: s.receivedAt.slice(0, 10),
          sampleType: `${s.sampleType} (${s.tubeType})`,
          testsSummary: s.sampleCode,
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.smp-th-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const s = samples.find((x) => x.id === btn.getAttribute('data-th'));
        if (!s) return;
        const pat = patMap.get(s.patientId);
        await printService.printThermal80mm(
          i18n.bi('إيصال استلام عينة مختصر', 'Sample Reception Receipt'),
          `
            <div><strong>${i18n.bi('كود العينة:', 'Sample:')}</strong> ${s.sampleCode}</div>
            <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''}</div>
            <div><strong>${i18n.bi('العينة:', 'Type:')}</strong> ${s.sampleType} (${s.tubeType})</div>
            <div><strong>${i18n.bi('الحالة:', 'Status:')}</strong> ${i18n.dict.statuses[s.status] || s.status}</div>
            <div><strong>${i18n.bi('وقت الاستلام:', 'Time:')}</strong> ${s.receivedAt}</div>
          `,
          s.sampleCode
        );
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.smp-st-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = samples.find((x) => x.id === btn.getAttribute('data-status'));
        if (!s) return;
        openCustomModal(
          `${i18n.bi('تحديث حالة العينة:', 'Update Sample Status:')} ${s.sampleCode}`,
          `
            <form id="smp-form" class="space-y-4 text-xs">
              <div>
                <label class="block font-semibold mb-1">${i18n.dict.common.status}</label>
                <select name="status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="received" ${s.status === 'received' ? 'selected' : ''}>مستلمة وصالحة (Received)</option>
                  <option value="hemolyzed" ${s.status === 'hemolyzed' ? 'selected' : ''}>متحللة دمويا (Hemolyzed)</option>
                  <option value="insufficient" ${s.status === 'insufficient' ? 'selected' : ''}>غير كافية (Insufficient)</option>
                  <option value="wrong_sample" ${s.status === 'wrong_sample' ? 'selected' : ''}>أنبوبة خاطئة (Wrong Tube)</option>
                  <option value="recollection_needed" ${s.status === 'recollection_needed' ? 'selected' : ''}>تحتاج إعادة سحب (Recollection Needed)</option>
                  <option value="rejected" ${s.status === 'rejected' ? 'selected' : ''}>مرفوضة نهائيا (Rejected)</option>
                </select>
              </div>
              <div>
                <label class="block font-semibold mb-1">${i18n.bi('سبب الرفض أو الملاحظة الفنية', 'Rejection Reason / QC Note')}</label>
                <input name="rejectionReason" value="${s.rejectionReason || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div class="flex justify-end">
                <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">${i18n.dict.actions.save}</button>
              </div>
            </form>
          `,
          (close) => {
            const form = document.getElementById('smp-form') as HTMLFormElement | null;
            form?.addEventListener('submit', async (e) => {
              e.preventDefault();
              if (!(await enforcePermission('edit', 'samples'))) return;
              const fd = new FormData(form);
              s.status = (fd.get('status') as SampleStatus) || 'received';
              s.rejectionReason = String(fd.get('rejectionReason') || '').trim() || undefined;
              await requestsRepository.saveSample(s);
              await authService.logAudit(`تحديث حالة عينة ${s.sampleCode} إلى ${s.status}`, 'samples', s.id, s.rejectionReason || '');
              showToast(
                s.status === 'received'
                  ? i18n.bi('تم تأكيد استلام العينة', 'Sample marked received')
                  : i18n.bi(`تم تسجيل رفض/ملاحظة العينة: ${s.sampleCode}`, `Sample ${s.sampleCode} updated`),
                s.status === 'received' ? 'success' : 'warning'
              );
              close();
              samples = await requestsRepository.getAllSamples();
              renderView();
            });
          }
        );
      });
    });
  };

  renderView();
}
