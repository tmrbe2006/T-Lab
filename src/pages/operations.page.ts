import { authService } from '../auth/auth.service';
import { openCustomModal, openDeleteConfirmModal } from '../components/modal';
import { showToast } from '../components/toast';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import {
  doctorsRepository,
  invoicesRepository,
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../repositories';
import { accountingService } from '../services/accounting.service';
import { discountService } from '../services/discount.service';
import { invoiceService } from '../services/invoice.service';
import type {
  DiscountType,
  Invoice,
  InvoiceItem,
  LabRequest,
  LabResult,
  RequestItem,
  RequestType,
  Sample,
  SampleStatus,
} from '../types';

export async function renderRequestsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let requests = await requestsRepository.getAllRequests();
  const [patients, doctors, tests] = await Promise.all([
    patientsRepository.getAll(),
    doctorsRepository.getAll(),
    testsRepository.getAllTests(),
  ]);

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  let searchQuery = '';

  const getFiltered = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const pName = patientMap.get(r.patientId)?.name.toLowerCase() || '';
      return (
        r.requestNumber.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q) ||
        pName.includes(q)
      );
    });
  };

  const openNewRequestModal = () => {
    const canDiscount = can(user, 'discount', 'requests');
    const firstPat = patients[0];
    const initDisc = discountService.getPatientDefaultDiscount(firstPat);

    openCustomModal(
      i18n.bi('إنشاء طلب تحاليل جديد + توليد باركود وفاتورة تلقائية', 'Create New Lab Request + Auto Barcode & Invoice'),
      `
        <form id="req-form" class="space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('المريض *', 'Patient *')}</label>
              <select id="req-pat-sel" name="patientId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">
                ${patients.map((p) => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('نوع الطلب', 'Request Type')}</label>
              <select id="req-type-sel" name="type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">
                <option value="referred">${i18n.bi('محول من طبيب خارجي (Referred)', 'Referred by Doctor')}</option>
                <option value="internal">${i18n.bi('طلب داخلي مباشر (Internal)', 'Internal Direct Request')}</option>
              </select>
            </div>
            <div id="req-doc-wrap">
              <label class="block font-semibold mb-1">${i18n.bi('الطبيب المحول', 'Referring Doctor')}</label>
              <select id="req-doc-sel" name="doctorId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs">
                ${doctors
                  .filter((d) => d.type !== 'internal')
                  .map((d) => `<option value="${d.id}">${d.nameAr}</option>`)
                  .join('')}
              </select>
            </div>
          </div>

          <div>
            <label class="block font-semibold mb-1.5">${i18n.bi('اختر التحاليل المطلوبة *', 'Select Requested Lab Tests *')}</label>
            <div class="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
              ${tests
                .map(
                  (t, idx) => `
                  <label class="flex items-center justify-between gap-2 rounded bg-white border border-slate-200 px-2.5 py-1.5 cursor-pointer">
                    <span class="flex items-center gap-2">
                      <input type="checkbox" name="testIds" value="${t.id}" ${idx < 2 ? 'checked' : ''} class="req-tst-chk accent-sky-600" />
                      <span class="font-semibold text-slate-800">${t.code} — ${i18n.bi(t.nameAr, t.nameEn)}</span>
                    </span>
                    <span class="font-mono font-bold text-slate-900 tabular-nums">${t.price} EGP</span>
                  </label>
                `
                )
                .join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg bg-slate-100 p-3 border border-slate-200">
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('نوع الخصم', 'Discount Type')}</label>
              <select id="req-disc-type" name="discountType" ${!canDiscount ? 'disabled' : ''} class="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
                <option value="none" ${initDisc.type === 'none' ? 'selected' : ''}>بدون خصم (None)</option>
                <option value="percentage" ${initDisc.type === 'percentage' ? 'selected' : ''}>نسبة مئوية (%)</option>
                <option value="fixed" ${initDisc.type === 'fixed' ? 'selected' : ''}>مبلغ ثابت (EGP)</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('قيمة الخصم', 'Discount Value')}</label>
              <input id="req-disc-val" name="discountValue" type="number" min="0" step="0.5" value="${initDisc.value}" ${!canDiscount ? 'disabled' : ''} class="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('الضريبة (تُحسب بعد الخصم %)', 'Tax After Discount (%)')}</label>
              <input id="req-tax-rate" name="taxRate" type="number" min="0" max="50" value="14" class="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
            </div>
          </div>

          <!-- Live Calculation Summary -->
          <div id="req-calc-preview" class="rounded-lg bg-slate-900 text-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center"></div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.bi('حفظ الطلب وإصدار الباركود والفاتورة', 'Save Request & Generate Barcode/Invoice')}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const patSel = document.getElementById('req-pat-sel') as HTMLSelectElement | null;
        const typeSel = document.getElementById('req-type-sel') as HTMLSelectElement | null;
        const docWrap = document.getElementById('req-doc-wrap');
        const discTypeEl = document.getElementById('req-disc-type') as HTMLSelectElement | null;
        const discValEl = document.getElementById('req-disc-val') as HTMLInputElement | null;
        const taxRateEl = document.getElementById('req-tax-rate') as HTMLInputElement | null;
        const calcPreview = document.getElementById('req-calc-preview');

        const getSelectedTests = () => {
          const checkedIds = Array.from(document.querySelectorAll<HTMLInputElement>('.req-tst-chk:checked')).map(
            (c) => c.value
          );
          return tests.filter((t) => checkedIds.includes(t.id));
        };

        const updateCalc = () => {
          const chosen = getSelectedTests();
          const dType = (discTypeEl?.value as DiscountType) || 'none';
          const dVal = Number(discValEl?.value) || 0;
          const tRate = Number(taxRateEl?.value) || 14;
          const math = invoiceService.calculateInvoiceTotals(chosen, dType, dVal, tRate, 0);
          if (calcPreview) {
            calcPreview.innerHTML = `
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.total}</div><div class="text-sm font-mono font-bold tabular-nums">${math.subtotal} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.discount}</div><div class="text-sm font-mono font-bold text-amber-400 tabular-nums">-${math.discountAmount} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.tax} (${math.taxRate}%)</div><div class="text-sm font-mono font-bold text-sky-400 tabular-nums">+${math.taxAmount} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.net}</div><div class="text-base font-mono font-bold text-emerald-400 tabular-nums">${math.netTotal} EGP</div></div>
            `;
          }
          return math;
        };

        patSel?.addEventListener('change', () => {
          const pat = patientMap.get(patSel.value);
          const def = discountService.getPatientDefaultDiscount(pat);
          if (discTypeEl && discValEl) {
            discTypeEl.value = def.type;
            discValEl.value = String(def.value);
          }
          updateCalc();
        });

        typeSel?.addEventListener('change', () => {
          if (docWrap) {
            docWrap.style.display = typeSel.value === 'referred' ? 'block' : 'none';
          }
        });

        document.querySelectorAll('.req-tst-chk').forEach((c) => c.addEventListener('change', updateCalc));
        discTypeEl?.addEventListener('change', updateCalc);
        discValEl?.addEventListener('input', updateCalc);
        taxRateEl?.addEventListener('input', updateCalc);
        updateCalc();

        const form = document.getElementById('req-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission('add', 'requests'))) return;
          const chosen = getSelectedTests();
          if (chosen.length === 0) {
            showToast(i18n.bi('يرجى اختيار تحليل واحد على الأقل', 'Select at least one test'), 'warning');
            return;
          }
          const math = updateCalc();
          const reqId = `req_${Date.now()}`;
          const seq = requests.length + 1001;
          const reqNum = `REQ-2026-${seq}`;
          const barcode = `BC2026${seq}`;
          const rType = (typeSel?.value as RequestType) || 'referred';
          const docSel = document.getElementById('req-doc-sel') as HTMLSelectElement | null;
          const docId = rType === 'referred' ? docSel?.value : undefined;
          const today = new Date().toISOString().slice(0, 10);

          const newReq: LabRequest = {
            id: reqId,
            requestNumber: reqNum,
            barcode,
            patientId: patSel?.value || patients[0].id,
            doctorId: docId,
            type: rType,
            status: 'awaiting_sample',
            subtotal: math.subtotal,
            discountType: math.discountType,
            discountValue: math.discountValue,
            discountAmount: math.discountAmount,
            taxRate: math.taxRate,
            taxAmount: math.taxAmount,
            netTotal: math.netTotal,
            createdBy: user?.username || 'admin',
            createdAt: today,
            notes: '',
          };

          const rItems: RequestItem[] = chosen.map((t, idx) => ({
            id: `ri_${Date.now()}_${idx}`,
            requestId: reqId,
            testId: t.id,
            price: t.price,
            commissionEligible: t.commissionEligible,
          }));

          await requestsRepository.saveRequest(newReq, rItems);

          // Automatically create Sample & Invoice + Journal Entry
          const newSample: Sample = {
            id: `smp_${Date.now()}`,
            sampleCode: `SMP-${seq}`,
            requestId: reqId,
            patientId: newReq.patientId,
            sampleType: chosen[0].sampleType,
            tubeType: chosen[0].tubeType,
            status: 'received',
            receivedAt: `${today} 10:00`,
            receivedBy: user?.username || 'technician',
          };
          await requestsRepository.saveSample(newSample);

          const invId = `inv_${Date.now()}`;
          const invNum = `INV-2026-${seq}`;
          const newInv: Invoice = {
            id: invId,
            invoiceNumber: invNum,
            requestId: reqId,
            patientId: newReq.patientId,
            doctorId: docId,
            requestType: rType,
            date: today,
            subtotal: math.subtotal,
            discountType: math.discountType,
            discountValue: math.discountValue,
            discountAmount: math.discountAmount,
            taxRate: math.taxRate,
            taxAmount: math.taxAmount,
            netTotal: math.netTotal,
            paidAmount: 0,
            remainingAmount: math.netTotal,
            paymentMethod: 'cash',
            status: 'unpaid',
            notes: '',
            createdBy: user?.username || 'admin',
          };

          const invItems: InvoiceItem[] = math.itemShares.map((sh, idx) => {
            const tObj = chosen.find((c) => c.id === sh.testId)!;
            return {
              id: `ii_${Date.now()}_${idx}`,
              invoiceId: invId,
              testId: sh.testId,
              testNameAr: tObj.nameAr,
              testNameEn: tObj.nameEn,
              price: sh.price,
              netAfterDiscountAndTax: sh.netAfterDiscountAndTax,
              commissionEligible: sh.commissionEligible,
            };
          });

          await invoicesRepository.save(newInv, invItems);
          await accountingService.recordInvoiceJournal(newInv, user?.username || 'admin');
          await authService.logAudit(`إنشاء طلب تحليل جديد: ${reqNum}`, 'requests', reqId, `Net: ${math.netTotal} EGP`);

          showToast(i18n.bi(`تم حفظ الطلب ${reqNum} وإصدار الفاتورة ${invNum}`, `Created Request ${reqNum} & Invoice ${invNum}`), 'success');
          close();
          requests = await requestsRepository.getAllRequests();
          renderTable();
        });
      }
    );
  };

  const renderTable = () => {
    const rows = getFiltered();
    const canAdd = can(user, 'add', 'requests');
    const canDelete = can(user, 'delete', 'requests');
    const canPrint = can(user, 'print', 'requests');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.requests}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إدارة طلبات التحاليل، تطبيق خصم المريض الافتراضي، وطباعة ملصقات الباركود Code128', 'Manage lab requests, automatic patient default discounts, and Code128 barcode labels')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="req-print-all" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${canAdd ? `<button id="req-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <input id="req-search" type="search" value="${searchQuery}" placeholder="${i18n.dict.actions.search}" class="w-full sm:w-80 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs" />
          <span class="text-xs font-mono text-slate-500 tabular-nums">${rows.length} / ${requests.length}</span>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الطلب / الباركود', 'Request # / Barcode')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النوع / الطبيب المحول', 'Type / Doctor')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.total}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.discount}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.tax}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.net}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map((r) => {
                  const pat = patientMap.get(r.patientId);
                  const doc = r.doctorId ? doctorMap.get(r.doctorId) : undefined;
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-mono">
                        <div class="font-bold text-slate-900 tabular-nums">${r.requestNumber}</div>
                        <div class="text-[11px] text-slate-400 tabular-nums">${r.barcode} · ${r.createdAt}</div>
                      </td>
                      <td class="py-2.5 px-3 font-bold text-slate-800">${pat?.name || r.patientId}</td>
                      <td class="py-2.5 px-3 text-slate-600">
                        ${r.type === 'referred' ? `${i18n.bi('محول:', 'Ref:')} ${doc?.nameAr || ''}` : i18n.bi('طلب داخلي', 'Internal')}
                      </td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${r.subtotal}</td>
                      <td class="py-2.5 px-3 font-mono text-amber-700 tabular-nums">-${r.discountAmount}</td>
                      <td class="py-2.5 px-3 font-mono text-sky-700 tabular-nums">+${r.taxAmount}</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${r.netTotal} EGP</td>
                      <td class="py-2.5 px-3 font-semibold text-slate-700">${i18n.dict.statuses[r.status] || r.status}</td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="button" data-a4="${r.id}" class="req-a4-btn text-sky-700 hover:underline font-semibold cursor-pointer">
                            A4
                          </button>
                          <button type="button" data-th="${r.id}" class="req-th-btn text-emerald-700 hover:underline font-semibold cursor-pointer">
                            80mm
                          </button>
                          <button type="button" data-bc="${r.id}" class="req-bc-btn text-indigo-700 hover:underline font-semibold cursor-pointer">
                            ${i18n.dict.actions.printBarcode}
                          </button>
                          ${canDelete ? `<button type="button" data-del="${r.id}" class="req-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>` : ''}
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

    const sInput = document.getElementById('req-search') as HTMLInputElement | null;
    sInput?.addEventListener('input', () => {
      searchQuery = sInput.value;
      renderTable();
      const nInput = document.getElementById('req-search') as HTMLInputElement | null;
      if (nInput) {
        nInput.focus();
        nInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    document.getElementById('req-add-btn')?.addEventListener('click', () => openNewRequestModal());

    document.getElementById('req-print-all')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead><tr><th>Request #</th><th>Barcode</th><th>Patient</th><th>Subtotal</th><th>Discount</th><th>Tax</th><th>Net</th></tr></thead>
          <tbody>
            ${visible.map((r) => `<tr><td class="tabular-nums">${r.requestNumber}</td><td class="tabular-nums">${r.barcode}</td><td>${patientMap.get(r.patientId)?.name || ''}</td><td class="tabular-nums">${r.subtotal}</td><td class="tabular-nums">${r.discountAmount}</td><td class="tabular-nums">${r.taxAmount}</td><td class="tabular-nums">${r.netTotal} EGP</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.requests, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.req-a4-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = requests.find((x) => x.id === btn.getAttribute('data-a4'));
        if (!target) return;
        const pat = patientMap.get(target.patientId);
        const doc = target.doctorId ? doctorMap.get(target.doctorId) : undefined;
        const items = await requestsRepository.getRequestItems(target.id);
        const testMap = new Map(tests.map((t) => [t.id, t]));
        const html = `
          <div style="margin-bottom:12px; padding:10px; border:1px solid #cbd5e1; border-radius:6px; display:flex; justify-content:space-between;">
            <div>
              <div><strong>${i18n.bi('رقم الطلب:', 'Request #:')}</strong> ${target.requestNumber} (${target.barcode})</div>
              <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''} · ${pat?.phone || ''}</div>
            </div>
            <div>
              <div><strong>${i18n.dict.common.date}:</strong> ${target.createdAt}</div>
              <div><strong>${i18n.bi('الطبيب المحول:', 'Referring Doctor:')}</strong> ${doc ? doc.nameAr : i18n.bi('طلب داخلي', 'Internal')}</div>
            </div>
          </div>
          <table class="print-table">
            <thead><tr><th>#</th><th>Code</th><th>Test Name</th><th>Sample / Tube</th><th>Price</th></tr></thead>
            <tbody>
              ${items
                .map((it, idx) => {
                  const t = testMap.get(it.testId);
                  return `<tr><td class="tabular-nums">${idx + 1}</td><td class="tabular-nums">${t?.code || ''}</td><td>${t ? `${t.nameAr} / ${t.nameEn}` : it.testId}</td><td>${t?.sampleType || ''} (${t?.tubeType || ''})</td><td class="tabular-nums">${it.price} EGP</td></tr>`;
                })
                .join('')}
            </tbody>
          </table>
          <div style="margin-top:12px; text-align:end; font-weight:700;">
            ${i18n.dict.common.total}: ${target.subtotal} EGP | ${i18n.dict.common.discount}: -${target.discountAmount} EGP | ${i18n.dict.common.tax}: +${target.taxAmount} EGP | ${i18n.dict.common.net}: ${target.netTotal} EGP
          </div>
        `;
        await printService.printA4(`${i18n.bi('استمارة طلب تحاليل طبية', 'Lab Request Order')} — ${target.requestNumber}`, html);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.req-th-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = requests.find((x) => x.id === btn.getAttribute('data-th'));
        if (!target) return;
        const pat = patientMap.get(target.patientId);
        await printService.printThermal80mm(
          i18n.bi('ملخص طلب تحاليل 80mm', 'Lab Request Summary'),
          `
            <div><strong>${i18n.bi('رقم الطلب:', 'Req #:')}</strong> ${target.requestNumber}</div>
            <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''}</div>
            <div><strong>${i18n.dict.common.date}:</strong> ${target.createdAt}</div>
            <hr style="border-top:1px dashed #000; margin:6px 0;" />
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.total}:</span><span>${target.subtotal} EGP</span></div>
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.discount}:</span><span>-${target.discountAmount} EGP</span></div>
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.tax}:</span><span>+${target.taxAmount} EGP</span></div>
            <div style="display:flex; justify-content:space-between; font-weight:700;"><span>${i18n.dict.common.net}:</span><span>${target.netTotal} EGP</span></div>
          `,
          target.barcode
        );
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.req-bc-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = requests.find((x) => x.id === btn.getAttribute('data-bc'));
        if (!target) return;
        const pat = patientMap.get(target.patientId);
        const items = await requestsRepository.getRequestItems(target.id);
        await printService.printBarcodeLabel({
          barcode: target.barcode,
          requestNumber: target.requestNumber,
          patientName: pat?.name || target.patientId,
          date: target.createdAt,
          sampleType: 'Whole Blood / Serum',
          testsSummary: `${items.length || 2} Tests`,
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.req-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = requests.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.requestNumber} (${patientMap.get(target.patientId)?.name || ''})`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'requests'))) return;
            await requestsRepository.deleteRequest(target.id);
            await authService.logAudit(`حذف طلب تحليل: ${target.requestNumber}`, 'requests', target.id, reason || '');
            showToast(i18n.bi('تم حذف الطلب بنجاح', 'Request deleted'), 'success');
            requests = await requestsRepository.getAllRequests();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}

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

