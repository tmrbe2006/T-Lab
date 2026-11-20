import { authService } from '../../auth/auth.service';
import {
  bindTablePagination,
  createPaginationControls,
  paginateArray,
  openCustomModal,
  showToast,
} from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { doctorsRepository, patientsRepository } from '../../repositories';
import { payDoctorCommission, reverseDoctorCommissionPayout } from '../../services/doctor-payout.service';

export async function renderCommissionsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [commissions, doctors, patients] = await Promise.all([
    doctorsRepository.getAllCommissions(),
    doctorsRepository.getAll(),
    patientsRepository.getAll(),
  ]);
  const docMap = new Map(doctors.map((d) => [d.id, d]));
  const patMap = new Map(patients.map((p) => [p.id, p]));
  let selectedDocId = 'all';
  let currentPage = 1;
  const itemsPerPage = 15;
  const escapeText = (text: unknown) => String(text ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x] || x));
  let dailyDate = new Date().toLocaleDateString('en-CA');

  const getFiltered = () => {
    if (selectedDocId === 'all') return commissions;
    return commissions.filter((c) => c.doctorId === selectedDocId);
  };

  const renderView = () => {
    const filteredRows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const rows = paginateArray(filteredRows, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filteredRows.length };
    const canPay = can(user, 'payCommission', 'commissions');
    const canPrint = can(user, 'print', 'commissions');

    const totalAccrued = filteredRows.reduce((s, c) => s + c.commissionAmount, 0);
    const totalPaid = filteredRows.reduce((s, c) => s + c.paidAmount, 0);
    const totalRemaining = filteredRows.reduce((s, c) => s + c.remainingAmount, 0);
    const totalPaidOnDate = filteredRows.filter(c => c.payoutDate === dailyDate && !!c.payoutJournalId && !c.payoutCancelledAt).reduce((s,c)=>s+(c.payoutAmount ?? c.paidAmount),0);

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.commissions}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'تقرير عمولات الأطباء المنفصل: تُحسب فقط للطلبات المحولة، ومن المبالغ المحصلة فعليًا بعد توزيع الخصم والضريبة نسبيًا.',
                'Separate Doctor Commissions Report: Calculated strictly on referred requests from actually collected amounts after proportional discount & tax.'
              )}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="com-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
          </div>
        </div>

        <!-- Summary Strip -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي العمولات المستحقة (من المحصل فعليًا)', 'Total Accrued Commissions (From Collected)')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-slate-900 tabular-nums">${totalAccrued.toFixed(2)} EGP</div>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('العمولات المصروفة للأطباء', 'Total Paid Out Commissions')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-emerald-700 tabular-nums">${totalPaid.toFixed(2)} EGP</div>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('المتبقي المستحق للصرف', 'Remaining Payable Balance')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-rose-700 tabular-nums">${totalRemaining.toFixed(2)} EGP</div>
          </div>
        </div>

        <div class="rounded-xl border border-sky-200 bg-sky-50 p-4 flex flex-wrap items-center gap-4">
          <label class="font-bold text-sm text-sky-900">${i18n.bi('صافي إجمالي المصروف في تاريخ (بعد الإلغاءات)', 'Net payouts on date (excluding reversals)')}
             <input id="com-daily-date" type="date" value="${dailyDate}" class="block border rounded p-2 mt-1 bg-white" /></label>
          <div class="font-mono font-bold text-xl text-emerald-800">${totalPaidOnDate.toFixed(2)} EGP</div>
        </div>
        <!-- Verified Formula Reference Box -->
        <div class="rounded-xl bg-slate-900 text-slate-100 p-4 text-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="font-bold text-sky-400">${i18n.bi('معادلة احتساب العمولة المطبقة برمجيًا:', 'Active Commission Formula Verification:')}</div>
            <div class="text-[11px] text-slate-300 mt-1 font-mono">
              ${i18n.bi(
                'مثال مرجعي: فاتورة إجمالي 1000 - خصم 100 + ضريبة 50 = صافي 950 | المدفوع 475 (نسبة التحصيل 50%) | بند محول قيمته الصافية 200 -> المحصل للبند 100 × نسبة الطبيب 10% = عمولة 10.00',
                'Reference Example: Subtotal 1000 - Discount 100 + Tax 50 = Net 950 | Paid 475 (Collection Ratio 50%) | Referred Item Net 200 -> Collected Share 100 × Doctor Rate 10% = Commission 10.00'
              )}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <select id="com-doc-filter" class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white">
              <option value="all">${i18n.bi('جميع الأطباء المحولين', 'All Referring Doctors')}</option>
              ${doctors
                .filter((d) => d.type !== 'internal')
                .map((d) => `<option value="${d.id}" ${selectedDocId === d.id ? 'selected' : ''}>${d.nameAr} (${d.commissionRate}%)</option>`)
                .join('')}
            </select>
          </div>
        </div>

        <!-- Commissions Table -->
        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('الطبيب المحول', 'Referring Doctor')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الفاتورة / التاريخ', 'Invoice # / Date')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('صافي الفاتورة / المحصل', 'Invoice Net / Collected')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('نسبة التحصيل', 'Collection %')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('نصيب البنود المحصلة', 'Collected Basis')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('نسبة الطبيب', 'Doctor %')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('قيمة العمولة', 'Commission')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map((c) => {
                  const doc = docMap.get(c.doctorId);
                  const pat = patMap.get(c.patientId);
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-bold text-slate-900">${doc ? i18n.bi(doc.nameAr, doc.nameEn) : c.doctorId}</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${c.invoiceNumber} · ${c.date}</td>
                      <td class="py-2.5 px-3 text-slate-800">${pat?.name || c.patientId}</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${c.invoiceNetTotal} / <strong class="text-emerald-700">${c.collectedAmount}</strong></td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${Math.round(c.collectionRatio * 100)}%</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${c.collectedReferredBasis} EGP</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-sky-700 tabular-nums">${c.commissionRate}%</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${c.commissionAmount} EGP</td>
                      <td class="py-2.5 px-3 font-semibold ${c.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}">
                        ${i18n.dict.statuses[c.status] || c.status}
                        ${c.payoutDate ? `<div class="text-xs font-normal text-slate-500 mt-1">${i18n.bi('تاريخ الصرف: ','Payout date: ')}${escapeText(c.payoutDate)} · ${escapeText(c.payoutNotes || '')}</div>` : ''}
                        ${c.payoutCancelledAt ? `<div class="text-xs text-rose-700">${i18n.bi('صرف ملغى بتاريخ: ','Reversed on: ')}${escapeText(c.payoutCancelledAt.slice(0,10))} · ${escapeText(c.payoutCancellationReason || '')}</div>` : ''}
                      </td>
                      <td class="py-2.5 px-3">
                        ${
                          canPay && c.remainingAmount > 0
                            ? `<button data-payout="${c.id}" class="com-pay-btn rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer">
                                ${i18n.dict.actions.payCommission}
                              </button>`
                            : ''
                        }
                        ${canPay && c.payoutJournalId && !c.payoutCancelledAt ? `<button data-reverse="${c.id}" type="button" class="com-reverse-btn ms-1 rounded border border-rose-400 text-rose-700 px-2 py-1 text-xs">${i18n.bi('إلغاء الصرف','Reverse payout')}</button>` : ''}
                        ${c.paidAmount > 0 && !c.payoutJournalId && !c.payoutCancelledAt
                          ? `<span class="text-[10px] text-amber-800 block mt-1" title="${i18n.bi('لا يوجد قيد صرف أصلي موثق يسمح بإلغائه تلقائيًا. يلزم مراجعة محاسبية.', 'No original documented payout journal exists; manual accounting reconciliation required.')}">${i18n.bi('صرف قديم يحتاج مراجعة القيد','Legacy payout: journal review needed')}</span>` : ''}
                        ${!canPay && c.payoutJournalId && !c.payoutCancelledAt
                          ? `<span class="text-[10px] text-slate-500 block mt-1">${i18n.bi('يتطلب صلاحية صرف عمولة', 'Requires payout permission')}</span>` : ''}
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
        ${createPaginationControls(pagState, undefined, 'com-pag')}
      </div>
    `;

    bindTablePagination(container, pagState, (page) => {
      currentPage = page;
      renderView();
    }, 'com-pag');

    document.getElementById('com-daily-date')?.addEventListener('change', e => {
      dailyDate = (e.target as HTMLInputElement).value;
      renderView();
    });
    const docSel = document.getElementById('com-doc-filter') as HTMLSelectElement | null;
    docSel?.addEventListener('change', () => {
      selectedDocId = docSel.value;
      currentPage = 1;
      renderView();
    });

    document.getElementById('com-print-btn')?.addEventListener('click', () => {
      const visible = getFiltered();
      const docTitle =
        selectedDocId === 'all'
          ? i18n.bi('جميع الأطباء المحولين', 'All Referring Doctors')
          : docMap.get(selectedDocId)?.nameAr || '';
      const html = `
        <div style="margin-bottom:10px; font-size:12px;">
          <strong>${i18n.bi('الطبيب:', 'Doctor:')}</strong> ${docTitle} ·
          <strong>${i18n.bi('الفترة:', 'Period:')}</strong> 2026-11-01 -> 2026-11-09
        </div>
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.bi('اسم الطبيب', 'Doctor')}</th>
              <th>${i18n.bi('رقم الفاتورة', 'Invoice #')}</th>
              <th>${i18n.dict.common.date}</th>
              <th>${i18n.bi('المريض', 'Patient')}</th>
              <th>${i18n.bi('الصافي المحصل', 'Collected Net')}</th>
              <th>${i18n.bi('نسبة الطبيب', 'Rate %')}</th>
              <th>${i18n.bi('قيمة العمولة', 'Commission')}</th>
              <th>${i18n.bi('حالة الصرف', 'Payout Status')}</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (c) => `
                <tr>
                  <td>${docMap.get(c.doctorId)?.nameAr || ''}</td>
                  <td class="tabular-nums">${c.invoiceNumber}</td>
                  <td class="tabular-nums">${c.date}</td>
                  <td>${patMap.get(c.patientId)?.name || ''}</td>
                  <td class="tabular-nums">${c.collectedReferredBasis} EGP</td>
                  <td class="tabular-nums">${c.commissionRate}%</td>
                  <td class="tabular-nums" style="font-weight:700;">${c.commissionAmount} EGP</td>
                  <td>${c.status}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.commissions, html, docTitle);
    });

    document.querySelectorAll<HTMLButtonElement>('.com-pay-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!(await enforcePermission('payCommission','commissions'))) return;
        const target = commissions.find(c => c.id === btn.dataset.payout);
        if (!target || target.remainingAmount <= 0) return;
        const doctor = docMap.get(target.doctorId);
        openCustomModal(i18n.bi('صرف مستحق الطبيب','Pay Doctor Commission'),
          `<form id="com-payout-form" class="space-y-4 text-sm">
          <p class="font-semibold">${escapeText(doctor?.nameAr || target.doctorId)} — ${target.remainingAmount.toFixed(2)} EGP</p>
          <label class="block">${i18n.bi('تاريخ الصرف','Payout date')}
          <input name="date" type="date" required value="${new Date().toLocaleDateString('en-CA')}" class="block w-full border rounded p-2 mt-1"/></label>
          <label class="block">${i18n.bi('ملاحظات الصرف','Payout notes')}
          <textarea name="notes" rows="3" maxlength="1000" class="block w-full border rounded p-2 mt-1"></textarea></label>
          <button type="submit" class="rounded bg-emerald-700 text-white px-4 py-2">${i18n.bi('تأكيد الصرف وترحيل القيد','Confirm payout and journal')}</button>
          </form>`, close => {
            document.getElementById('com-payout-form')?.addEventListener('submit', async event => {
              event.preventDefault();
              if (!(await enforcePermission('payCommission','commissions'))) return;
              const form = event.currentTarget as HTMLFormElement;
              const fd = new FormData(form);
              const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
              if (button) button.disabled = true;
              try {
                await payDoctorCommission(target.id,String(fd.get('date') || ''),String(fd.get('notes') || ''),
                  doctor?.nameAr || target.doctorId,doctor?.nameEn || target.doctorId,user?.username || 'accountant');
                await authService.logAudit('صرف عمولة بتاريخ '+String(fd.get('date')),'commissions',target.id);
                commissions = await doctorsRepository.getAllCommissions();
                close();renderView();
                showToast(i18n.bi('تم الصرف وحفظ القيد','Payout and journal saved'),'success');
              } catch (error) {showToast(String(error instanceof Error ? error.message:error),'error');}
              finally {if(button)button.disabled=false;}
            });
          });
      });
    });
    document.querySelectorAll<HTMLButtonElement>('.com-reverse-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!(await enforcePermission('payCommission','commissions'))) return;
        const target = commissions.find(c => c.id === btn.dataset.reverse);
        if (!target?.payoutJournalId) return;
        openCustomModal(i18n.bi('إلغاء صرف مستحق الطبيب','Reverse Doctor Payout'),
          `<form id="com-reverse-form" class="space-y-4 text-sm">
            <p class="text-rose-800">${i18n.bi('سيتم حفظ القيد الأصلي وإنشاء قيد عكسي لتصحيح رصيد الطبيب.','Original posting is preserved and an opposite journal corrects the doctor balance.')}</p>
            <label class="block">${i18n.bi('سبب الإلغاء (إجباري)','Cancellation reason (required)')}
            <textarea name="reason" required maxlength="1000" class="block border rounded p-2 w-full mt-1"></textarea></label>
            <button type="submit" class="rounded bg-rose-700 text-white px-4 py-2">${i18n.bi('تأكيد إلغاء الصرف','Confirm Reversal')}</button>
          </form>`, close => {
            document.getElementById('com-reverse-form')?.addEventListener('submit', async event => {
              event.preventDefault();
              if (!(await enforcePermission('payCommission','commissions'))) return;
              const form = event.currentTarget as HTMLFormElement;
              const reason = String(new FormData(form).get('reason') || '').trim();
              if (!reason || !window.confirm(i18n.bi('تأكيد إلغاء الصرف وإنشاء قيد عكسي؟','Confirm reversal and opposite journal?')))return;
              const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
              if(button)button.disabled=true;
              try {
                await reverseDoctorCommissionPayout(target.id,reason,user?.username || 'accountant');
                await authService.logAudit('إلغاء صرف مستحق الطبيب','commissions',target.id,reason);
                commissions=await doctorsRepository.getAllCommissions();
                close();renderView();
                showToast(i18n.bi('تم إلغاء الصرف وتحديث حساب الطبيب','Payout reversed and account updated'),'success');
              } catch(error){showToast(String(error instanceof Error ? error.message:error),'error');}
              finally{if(button)button.disabled=false;}
            });
          });
      });
    });

  };

  renderView();
}
