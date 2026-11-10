import { authService } from '../../auth/auth.service';
import { openCustomModal, showToast } from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { patientsRepository, requestsRepository } from '../../repositories';
import type { SampleStatus } from '../../types';

export async function renderSamplesPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [samples, patients, requests] = await Promise.all([
    requestsRepository.getAllSamples(),
    patientsRepository.getAll(),
    requestsRepository.getAllRequests(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const reqMap = new Map(requests.map((r) => [r.id, r]));

  const renderView = () => {
    const canEdit = can(user, 'edit', 'samples');
    const canPrint = can(user, 'print', 'samples');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.samples}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('استلام العينات، فحص الصلاحية، تسجيل أسباب الرفض، وطباعة ملصقات الباركود وإيصالات الاستلام', 'Sample reception, quality inspection, rejection logging, and barcode label printing')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="smp-print-list" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
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
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${samples
                .map((s) => {
                  const pat = patMap.get(s.patientId);
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
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-2">
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
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

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
