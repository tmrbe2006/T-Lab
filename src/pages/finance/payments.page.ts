import {
  bindTablePagination,
  createPaginationControls,
  paginateArray,
} from '../../components/common';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { patientsRepository, paymentsRepository } from '../../repositories';

export async function renderPaymentsPage(container: HTMLElement): Promise<void> {
  const [payments, patients] = await Promise.all([
    paymentsRepository.getAll(),
    patientsRepository.getAll(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  let currentPage = 1;
  const itemsPerPage = 15;

  const renderView = () => {
    const rows = paginateArray(payments, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: payments.length };

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.payments}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('سجل حركة المدفوعات النقدية والشبكة والتحويلات البنكية وإيصالات الاستلام الحرارية', 'Cash, POS card, and bank transfer payment receipts')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="pay-print-list" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الدفعة', 'Payment #')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الفاتورة', 'Invoice #')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.date}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.amount}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('طريقة الدفع', 'Method')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map(
                  (p) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${p.paymentNumber}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-700 tabular-nums">${p.invoiceNumber}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-800">${patMap.get(p.patientId)?.name || p.patientId}</td>
                    <td class="py-2.5 px-3 font-mono tabular-nums">${p.date}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-emerald-700 tabular-nums">${p.amount} EGP</td>
                    <td class="py-2.5 px-3 text-slate-600">${p.method}</td>
                    <td class="py-2.5 px-3">
                      <button data-th="${p.id}" class="pay-th-btn text-indigo-700 hover:underline font-semibold cursor-pointer">
                        ${i18n.dict.actions.printThermal}
                      </button>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${createPaginationControls(pagState, undefined, 'pay-pag')}
      </div>
    `;

    bindTablePagination(container, pagState, (page) => {
      currentPage = page;
      renderView();
    }, 'pay-pag');

    document.getElementById('pay-print-list')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.bi('رقم الدفعة', 'Payment #')}</th>
              <th>${i18n.bi('رقم الفاتورة', 'Invoice #')}</th>
              <th>${i18n.bi('المريض', 'Patient')}</th>
              <th>${i18n.dict.common.date}</th>
              <th>${i18n.dict.common.amount}</th>
              <th>${i18n.bi('طريقة الدفع', 'Method')}</th>
            </tr>
          </thead>
          <tbody>
            ${payments
              .map(
                (p) => `
                <tr>
                  <td class="tabular-nums">${p.paymentNumber}</td>
                  <td class="tabular-nums">${p.invoiceNumber}</td>
                  <td>${patMap.get(p.patientId)?.name || p.patientId}</td>
                  <td class="tabular-nums">${p.date}</td>
                  <td class="tabular-nums">${p.amount} EGP</td>
                  <td>${p.method}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.payments, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.pay-th-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = payments.find((x) => x.id === btn.getAttribute('data-th'));
        if (!p) return;
        const pat = patMap.get(p.patientId);
        await printService.printThermal80mm(
          i18n.bi('إيصال سداد نقدية / شبكة', 'Payment Receipt 80mm'),
          `
            <div><strong>${i18n.bi('رقم الإيصال:', 'Receipt #:')}</strong> ${p.paymentNumber}</div>
            <div><strong>${i18n.bi('رقم الفاتورة:', 'Invoice #:')}</strong> ${p.invoiceNumber}</div>
            <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''}</div>
            <div><strong>${i18n.dict.common.amount}:</strong> ${p.amount} EGP (${p.method})</div>
            <div><strong>${i18n.dict.common.date}:</strong> ${p.date}</div>
          `,
          p.paymentNumber
        );
      });
    });
  };

  renderView();
}
