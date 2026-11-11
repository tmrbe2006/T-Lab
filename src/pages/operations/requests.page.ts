import { authService } from '../../auth/auth.service';
import {
  bindSearchInputWithFocus,
  bindTablePagination,
  createPaginationControls,
  openCustomModal,
  openDeleteConfirmModal,
  paginateArray,
  renderSearchFilterBar,
  showToast,
} from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import {
  doctorsRepository,
  invoicesRepository,
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../../repositories';
import { accountingService } from '../../services/accounting.service';
import { discountService } from '../../services/discount.service';
import { ensureEnterpriseSeedData } from '../../services/enterprise-lab.service';
import { invoiceService } from '../../services/invoice.service';
import { db } from '../../db/database';
import type {
  DiscountType,
  Invoice,
  InvoiceItem,
  LabRequest,
  RequestItem,
  RequestType,
  Sample,
} from '../../types';

export async function renderRequestsPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();
  const user = authService.getCurrentUser();
  let requests = await requestsRepository.getAllRequests();
  const [patients, doctors, tests, contracts] = await Promise.all([
    patientsRepository.getAll(),
    doctorsRepository.getAll(),
    testsRepository.getAllTests(),
    db.corporateContracts.toArray(),
  ]);

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      const pName = patientMap.get(r.patientId)?.name.toLowerCase() || '';
      const pNameEn = (patientMap.get(r.patientId)?.nameEn || '').toLowerCase();
      return (
        r.requestNumber.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q) ||
        pName.includes(q) ||
        pNameEn.includes(q)
      );
    });
  };

  const openRequestModal = async (existingReq?: LabRequest) => {
    const isEdit = Boolean(existingReq);
    const canDiscount = can(user, 'discount', 'requests');
    const existingItems = existingReq ? await requestsRepository.getRequestItems(existingReq.id) : [];
    const existingTestIds = new Set(existingItems.map((it) => it.testId));

    const selectedPat = existingReq
      ? patientMap.get(existingReq.patientId) || patients[0]
      : patients[0];
    const initDisc = existingReq
      ? { type: existingReq.discountType, value: existingReq.discountValue }
      : discountService.getPatientDefaultDiscount(selectedPat);
    const initTaxRate = existingReq ? existingReq.taxRate : 14;
    const initType: RequestType = existingReq ? existingReq.type : 'referred';

    openCustomModal(
      isEdit
        ? i18n.bi(`تعديل طلب التحاليل: ${existingReq?.requestNumber}`, `Edit Lab Request: ${existingReq?.requestNumber}`)
        : i18n.bi('إنشاء طلب تحاليل جديد + توليد باركود وفاتورة تلقائية', 'Create New Lab Request + Auto Barcode & Invoice'),
      `
        <form id="req-form" class="space-y-4 text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('المريض *', 'Patient *')}</label>
              <select id="req-pat-sel" name="patientId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">
                ${patients
                  .map(
                    (p) =>
                      `<option value="${p.id}" ${p.id === selectedPat?.id ? 'selected' : ''}>${p.name}${
                        p.nameEn ? ` (${p.nameEn})` : ''
                      } — ${p.code}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('جهة التعاقد / التأمين / النقابة', 'Corporate / Insurance Contract')}</label>
              <select id="req-contract-sel" name="contractId" class="w-full rounded-lg border border-indigo-300 bg-indigo-50/50 px-3 py-2 text-xs font-bold text-indigo-950">
                <option value="">${i18n.bi('نقدي مباشر (Cash Walk-in)', 'Direct Cash (No Contract)')}</option>
                ${contracts
                  .map(
                    (c) =>
                      `<option value="${c.id}" ${c.id === existingReq?.contractId ? 'selected' : ''}>${i18n.bi(c.nameAr, c.nameEn)} (خصم ${c.discountPercent}% | تحمل مريض ${c.patientCoPayPercent}%)</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('نوع الطلب', 'Request Type')}</label>
              <select id="req-type-sel" name="type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">
                <option value="referred" ${initType === 'referred' ? 'selected' : ''}>${i18n.bi('محول من طبيب خارجي (Referred)', 'Referred by Doctor')}</option>
                <option value="internal" ${initType === 'internal' ? 'selected' : ''}>${i18n.bi('طلب داخلي مباشر (Internal)', 'Internal Direct Request')}</option>
              </select>
            </div>
            <div id="req-doc-wrap" style="display: ${initType === 'referred' ? 'block' : 'none'};">
              <label class="block font-semibold mb-1">${i18n.bi('الطبيب المحول', 'Referring Doctor')}</label>
              <select id="req-doc-sel" name="doctorId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs">
                ${doctors
                  .filter((d) => d.type !== 'internal')
                  .map(
                    (d) =>
                      `<option value="${d.id}" ${d.id === existingReq?.doctorId ? 'selected' : ''}>${d.nameAr}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>

          <div>
            <label class="block font-semibold mb-1.5">${i18n.bi('اختر التحاليل المطلوبة *', 'Select Requested Lab Tests *')}</label>
            <div class="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
              ${tests
                .map((t, idx) => {
                  const isChecked = isEdit ? existingTestIds.has(t.id) : idx < 2;
                  return `
                  <label class="flex items-center justify-between gap-2 rounded bg-white border border-slate-200 px-2.5 py-1.5 cursor-pointer">
                    <span class="flex items-center gap-2">
                      <input type="checkbox" name="testIds" value="${t.id}" ${isChecked ? 'checked' : ''} class="req-tst-chk accent-sky-600" />
                      <span class="font-semibold text-slate-800">${t.code} — ${i18n.bi(t.nameAr, t.nameEn)}</span>
                    </span>
                    <span class="font-mono font-bold text-slate-900 tabular-nums">${t.price} EGP</span>
                  </label>
                `;
                })
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
              <input id="req-tax-rate" name="taxRate" type="number" min="0" max="50" value="${initTaxRate}" class="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
            </div>
          </div>

          <!-- Live Calculation Summary -->
          <div id="req-calc-preview" class="rounded-lg bg-slate-900 text-white p-4 grid grid-cols-2 sm:grid-cols-6 gap-3 text-center"></div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${
                isEdit
                  ? i18n.bi('حفظ تعديلات الطلب والفاتورة', 'Save Request & Invoice Changes')
                  : i18n.bi('حفظ الطلب وإصدار الباركود والفاتورة', 'Save Request & Generate Barcode/Invoice')
              }
            </button>
          </div>
        </form>
      `,
      (close) => {
        const patSel = document.getElementById('req-pat-sel') as HTMLSelectElement | null;
        const contractSel = document.getElementById('req-contract-sel') as HTMLSelectElement | null;
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
          const selectedContract = contracts.find((c) => c.id === contractSel?.value);
          const patientShare = selectedContract
            ? Number(((math.netTotal * selectedContract.patientCoPayPercent) / 100).toFixed(2))
            : math.netTotal;
          const companyShare = selectedContract
            ? Number((math.netTotal - patientShare).toFixed(2))
            : 0;

          if (calcPreview) {
            calcPreview.innerHTML = `
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.total}</div><div class="text-sm font-mono font-bold tabular-nums">${math.subtotal} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.discount}</div><div class="text-sm font-mono font-bold text-amber-400 tabular-nums">-${math.discountAmount} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.tax} (${math.taxRate}%)</div><div class="text-sm font-mono font-bold text-sky-400 tabular-nums">+${math.taxAmount} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.dict.common.net}</div><div class="text-base font-mono font-bold text-emerald-400 tabular-nums">${math.netTotal} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.bi('تحمل المريض', 'Patient Co-Pay')}</div><div class="text-sm font-mono font-bold text-white tabular-nums">${patientShare} EGP</div></div>
              <div><div class="text-[10px] text-slate-400">${i18n.bi('مطالبة الجهة', 'Company Claim')}</div><div class="text-sm font-mono font-bold text-indigo-300 tabular-nums">${companyShare} EGP</div></div>
            `;
          }
          return { ...math, selectedContract, patientShare, companyShare };
        };

        contractSel?.addEventListener('change', () => {
          const selectedContract = contracts.find((c) => c.id === contractSel.value);
          if (selectedContract && discTypeEl && discValEl) {
            discTypeEl.value = 'percentage';
            discValEl.value = String(selectedContract.discountPercent);
          }
          updateCalc();
        });

        patSel?.addEventListener('change', () => {
          const pat = patientMap.get(patSel.value);
          const def = discountService.getPatientDefaultDiscount(pat);
          if (!contractSel?.value && discTypeEl && discValEl) {
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
          if (!(await enforcePermission(isEdit ? 'edit' : 'add', 'requests'))) return;
          const chosen = getSelectedTests();
          if (chosen.length === 0) {
            showToast(i18n.bi('يرجى اختيار تحليل واحد على الأقل', 'Select at least one test'), 'warning');
            return;
          }
          const math = updateCalc();
          const rType = (typeSel?.value as RequestType) || 'referred';
          const docSel = document.getElementById('req-doc-sel') as HTMLSelectElement | null;
          const docId = rType === 'referred' ? docSel?.value : undefined;
          const today = new Date().toISOString().slice(0, 10);

          if (isEdit && existingReq) {
            const updatedReq: LabRequest = {
              ...existingReq,
              patientId: patSel?.value || existingReq.patientId,
              doctorId: docId,
              contractId: math.selectedContract?.id,
              contractName: math.selectedContract ? i18n.bi(math.selectedContract.nameAr, math.selectedContract.nameEn) : undefined,
              patientShareAmount: math.patientShare,
              companyShareAmount: math.companyShare,
              type: rType,
              subtotal: math.subtotal,
              discountType: math.discountType,
              discountValue: math.discountValue,
              discountAmount: math.discountAmount,
              taxRate: math.taxRate,
              taxAmount: math.taxAmount,
              netTotal: math.netTotal,
            };

            const rItems: RequestItem[] = chosen.map((t, idx) => ({
              id: `ri_${Date.now()}_${idx}`,
              requestId: existingReq.id,
              testId: t.id,
              price: t.price,
              commissionEligible: t.commissionEligible,
            }));

            await requestsRepository.saveRequest(updatedReq, rItems);

            // Update linked invoice if exists
            const allInvs = await invoicesRepository.getAll();
            const linkedInv = allInvs.find((inv) => inv.requestId === existingReq.id);
            if (linkedInv) {
              const newRemaining = Math.max(0, Number((math.netTotal - linkedInv.paidAmount).toFixed(2)));
              const newStatus =
                linkedInv.paidAmount >= math.netTotal && math.netTotal > 0
                  ? 'paid'
                  : linkedInv.paidAmount > 0
                  ? 'partial'
                  : 'unpaid';
              const updatedInv: Invoice = {
                ...linkedInv,
                patientId: updatedReq.patientId,
                doctorId: docId,
                requestType: rType,
                subtotal: math.subtotal,
                discountType: math.discountType,
                discountValue: math.discountValue,
                discountAmount: math.discountAmount,
                taxRate: math.taxRate,
                taxAmount: math.taxAmount,
                netTotal: math.netTotal,
                remainingAmount: newRemaining,
                status: newStatus,
              };
              const invItems: InvoiceItem[] = math.itemShares.map((sh, idx) => {
                const tObj = chosen.find((c) => c.id === sh.testId)!;
                return {
                  id: `ii_${Date.now()}_${idx}`,
                  invoiceId: linkedInv.id,
                  testId: sh.testId,
                  testNameAr: tObj.nameAr,
                  testNameEn: tObj.nameEn,
                  price: sh.price,
                  netAfterDiscountAndTax: sh.netAfterDiscountAndTax,
                  commissionEligible: sh.commissionEligible,
                };
              });
              await invoicesRepository.save(updatedInv, invItems);
            }

            await authService.logAudit(
              `تعديل طلب تحليل: ${updatedReq.requestNumber}`,
              'requests',
              updatedReq.id,
              `Net: ${math.netTotal} EGP`
            );
            showToast(
              i18n.bi(`تم تعديل الطلب ${updatedReq.requestNumber} بنجاح`, `Request ${updatedReq.requestNumber} updated`),
              'success'
            );
            close();
            requests = await requestsRepository.getAllRequests();
            renderTable();
            return;
          }

          const reqId = `req_${Date.now()}`;
          const seq = requests.length + 1001;
          const reqNum = `REQ-2026-${seq}`;
          const barcode = `BC2026${seq}`;

          const newReq: LabRequest = {
            id: reqId,
            requestNumber: reqNum,
            barcode,
            patientId: patSel?.value || patients[0]?.id || '',
            doctorId: docId,
            contractId: math.selectedContract?.id,
            contractName: math.selectedContract ? i18n.bi(math.selectedContract.nameAr, math.selectedContract.nameEn) : undefined,
            patientShareAmount: math.patientShare,
            companyShareAmount: math.companyShare,
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
            contractId: math.selectedContract?.id,
            contractName: math.selectedContract ? i18n.bi(math.selectedContract.nameAr, math.selectedContract.nameEn) : undefined,
            patientShareAmount: math.patientShare,
            companyShareAmount: math.companyShare,
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
    const filteredRows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const rows = paginateArray(filteredRows, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filteredRows.length };
    const canAdd = can(user, 'add', 'requests');
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

        ${renderSearchFilterBar({
          searchInputId: 'req-search',
          searchQuery,
          filteredCount: filteredRows.length,
          totalCount: requests.length,
        })}

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
                      <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-800">${pat?.name || r.patientId}</div>
                        ${pat?.nameEn ? `<div class="text-[11px] text-slate-500" dir="ltr">${pat.nameEn}</div>` : ''}
                      </td>
                      <td class="py-2.5 px-3 text-slate-600">
                        ${r.type === 'referred' ? `${i18n.bi('محول:', 'Ref:')} ${doc?.nameAr || ''}` : i18n.bi('طلب داخلي', 'Internal')}
                      </td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${r.subtotal}</td>
                      <td class="py-2.5 px-3 font-mono text-amber-700 tabular-nums">-${r.discountAmount}</td>
                      <td class="py-2.5 px-3 font-mono text-sky-700 tabular-nums">+${r.taxAmount}</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${r.netTotal} EGP</td>
                      <td class="py-2.5 px-3 font-semibold text-slate-700">${i18n.dict.statuses[r.status] || r.status}</td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <button type="button" data-a4="${r.id}" class="req-a4-btn rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-slate-100 cursor-pointer">
                            A4
                          </button>
                          <button type="button" data-th="${r.id}" class="req-th-btn rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                            80mm
                          </button>
                          <button type="button" data-bc="${r.id}" class="req-bc-btn rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer">
                            ${i18n.dict.actions.printBarcode}
                          </button>
                          <button type="button" data-edit="${r.id}" class="req-edit-btn rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                            ${i18n.dict.actions.edit}
                          </button>
                          <button type="button" data-del="${r.id}" class="req-del-btn rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                            ${i18n.dict.actions.delete}
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
        ${createPaginationControls(pagState, undefined, 'req-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'req-pag'
    );

    bindSearchInputWithFocus('req-search', searchQuery, (val) => {
      searchQuery = val;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('req-add-btn')?.addEventListener('click', () => openRequestModal());

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
              <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''}${pat?.nameEn ? ` / ${pat.nameEn}` : ''} · ${pat?.phone || ''}</div>
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

    document.querySelectorAll<HTMLButtonElement>('.req-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = requests.find((x) => x.id === btn.getAttribute('data-edit'));
        if (target) openRequestModal(target);
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
