import { authService } from '../../auth/auth.service';
import { closeModal, openCustomModal, openDeleteConfirmModal, showToast } from '../../components/common';
import { db } from '../../db/database';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { patientsRepository, requestsRepository } from '../../repositories';
import { ensureEnterpriseSeedData } from '../../services/enterprise-lab.service';
import type {
  LabToLabDispatchRecord,
  LabToLabDispatchStatus,
  LabToLabTransportTemp,
  ReferenceLabPartner,
  Sample,
} from '../../types';

export const LAB_TO_LAB_STATUS_LABELS: Record<
  LabToLabDispatchStatus,
  { ar: string; en: string; badgeClass: string }
> = {
  prepared: {
    ar: 'قيد التجهيز للإرسال',
    en: 'Prepared for Dispatch',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  in_transit: {
    ar: 'أُرسلت مع المندوب للمعمل المرجعي',
    en: 'Dispatched / In Transit',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
  },
  received_by_ref_lab: {
    ar: 'تحت الفحص بالمعمل المرجعي',
    en: 'Received by Reference Lab',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
  result_received: {
    ar: 'تم استلام النتيجة من المعمل المرجعي',
    en: 'Result Received',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  rejected_by_ref_lab: {
    ar: 'مرفوضة من المعمل المرجعي',
    en: 'Rejected by Reference Lab',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
  },
};

export const LAB_TO_LAB_TEMP_LABELS: Record<LabToLabTransportTemp, { ar: string; en: string }> = {
  refrigerated_2_8: {
    ar: '❄️ مبردة في حافظة ثلج (2°C - 8°C)',
    en: '❄️ Refrigerated Ice-Box (2°C - 8°C)',
  },
  frozen_minus_20: {
    ar: '🧊 مجمدة (-20°C ثلج جاف)',
    en: '🧊 Frozen (-20°C Dry Ice)',
  },
  room_temp_15_25: {
    ar: '🌡️ درجة حرارة الغرفة (15°C - 25°C)',
    en: '🌡️ Room Temperature (15°C - 25°C)',
  },
};

export async function printLabToLabManifestA4(record: LabToLabDispatchRecord): Promise<void> {
  const statusMeta = LAB_TO_LAB_STATUS_LABELS[record.status] || LAB_TO_LAB_STATUS_LABELS.prepared;
  const tempMeta = LAB_TO_LAB_TEMP_LABELS[record.transportTemp] || LAB_TO_LAB_TEMP_LABELS.refrigerated_2_8;

  const html = `
    <div style="border:2px solid #0f172a;border-radius:10px;padding:14px;margin-bottom:14px;background:#f8fafc;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #cbd5e1;padding-bottom:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;">حافظة إرسال عينة لمعمل مرجعي (Lab-to-Lab Dispatch Manifest)</div>
          <div style="font-size:12px;color:#475569;">رقم الحافظة: <strong>${record.manifestNumber}</strong> · تاريخ الإرسال: <strong>${record.dispatchedAt}</strong></div>
        </div>
        <div style="font-family:monospace;font-size:14px;font-weight:800;padding:6px 12px;border:1px solid #0284c7;background:#e0f2fe;color:#0369a1;border-radius:6px;">
          ${record.sampleCode}
        </div>
      </div>

      <table class="print-table" style="margin-bottom:12px;">
        <tbody>
          <tr>
            <th style="width:22%;background:#f1f5f9;">المعمل المرجعي المرسل إليه</th>
            <td style="width:28%;font-weight:800;color:#0f172a;">${record.refLabName}</td>
            <th style="width:22%;background:#f1f5f9;">حالة الإرسال</th>
            <td style="width:28%;font-weight:700;">${statusMeta.ar}</td>
          </tr>
          <tr>
            <th style="background:#f1f5f9;">اسم المريض</th>
            <td style="font-weight:700;">${record.patientName}</td>
            <th style="background:#f1f5f9;">رقم الطلب / الكود</th>
            <td style="font-family:monospace;font-weight:700;">${record.requestNumber} (${record.sampleCode})</td>
          </tr>
          <tr>
            <th style="background:#f1f5f9;">نوع العينة والأنبوبة</th>
            <td>${record.sampleType} — ${record.tubeType}</td>
            <th style="background:#f1f5f9;">درجة حرارة النقل (Chain of Custody)</th>
            <td>${tempMeta.ar}</td>
          </tr>
          <tr>
            <th style="background:#f1f5f9;">التحاليل المطلوبة بالمعمل المرجعي</th>
            <td colspan="3" style="font-weight:800;color:#0369a1;">${record.testsSummary}</td>
          </tr>
          <tr>
            <th style="background:#f1f5f9;">اسم المندوب المستلم</th>
            <td>${record.courierName || '—'} (${record.courierPhone || '—'})</td>
            <th style="background:#f1f5f9;">تاريخ استلام النتيجة المتوقع</th>
            <td style="font-family:monospace;">${record.expectedResultDate}</td>
          </tr>
          <tr>
            <th style="background:#f1f5f9;">تكلفة التعاقد (B2B Cost)</th>
            <td style="font-family:monospace;font-weight:700;">${record.b2bCost.toLocaleString()} EGP</td>
            <th style="background:#f1f5f9;">ملاحظات فنية وإكلينيكية</th>
            <td>${record.notes || '—'}</td>
          </tr>
          ${
            record.externalResultSummary
              ? `
                <tr>
                  <th style="background:#ecfdf5;color:#065f46;">النتيجة الواردة من المعمل المرجعي</th>
                  <td colspan="3" style="font-weight:800;color:#065f46;">
                    ${record.externalResultSummary}
                    ${record.externalRefNumber ? ` (كود المرجع الخارجي: ${record.externalRefNumber})` : ''}
                  </td>
                </tr>
              `
              : ''
          }
        </tbody>
      </table>

      <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:12px;border-top:1px dashed #94a3b8;font-size:12px;">
        <div>توقيع مسؤول المعمل المرسل: _______________________ (${record.createdBy})</div>
        <div>توقيع مندوب النقل (Courier): _______________________</div>
        <div>ختم استلام المعمل المرجعي: _______________________</div>
      </div>
    </div>
  `;

  await printService.printA4(
    i18n.bi(
      `حافظة إرسال عينة لمعمل مرجعي — ${record.manifestNumber}`,
      `Lab-to-Lab Dispatch Manifest — ${record.manifestNumber}`
    ),
    html
  );
}

export async function openDispatchSampleLabToLabModal(options: {
  preselectedSample?: Sample;
  editingDispatch?: LabToLabDispatchRecord;
  onSaved?: () => Promise<void> | void;
}): Promise<void> {
  await ensureEnterpriseSeedData();
  const user = authService.getCurrentUser();
  const [samples, patients, requests, allTests, refLabs] = await Promise.all([
    requestsRepository.getAllSamples(),
    patientsRepository.getAll(),
    requestsRepository.getAllRequests(),
    db.tests.toArray(),
    db.referenceLabPartners.toArray(),
  ]);

  const patMap = new Map(patients.map((p) => [p.id, p]));
  const reqMap = new Map(requests.map((r) => [r.id, r]));
  const testMap = new Map(allTests.map((t) => [t.id, t]));

  const todayIso = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const existing = options.editingDispatch;
  const sample =
    options.preselectedSample ||
    (existing ? samples.find((s) => s.id === existing.sampleId) : samples[0]);

  const resolveSampleTestsSummary = async (smp?: Sample): Promise<{ summary: string; totalPrice: number }> => {
    if (!smp) return { summary: 'الفحوصات المرسلة للمعمل المرجعي', totalPrice: 400 };
    const reqItems = await db.requestItems.where('requestId').equals(smp.requestId).toArray();
    if (reqItems.length === 0) {
      return { summary: `${smp.sampleType} Reference Assay`, totalPrice: 450 };
    }
    const names = reqItems
      .map((ri) => {
        const t = testMap.get(ri.testId);
        return t ? `${t.nameEn} (${t.code})` : ri.testId;
      })
      .join(', ');
    const sumPrice = reqItems.reduce((acc, ri) => acc + Number(ri.price || 0), 0);
    return { summary: names, totalPrice: sumPrice || 450 };
  };

  const defaultTestsInfo = await resolveSampleTestsSummary(sample);
  const defaultRefLab = refLabs[0];
  const defaultB2bCost = existing
    ? existing.b2bCost
    : Math.round(
        defaultTestsInfo.totalPrice *
          (1 - Number(defaultRefLab?.defaultDiscountPercent || 40) / 100)
      );

  openCustomModal(
    existing
      ? i18n.bi(
          `تعديل حافظة إرسال عينة للمعمل المرجعي (${existing.manifestNumber})`,
          `Edit Lab-to-Lab Dispatch (${existing.manifestNumber})`
        )
      : i18n.bi(
          '🚚 إرسال عينة إلى معمل مرجعي متعاقد (Lab-to-Lab Dispatch)',
          '🚚 Dispatch Sample to Reference Lab (Lab-to-Lab)'
        ),
    `
      <form id="l2l-dispatch-form" class="space-y-4 text-xs">
        <div class="rounded-xl border border-sky-200 bg-sky-50/70 p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-bold text-sky-950">🔗 ${i18n.bi('نظام إرسال العينات الخارجي والتعاقدي (Lab-to-Lab Chain of Custody)', 'Lab-to-Lab Sample Outsourcing & Chain of Custody')}</div>
            <div class="text-[11px] text-sky-800 mt-0.5">${i18n.bi('اختر العينة والمعمل المرجعي المتعاقد ودرجة حرارة النقل والمندوب وتكلفة التعاقد B2B.', 'Select sample, reference lab partner, transport temperature, courier, and B2B pricing.')}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('العينة المراد إرسالها *', 'Sample to Dispatch *')}</label>
            <select
              id="l2l-sample-select"
              required
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-sky-600 focus:outline-none"
            >
              ${samples
                .map((s) => {
                  const pat = patMap.get(s.patientId);
                  const req = reqMap.get(s.requestId);
                  const isSel = (existing ? existing.sampleId : sample?.id) === s.id;
                  return `<option value="${s.id}" ${isSel ? 'selected' : ''}>
                    ${s.sampleCode} — ${pat?.name || s.patientId} (${s.sampleType} · ${req?.requestNumber || ''})
                  </option>`;
                })
                .join('')}
            </select>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('المعمل المرجعي المرسل إليه (Reference Lab) *', 'Reference Lab Partner *')}</label>
            <select
              id="l2l-reflab-select"
              required
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-sky-600 focus:outline-none"
            >
              ${refLabs
                .map((rl) => {
                  const isSel = existing?.refLabId === rl.id;
                  return `<option value="${rl.id}" data-discount="${rl.defaultDiscountPercent}" ${isSel ? 'selected' : ''}>
                    ${rl.nameAr} (خصم تعاقد ${rl.defaultDiscountPercent}% · TAT ${rl.turnaroundHours}h)
                  </option>`;
                })
                .join('')}
            </select>
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الفحوصات والتحاليل المرسلة للمعمل المرجعي (Tests Summary) *', 'Outsourced Tests Summary *')}</label>
          <input
            id="l2l-tests-summary"
            type="text"
            required
            value="${existing ? existing.testsSummary : defaultTestsInfo.summary}"
            placeholder="e.g., ANA Profile, Anti-CCP, Viral Load PCR..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('درجة حرارة حفظ ونقل العينة *', 'Transport Temperature *')}</label>
            <select
              id="l2l-temp-select"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900"
            >
              ${(Object.keys(LAB_TO_LAB_TEMP_LABELS) as LabToLabTransportTemp[])
                .map(
                  (k) =>
                    `<option value="${k}" ${(existing?.transportTemp || 'refrigerated_2_8') === k ? 'selected' : ''}>${
                      LAB_TO_LAB_TEMP_LABELS[k].ar
                    }</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('تاريخ الإرسال *', 'Dispatch Date *')}</label>
            <input
              id="l2l-dispatch-date"
              type="date"
              required
              value="${existing ? existing.dispatchDate : todayIso}"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900"
            />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('تاريخ استلام النتيجة المتوقع *', 'Expected Result Date *')}</label>
            <input
              id="l2l-expected-date"
              type="date"
              required
              value="${existing ? existing.expectedResultDate : todayIso}"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم مندوب النقل / المستلم (Courier Name)', 'Courier / Delegate Name')}</label>
            <input
              id="l2l-courier-name"
              type="text"
              value="${existing ? existing.courierName : 'كابتن مصطفى سيد (مندوب التبريد السريع)'}"
              placeholder="اسم مندوب المعمل المرجعي..."
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
            />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('رقم هاتف المندوب', 'Courier Phone')}</label>
            <input
              id="l2l-courier-phone"
              type="text"
              value="${existing ? existing.courierPhone : '01099887766'}"
              placeholder="010xxxxxxxx"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('سعر التحليل للمريض (EGP)', 'Patient Price (EGP)')}</label>
            <input
              id="l2l-patient-price"
              type="number"
              min="0"
              step="1"
              value="${existing ? existing.patientPrice : defaultTestsInfo.totalPrice}"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-slate-900"
            />
          </div>
          <div>
            <label class="block font-bold text-sky-900 mb-1">${i18n.bi('تكلفة المعمل المرجعي (B2B Cost EGP)', 'Reference Lab B2B Cost (EGP)')}</label>
            <input
              id="l2l-b2b-cost"
              type="number"
              min="0"
              step="1"
              value="${defaultB2bCost}"
              class="w-full rounded-lg border border-sky-400 bg-white px-3 py-1.5 text-xs font-mono font-bold text-sky-900"
            />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('حالة العينة المرسلة *', 'Dispatch Status *')}</label>
            <select
              id="l2l-status-select"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
            >
              ${(Object.keys(LAB_TO_LAB_STATUS_LABELS) as LabToLabDispatchStatus[])
                .map(
                  (st) =>
                    `<option value="${st}" ${(existing?.status || 'in_transit') === st ? 'selected' : ''}>${
                      LAB_TO_LAB_STATUS_LABELS[st].ar
                    }</option>`
                )
                .join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div>
            <label class="block font-bold text-emerald-950 mb-1">${i18n.bi('النتيجة الواردة من المعمل المرجعي (عند استلامها)', 'External Reference Lab Result Summary')}</label>
            <input
              id="l2l-ext-result"
              type="text"
              value="${existing?.externalResultSummary || ''}"
              placeholder="مثال: Negative / Normal / تركيز الهرمون أو الـ PCR..."
              class="w-full rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
            />
          </div>
          <div>
            <label class="block font-bold text-emerald-950 mb-1">${i18n.bi('رقم التقرير المرجعي بالمعمل الخارجي (Ref Barcode)', 'External Lab Reference Number')}</label>
            <input
              id="l2l-ext-refnum"
              type="text"
              value="${existing?.externalRefNumber || ''}"
              placeholder="مثال: BORG-2026-99412"
              class="w-full rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900"
            />
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">${i18n.bi('ملاحظات الحفظ والفصل والنقل (Chain of Custody Notes)', 'Chain of Custody & Handling Notes')}</label>
          <input
            id="l2l-notes"
            type="text"
            value="${existing ? existing.notes : 'عينة مفصولة وجاهزة للنقل المبرد طبقاً لمعايير ISO 15189'}"
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
          />
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="submit"
            data-print-after="true"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
          >
            🖨️ ${i18n.bi('حفظ وطباعة حافظة الإرسال A4', 'Save & Print Dispatch Manifest A4')}
          </button>
          <button
            type="submit"
            class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer"
          >
            💾 ${i18n.bi('حفظ إرسال العينة (Lab-to-Lab)', 'Save Lab-to-Lab Dispatch')}
          </button>
        </div>
      </form>
    `
  );

  const sampleSel = document.getElementById('l2l-sample-select') as HTMLSelectElement | null;
  const refLabSel = document.getElementById('l2l-reflab-select') as HTMLSelectElement | null;
  const testsInput = document.getElementById('l2l-tests-summary') as HTMLInputElement | null;
  const patPriceInput = document.getElementById('l2l-patient-price') as HTMLInputElement | null;
  const b2bCostInput = document.getElementById('l2l-b2b-cost') as HTMLInputElement | null;

  const recalculateB2bCost = () => {
    const selectedRef = refLabs.find((r) => r.id === refLabSel?.value);
    const disc = Number(selectedRef?.defaultDiscountPercent || 40);
    const patPrice = Number(patPriceInput?.value || 0);
    if (b2bCostInput && patPrice > 0) {
      b2bCostInput.value = String(Math.round(patPrice * (1 - disc / 100)));
    }
  };

  sampleSel?.addEventListener('change', async () => {
    const chosen = samples.find((s) => s.id === sampleSel.value);
    if (!chosen) return;
    const info = await resolveSampleTestsSummary(chosen);
    if (testsInput) testsInput.value = info.summary;
    if (patPriceInput) patPriceInput.value = String(info.totalPrice);
    recalculateB2bCost();
  });

  refLabSel?.addEventListener('change', recalculateB2bCost);
  patPriceInput?.addEventListener('input', recalculateB2bCost);

  let shouldPrintAfterSave = false;
  const formEl = document.getElementById('l2l-dispatch-form') as HTMLFormElement | null;
  formEl?.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      shouldPrintAfterSave = btn.getAttribute('data-print-after') === 'true';
    });
  });

  formEl?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosenSample = samples.find((s) => s.id === sampleSel?.value);
    const chosenRefLab = refLabs.find((r) => r.id === refLabSel?.value);
    if (!chosenSample || !chosenRefLab) {
      showToast(i18n.bi('يرجى اختيار العينة والمعمل المرجعي', 'Please select sample and reference lab'), 'error');
      return;
    }

    const pat = patMap.get(chosenSample.patientId);
    const req = reqMap.get(chosenSample.requestId);
    const dispatchDate =
      (document.getElementById('l2l-dispatch-date') as HTMLInputElement)?.value || todayIso;
    const expectedResultDate =
      (document.getElementById('l2l-expected-date') as HTMLInputElement)?.value || todayIso;
    const status =
      ((document.getElementById('l2l-status-select') as HTMLSelectElement)?.value as LabToLabDispatchStatus) ||
      'in_transit';
    const extResult = (document.getElementById('l2l-ext-result') as HTMLInputElement)?.value.trim() || '';
    const extRefNum = (document.getElementById('l2l-ext-refnum') as HTMLInputElement)?.value.trim() || '';

    const record: LabToLabDispatchRecord = {
      id: existing ? existing.id : `l2l_${Date.now()}`,
      manifestNumber: existing
        ? existing.manifestNumber
        : `L2L-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`,
      sampleId: chosenSample.id,
      sampleCode: chosenSample.sampleCode,
      requestId: chosenSample.requestId,
      requestNumber: req?.requestNumber || chosenSample.sampleCode,
      patientId: chosenSample.patientId,
      patientName: pat?.name || chosenSample.patientId,
      sampleType: chosenSample.sampleType,
      tubeType: chosenSample.tubeType,
      refLabId: chosenRefLab.id,
      refLabName: chosenRefLab.nameAr,
      testsSummary:
        testsInput?.value.trim() || `${chosenSample.sampleType} Reference Test`,
      transportTemp:
        ((document.getElementById('l2l-temp-select') as HTMLSelectElement)?.value as LabToLabTransportTemp) ||
        'refrigerated_2_8',
      courierName:
        (document.getElementById('l2l-courier-name') as HTMLInputElement)?.value.trim() || '',
      courierPhone:
        (document.getElementById('l2l-courier-phone') as HTMLInputElement)?.value.trim() || '',
      dispatchDate,
      dispatchedAt: existing ? existing.dispatchedAt : `${dispatchDate} ${nowTime}`,
      expectedResultDate,
      b2bCost: Number(b2bCostInput?.value || 0),
      patientPrice: Number(patPriceInput?.value || 0),
      status: extResult && status === 'in_transit' ? 'result_received' : status,
      externalResultSummary: extResult || undefined,
      externalRefNumber: extRefNum || undefined,
      receivedResultAt: extResult ? `${todayIso} ${nowTime}` : existing?.receivedResultAt,
      notes: (document.getElementById('l2l-notes') as HTMLInputElement)?.value.trim() || '',
      createdBy: user?.fullNameAr || user?.username || 'System',
    };

    await db.labToLabDispatches.put(record);
    await authService.logAudit(
      existing ? 'تعديل إرسال عينة لمعمل مرجعي (Lab-to-Lab)' : 'إرسال عينة جديدة لمعمل مرجعي (Lab-to-Lab)',
      'labToLab',
      record.manifestNumber,
      `Sample ${record.sampleCode} (${record.patientName}) -> ${record.refLabName}`
    );

    closeModal();
    showToast(
      i18n.bi(
        `تم حفظ إرسال العينة (${record.sampleCode}) إلى (${record.refLabName}) بنجاح`,
        `Sample (${record.sampleCode}) dispatched to (${record.refLabName}) successfully`
      ),
      'success'
    );

    if (shouldPrintAfterSave) {
      await printLabToLabManifestA4(record);
    }

    if (options.onSaved) {
      await options.onSaved();
    }
  });
}

export async function renderLabToLabPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();

  let [dispatches, refLabs] = await Promise.all([
    db.labToLabDispatches.toArray(),
    db.referenceLabPartners.toArray(),
  ]);

  const getTodayIso = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const todayIso = getTodayIso();

  let activeTab: 'dispatches' | 'partners' = 'dispatches';
  let dateFilter = todayIso; // تلقائياً يظهر إرساليات اليوم الحالي
  let statusFilter = 'all';
  let refLabFilter = 'all';
  let searchQuery = '';

  const reloadData = async () => {
    [dispatches, refLabs] = await Promise.all([
      db.labToLabDispatches.toArray(),
      db.referenceLabPartners.toArray(),
    ]);
    renderView();
  };

  const openPartnerModal = (existing?: ReferenceLabPartner) => {
    openCustomModal(
      existing
        ? i18n.bi(`تعديل بيانات المعمل المرجعي (${existing.nameAr})`, `Edit Reference Lab (${existing.nameEn})`)
        : i18n.bi('➕ إضافة معمل مرجعي متعاقد جديد (Reference Lab Partner)', '➕ Add Reference Lab Partner'),
      `
        <form id="l2l-partner-form" class="space-y-3 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('كود المعمل المرجعي *', 'Partner Code *')}</label>
              <input id="rl-code" type="text" required value="${existing ? existing.code : `REF-${Math.floor(100 + Math.random() * 899)}`}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono font-bold" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('نسبة خصم التعاقد B2B (%) *', 'B2B Discount (%) *')}</label>
              <input id="rl-discount" type="number" min="0" max="90" required value="${existing ? existing.defaultDiscountPercent : 40}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono font-bold" />
            </div>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم المعمل المرجعي (عربي) *', 'Reference Lab Name (Arabic) *')}</label>
            <input id="rl-name-ar" type="text" required value="${existing ? existing.nameAr : ''}" placeholder="مثال: معامل البرج المرجعية / معامل المختبر..." class="w-full rounded-lg border border-slate-300 px-3 py-2 font-bold" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم المعمل المرجعي (English)', 'Reference Lab Name (English)')}</label>
            <input id="rl-name-en" type="text" value="${existing ? existing.nameEn : ''}" placeholder="e.g., Al Borg Reference Labs" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('مسؤول التواصل / المندوب', 'Contact Person')}</label>
              <input id="rl-contact" type="text" value="${existing ? existing.contactPerson : ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('رقم الهاتف / الخط الساخن', 'Phone / Hotline')}</label>
              <input id="rl-phone" type="text" value="${existing ? existing.phone : ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('العنوان الرئيسي', 'Address')}</label>
              <input id="rl-address" type="text" value="${existing ? existing.address : ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('متوسط زمن تسليم النتائج (ساعة)', 'Turnaround Time (Hours)')}</label>
              <input id="rl-tat" type="number" min="1" value="${existing ? existing.turnaroundHours : 24}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
            </div>
          </div>
          <div class="flex justify-end pt-3 border-t border-slate-200">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              💾 ${i18n.bi('حفظ بيانات المعمل المرجعي', 'Save Reference Lab')}
            </button>
          </div>
        </form>
      `
    );

    document.getElementById('l2l-partner-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameAr = (document.getElementById('rl-name-ar') as HTMLInputElement).value.trim();
      if (!nameAr) return;
      const partner: ReferenceLabPartner = {
        id: existing ? existing.id : `ref_lab_${Date.now()}`,
        code: (document.getElementById('rl-code') as HTMLInputElement).value.trim(),
        nameAr,
        nameEn: (document.getElementById('rl-name-en') as HTMLInputElement).value.trim() || nameAr,
        contactPerson: (document.getElementById('rl-contact') as HTMLInputElement).value.trim(),
        phone: (document.getElementById('rl-phone') as HTMLInputElement).value.trim(),
        address: (document.getElementById('rl-address') as HTMLInputElement).value.trim(),
        defaultDiscountPercent: Number((document.getElementById('rl-discount') as HTMLInputElement).value || 40),
        turnaroundHours: Number((document.getElementById('rl-tat') as HTMLInputElement).value || 24),
        active: true,
      };
      await db.referenceLabPartners.put(partner);
      closeModal();
      showToast(i18n.bi(`تم حفظ المعمل المرجعي (${partner.nameAr}) بنجاح`, 'Reference lab saved'), 'success');
      await reloadData();
    });
  };

  const renderView = () => {
    const todayCount = dispatches.filter((d) => d.dispatchDate === todayIso).length;
    const inTransitCount = dispatches.filter(
      (d) => d.status === 'prepared' || d.status === 'in_transit' || d.status === 'received_by_ref_lab'
    ).length;
    const completedCount = dispatches.filter((d) => d.status === 'result_received').length;
    const totalB2bCost = dispatches.reduce((s, d) => s + Number(d.b2bCost || 0), 0);
    const totalProfitMargin = dispatches.reduce(
      (s, d) => s + (Number(d.patientPrice || 0) - Number(d.b2bCost || 0)),
      0
    );

    const filteredDispatches = dispatches
      .filter((d) => {
        if (dateFilter && d.dispatchDate !== dateFilter) return false;
        if (statusFilter !== 'all' && d.status !== statusFilter) return false;
        if (refLabFilter !== 'all' && d.refLabId !== refLabFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return (
          d.manifestNumber.toLowerCase().includes(q) ||
          d.sampleCode.toLowerCase().includes(q) ||
          d.patientName.toLowerCase().includes(q) ||
          d.refLabName.toLowerCase().includes(q) ||
          d.testsSummary.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt));

    container.innerHTML = `
      <div class="space-y-5">
        <!-- Top Header -->
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 border border-indigo-300 px-2.5 py-0.5 text-[11px] font-extrabold text-indigo-900 mb-1">
              <span>🚚 Lab-to-Lab B2B Referral & Chain of Custody</span>
            </div>
            <h1 class="text-xl font-bold text-slate-900">
              ${i18n.bi('إرسال العينات للمعامل المرجعية المتعاقدة (Lab-to-Lab Sample Dispatch)', 'Lab-to-Lab Sample Dispatch & Reference Laboratories')}
            </h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة إرسال العينات للمعامل الخارجية المتعاقدة، تتبع درجة حرارة النقل والمندوب، حساب تكلفة التعاقد B2B وهامش الربح، واستلام النتائج الخارجية.',
                'Manage outsourced samples to reference labs, track cold-chain courier custody, B2B cost vs patient price, and external results.'
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              id="l2l-new-dispatch-btn"
              type="button"
              class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer shadow-xs"
            >
              🚚 ${i18n.bi('+ إرسال عينة جديدة لمعمل مرجعي', '+ Dispatch Sample (Lab-to-Lab)')}
            </button>
            <button
              id="l2l-new-partner-btn"
              type="button"
              class="rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100 cursor-pointer"
            >
              🏥 ${i18n.bi('+ إضافة معمل مرجعي متعاقد', '+ Add Reference Lab')}
            </button>
            <button
              id="l2l-print-all-btn"
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              🖨️ ${i18n.bi('طباعة كشف الحافظات A4', 'Print Manifests A4')}
            </button>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="rounded-xl border border-sky-200 bg-white p-3.5 shadow-2xs">
            <div class="text-[11px] font-bold text-slate-500">${i18n.bi('إجمالي العينات المرسلة (Lab-to-Lab)', 'Total Dispatched Samples')}</div>
            <div class="text-2xl font-black font-mono text-sky-900 mt-1">${dispatches.length} <span class="text-xs font-semibold text-sky-700">(${todayCount} اليوم)</span></div>
            <div class="text-[11px] text-slate-500 mt-0.5">${i18n.bi(`موزعة على ${refLabs.length} معامل مرجعية متعاقدة`, `Across ${refLabs.length} reference lab partners`)}</div>
          </div>

          <div class="rounded-xl border border-amber-200 bg-white p-3.5 shadow-2xs">
            <div class="text-[11px] font-bold text-slate-500">${i18n.bi('عينات قيد النقل / الفحص الخارجي', 'In-Transit / Under External Analysis')}</div>
            <div class="text-2xl font-black font-mono text-amber-700 mt-1">${inTransitCount}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">${i18n.bi('بانتظار ورود النتيجة من المعمل المرجعي', 'Awaiting external lab result')}</div>
          </div>

          <div class="rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs">
            <div class="text-[11px] font-bold text-slate-500">${i18n.bi('نتائج مستلمة من المعامل المرجعية', 'Received Reference Results')}</div>
            <div class="text-2xl font-black font-mono text-emerald-700 mt-1">${completedCount}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">${i18n.bi('تم استلام التقرير المرجعي ومراجعته', 'External report received & verified')}</div>
          </div>

          <div class="rounded-xl border border-indigo-200 bg-white p-3.5 shadow-2xs">
            <div class="text-[11px] font-bold text-slate-500">${i18n.bi('تكلفة التعاقد B2B / صافي ربح المعمل', 'B2B Cost / Net Referral Margin')}</div>
            <div class="text-lg font-black font-mono text-indigo-900 mt-1">${totalB2bCost.toLocaleString()} EGP <span class="text-xs text-emerald-700">(+${totalProfitMargin.toLocaleString()} ربح)</span></div>
            <div class="text-[11px] text-slate-500 mt-0.5">${i18n.bi('فرق سعر المريض عن تكلفة المعمل المرجعي', 'Patient fee minus reference lab B2B cost')}</div>
          </div>
        </div>

        <!-- Tabs Switcher -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl">
            <button
              type="button"
              data-l2l-tab="dispatches"
              class="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'dispatches' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
              }"
            >
              🚚 ${i18n.bi(`حافظات إرسال العينات (${dispatches.length})`, `Sample Dispatches (${dispatches.length})`)}
            </button>
            <button
              type="button"
              data-l2l-tab="partners"
              class="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                activeTab === 'partners' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-white'
              }"
            >
              🏥 ${i18n.bi(`دليل المعامل المرجعية المتعاقدة (${refLabs.length})`, `Reference Lab Partners (${refLabs.length})`)}
            </button>
          </div>
        </div>

        ${
          activeTab === 'dispatches'
            ? `
              <!-- Filters Bar -->
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 rounded-xl bg-white border border-slate-200 p-3 items-center">
                <div class="lg:col-span-4">
                  <input
                    id="l2l-search-input"
                    type="search"
                    value="${searchQuery}"
                    placeholder="${i18n.bi('🔍 ابحث برقم الحافظة، كود العينة، اسم المريض، المعمل، أو التحليل...', '🔍 Search manifest, sample code, patient, reference lab...')}"
                    class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                  />
                </div>

                <div class="lg:col-span-2">
                  <select id="l2l-reflab-filter" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-800">
                    <option value="all">${i18n.bi('كل المعامل المرجعية', 'All Reference Labs')}</option>
                    ${refLabs
                      .map(
                        (rl) =>
                          `<option value="${rl.id}" ${refLabFilter === rl.id ? 'selected' : ''}>${rl.nameAr}</option>`
                      )
                      .join('')}
                  </select>
                </div>

                <div class="lg:col-span-2">
                  <select id="l2l-status-filter" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-800">
                    <option value="all">${i18n.bi('جميع حالات الإرسال', 'All Statuses')}</option>
                    ${(Object.keys(LAB_TO_LAB_STATUS_LABELS) as LabToLabDispatchStatus[])
                      .map(
                        (st) =>
                          `<option value="${st}" ${statusFilter === st ? 'selected' : ''}>${LAB_TO_LAB_STATUS_LABELS[st].ar}</option>`
                      )
                      .join('')}
                  </select>
                </div>

                <div class="lg:col-span-4 flex flex-wrap items-center justify-end gap-1.5">
                  <input
                    id="l2l-date-filter"
                    type="date"
                    value="${dateFilter}"
                    class="rounded-lg border border-sky-300 bg-sky-50/50 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                  <button
                    id="l2l-date-today-btn"
                    type="button"
                    class="rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer ${
                      dateFilter === todayIso
                        ? 'bg-sky-600 text-white'
                        : 'border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                    }"
                  >
                    📅 ${i18n.bi(`اليوم (${todayCount})`, `Today (${todayCount})`)}
                  </button>
                  <button
                    id="l2l-date-all-btn"
                    type="button"
                    class="rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer ${
                      dateFilter === ''
                        ? 'bg-slate-800 text-white'
                        : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }"
                  >
                    📋 ${i18n.bi(`الكل (${dispatches.length})`, `All (${dispatches.length})`)}
                  </button>
                </div>
              </div>

              <!-- Dispatches Table -->
              <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
                <table class="w-full text-xs text-start">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th class="py-3 px-3 text-start">${i18n.bi('رقم الحافظة / العينة', 'Manifest / Sample')}</th>
                      <th class="py-3 px-3 text-start">${i18n.bi('المريض والعينة', 'Patient & Specimen')}</th>
                      <th class="py-3 px-3 text-start">${i18n.bi('المعمل المرجعي والتحاليل المرسلة', 'Reference Lab & Tests')}</th>
                      <th class="py-3 px-3 text-start">${i18n.bi('حرارة النقل والمندوب', 'Temp & Courier')}</th>
                      <th class="py-3 px-3 text-start">${i18n.bi('التكلفة B2B / السعر', 'B2B Cost / Price')}</th>
                      <th class="py-3 px-3 text-start">${i18n.bi('الحالة والنتيجة الواردة', 'Status & External Result')}</th>
                      <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    ${
                      filteredDispatches.length > 0
                        ? filteredDispatches
                            .map((d) => {
                              const stMeta =
                                LAB_TO_LAB_STATUS_LABELS[d.status] || LAB_TO_LAB_STATUS_LABELS.prepared;
                              const tempMeta =
                                LAB_TO_LAB_TEMP_LABELS[d.transportTemp] ||
                                LAB_TO_LAB_TEMP_LABELS.refrigerated_2_8;
                              return `
                                <tr class="hover:bg-slate-50/80">
                                  <td class="py-3 px-3">
                                    <div class="font-mono font-black text-indigo-900">${d.manifestNumber}</div>
                                    <div class="font-mono text-[11px] font-bold text-slate-600">${d.sampleCode}</div>
                                    <div class="font-mono text-[10px] text-slate-400">${d.dispatchedAt}</div>
                                  </td>
                                  <td class="py-3 px-3">
                                    <div class="font-bold text-slate-900">${d.patientName}</div>
                                    <div class="text-[11px] text-slate-500">${d.sampleType} · ${d.tubeType}</div>
                                  </td>
                                  <td class="py-3 px-3">
                                    <div class="font-bold text-sky-900">🏥 ${d.refLabName}</div>
                                    <div class="text-[11px] font-semibold text-slate-700 mt-0.5">${d.testsSummary}</div>
                                  </td>
                                  <td class="py-3 px-3">
                                    <div class="font-semibold text-slate-800">${tempMeta.ar}</div>
                                    <div class="text-[11px] text-slate-500">🛵 ${d.courierName || '—'} (${d.courierPhone || '—'})</div>
                                  </td>
                                  <td class="py-3 px-3 font-mono tabular-nums">
                                    <div class="font-bold text-slate-900">B2B: ${d.b2bCost.toLocaleString()} EGP</div>
                                    <div class="text-[11px] text-emerald-700">سعر المريض: ${d.patientPrice.toLocaleString()} EGP</div>
                                  </td>
                                  <td class="py-3 px-3">
                                    <span class="inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${stMeta.badgeClass}">
                                      ${stMeta.ar}
                                    </span>
                                    ${
                                      d.externalResultSummary
                                        ? `<div class="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-950">
                                            ✅ ${d.externalResultSummary}
                                            ${d.externalRefNumber ? `<span class="font-mono text-[10px] text-emerald-700">(${d.externalRefNumber})</span>` : ''}
                                          </div>`
                                        : ''
                                    }
                                  </td>
                                  <td class="py-3 px-3">
                                    <div class="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        data-l2l-print="${d.id}"
                                        class="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                                      >
                                        🖨️ حافظة A4
                                      </button>
                                      <button
                                        type="button"
                                        data-l2l-edit="${d.id}"
                                        class="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100 cursor-pointer"
                                      >
                                        ✏️ تحديث / نتيجة
                                      </button>
                                      <button
                                        type="button"
                                        data-l2l-del="${d.id}"
                                        class="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                                      >
                                        🗑️ حذف
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              `;
                            })
                            .join('')
                        : `
                          <tr>
                            <td colspan="7" class="py-8 text-center text-slate-500">
                              <div class="font-bold text-slate-700 mb-1">لا توجد حافظات إرسال مطابقة للفلتر الحالي</div>
                              ${
                                dateFilter && dispatches.length > 0
                                  ? `<button id="l2l-empty-all-btn" type="button" class="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                                      📋 عرض جميع الحافظات من كل التواريخ (${dispatches.length})
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
            `
            : `
              <!-- Reference Lab Partners Directory -->
              <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
                <table class="w-full text-xs text-start">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th class="py-3 px-3 text-start">الكود</th>
                      <th class="py-3 px-3 text-start">اسم المعمل المرجعي المتعاقد</th>
                      <th class="py-3 px-3 text-start">مسؤول التعاقد والهاتف</th>
                      <th class="py-3 px-3 text-start">خصم التعاقد (B2B Discount)</th>
                      <th class="py-3 px-3 text-start">زمن النتائج (TAT)</th>
                      <th class="py-3 px-3 text-start">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    ${refLabs
                      .map(
                        (rl) => `
                          <tr class="hover:bg-slate-50">
                            <td class="py-3 px-3 font-mono font-bold text-slate-900">${rl.code}</td>
                            <td class="py-3 px-3">
                              <div class="font-bold text-slate-900">${rl.nameAr}</div>
                              <div class="text-[11px] text-slate-500">${rl.nameEn} · ${rl.address}</div>
                            </td>
                            <td class="py-3 px-3">
                              <div class="font-semibold text-slate-800">${rl.contactPerson}</div>
                              <div class="font-mono text-[11px] text-slate-500">${rl.phone}</div>
                            </td>
                            <td class="py-3 px-3 font-mono font-bold text-emerald-700">${rl.defaultDiscountPercent}%</td>
                            <td class="py-3 px-3 font-mono text-slate-700">${rl.turnaroundHours} ساعة</td>
                            <td class="py-3 px-3">
                              <div class="flex items-center gap-1.5">
                                <button type="button" data-rl-edit="${rl.id}" class="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100 cursor-pointer">✏️ تعديل</button>
                                <button type="button" data-rl-del="${rl.id}" class="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">🗑️ حذف</button>
                              </div>
                            </td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
        }
      </div>
    `;

    // Bind Tab Switch
    container.querySelectorAll<HTMLButtonElement>('[data-l2l-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = (btn.dataset.l2lTab as 'dispatches' | 'partners') || 'dispatches';
        renderView();
      });
    });

    // Top Buttons
    document.getElementById('l2l-new-dispatch-btn')?.addEventListener('click', () => {
      openDispatchSampleLabToLabModal({ onSaved: reloadData });
    });
    document.getElementById('l2l-new-partner-btn')?.addEventListener('click', () => {
      openPartnerModal();
    });
    document.getElementById('l2l-print-all-btn')?.addEventListener('click', () => {
      const rowsHtml = filteredDispatches
        .map(
          (d) => `
            <tr>
              <td>${d.manifestNumber}<br/><small>${d.sampleCode}</small></td>
              <td>${d.patientName}</td>
              <td>${d.refLabName}</td>
              <td>${d.testsSummary}</td>
              <td>${d.b2bCost} EGP</td>
              <td>${LAB_TO_LAB_STATUS_LABELS[d.status]?.ar || d.status}</td>
            </tr>
          `
        )
        .join('');
      printService.printA4(
        i18n.bi('كشف حافظات إرسال العينات للمعامل المرجعية (Lab-to-Lab)', 'Lab-to-Lab Sample Dispatches Report'),
        `<table class="print-table">
          <thead><tr><th>رقم الحافظة / العينة</th><th>المريض</th><th>المعمل المرجعي</th><th>التحاليل</th><th>تكلفة B2B</th><th>الحالة</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`
      );
    });

    // Filters
    const searchEl = document.getElementById('l2l-search-input') as HTMLInputElement | null;
    searchEl?.addEventListener('input', () => {
      searchQuery = searchEl.value;
      renderView();
    });
    const refFilterEl = document.getElementById('l2l-reflab-filter') as HTMLSelectElement | null;
    refFilterEl?.addEventListener('change', () => {
      refLabFilter = refFilterEl.value;
      renderView();
    });
    const stFilterEl = document.getElementById('l2l-status-filter') as HTMLSelectElement | null;
    stFilterEl?.addEventListener('change', () => {
      statusFilter = stFilterEl.value;
      renderView();
    });
    const dtFilterEl = document.getElementById('l2l-date-filter') as HTMLInputElement | null;
    dtFilterEl?.addEventListener('change', () => {
      dateFilter = dtFilterEl.value;
      renderView();
    });
    document.getElementById('l2l-date-today-btn')?.addEventListener('click', () => {
      dateFilter = todayIso;
      renderView();
    });
    document.getElementById('l2l-date-all-btn')?.addEventListener('click', () => {
      dateFilter = '';
      renderView();
    });
    document.getElementById('l2l-empty-all-btn')?.addEventListener('click', () => {
      dateFilter = '';
      renderView();
    });

    // Row Actions (Dispatches)
    container.querySelectorAll<HTMLButtonElement>('[data-l2l-print]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rec = dispatches.find((x) => x.id === btn.dataset.l2lPrint);
        if (rec) printLabToLabManifestA4(rec);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-l2l-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rec = dispatches.find((x) => x.id === btn.dataset.l2lEdit);
        if (rec) {
          openDispatchSampleLabToLabModal({ editingDispatch: rec, onSaved: reloadData });
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-l2l-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rec = dispatches.find((x) => x.id === btn.dataset.l2lDel);
        if (!rec) return;
        openDeleteConfirmModal({
          recordLabel: `${rec.manifestNumber} — ${rec.patientName} (${rec.refLabName})`,
          onConfirm: async () => {
            await db.labToLabDispatches.delete(rec.id);
            showToast('تم حذف حافظة إرسال العينة بنجاح', 'success');
            await reloadData();
          },
        });
      });
    });

    // Row Actions (Partners)
    container.querySelectorAll<HTMLButtonElement>('[data-rl-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rl = refLabs.find((x) => x.id === btn.dataset.rlEdit);
        if (rl) openPartnerModal(rl);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-rl-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rl = refLabs.find((x) => x.id === btn.dataset.rlDel);
        if (!rl) return;
        openDeleteConfirmModal({
          recordLabel: rl.nameAr,
          onConfirm: async () => {
            await db.referenceLabPartners.delete(rl.id);
            showToast('تم حذف المعمل المرجعي بنجاح', 'success');
            await reloadData();
          },
        });
      });
    });
  };

  renderView();
}