export async function renderResultReviewPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [results, patients, tests] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));

  const renderView = () => {
    const canApprove = can(user, 'approve', 'resultReview');
    const canPrint = can(user, 'print', 'resultReview');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.resultReview}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('مراجعة النتائج الطبية، الاعتماد الفردي أو الجماعي، وطباعة التقرير النهائي المعتمد A4', 'Review lab results, single or bulk medical approval, and print official A4 medical report')}</p>
          </div>
          <div class="flex items-center gap-2">
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
                <th class="py-3 px-3 text-start">${i18n.bi('التحليل', 'Test')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النتيجة والمعدل الطبيعي', 'Values & Reference')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المعتمد / الوقت', 'Approved By / At')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${results
                .map((r) => {
                  const pat = patMap.get(r.patientId);
                  const tst = tstMap.get(r.testId);
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-bold text-slate-900">${pat?.name || r.patientId}</td>
                      <td class="py-2.5 px-3 font-semibold text-slate-800">${tst ? i18n.bi(tst.nameAr, tst.nameEn) : r.testId}</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">
                        ${r.values.map((v) => `<div><strong>${v.parameterNameEn}:</strong> ${v.value} ${v.unit} [${v.normalRange}]</div>`).join('')}
                      </td>
                      <td class="py-2.5 px-3 font-semibold ${r.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}">
                        ${i18n.dict.statuses[r.status] || r.status}
                      </td>
                      <td class="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                        ${r.approvedBy ? `${r.approvedBy} (${r.approvedAt})` : '-'}
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex items-center gap-2">
                          ${
                            canApprove && r.status !== 'approved'
                              ? `<button type="button" data-app="${r.id}" class="rev-app-btn text-emerald-700 hover:underline font-bold cursor-pointer">${i18n.dict.actions.approve}</button>`
                              : ''
                          }
                          ${
                            canPrint
                              ? `<button type="button" data-prt="${r.id}" class="rev-prt-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.print}</button>`
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
      results = await requestsRepository.getAllResults();
      renderView();
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-app-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await enforcePermission('approve', 'resultReview'))) return;
        const target = results.find((x) => x.id === btn.getAttribute('data-app'));
        if (!target) return;
        target.status = 'approved';
        target.approvedBy = user?.username || 'doctor';
        target.approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
        await requestsRepository.saveResult(target);
        await authService.logAudit(`اعتماد نتيجة تحليل: ${target.id}`, 'resultReview', target.id);
        showToast(i18n.bi('تم اعتماد النتيجة بنجاح', 'Result approved'), 'success');
        results = await requestsRepository.getAllResults();
        renderView();
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-prt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-prt'));
        if (!target) return;
        const pat = patMap.get(target.patientId);
        const tst = tstMap.get(target.testId);
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
