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
  paymentsRepository,
} from '../../repositories';
import { accountingService } from '../../services/accounting.service';
import { commissionService } from '../../services/commission.service';
import {
  buildInvoiceWhatsAppMessage,
  openWhatsAppDispatchModal,
} from '../../services/enterprise-lab.service';
import type { Invoice, Payment, PaymentMethod } from '../../types';

export async function renderInvoicesPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [invoices, patients, doctors] = await Promise.all([
    invoicesRepository.getAll(),
    patientsRepository.getAll(),
    doctorsRepository.getAll(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const docMap = new Map(doctors.map((d) => [d.id, d]));
  let searchQuery = '';
  let statusFilter = 'all';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = (): Invoice[] => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q) return true;
      const pName = patMap.get(inv.patientId)?.name.toLowerCase() || '';
      return inv.invoiceNumber.toLowerCase().includes(q) || pName.includes(q);
    });
  };

  const openAddPaymentModal = (inv: Invoice) => {
    if (inv.remainingAmount <= 0) {
      showToast(i18n.bi('هذه الفاتورة مسددة بالكامل', 'Invoice is already paid in full'), 'warning');
      return;
    }

    openCustomModal(
      `${i18n.bi('تسجيل دفعة مالية للفاتورة:', 'Record Payment for Invoice:')} ${inv.invoiceNumber}`,
      `
        <form id="inv-pay-form" class="space-y-4 text-xs">
          <div class="rounded-lg bg-slate-100 p-3 grid grid-cols-3 gap-2 text-center">
            <div><div class="text-slate-500">${i18n.dict.common.net}</div><div class="font-mono font-bold text-slate-900 tabular-nums">${inv.netTotal} EGP</div></div>
            <div><div class="text-slate-500">${i18n.dict.common.paid}</div><div class="font-mono font-bold text-emerald-700 tabular-nums">${inv.paidAmount} EGP</div></div>
            <div><div class="text-slate-500">${i18n.dict.common.remaining}</div><div class="font-mono font-bold text-rose-700 tabular-nums">${inv.remainingAmount} EGP</div></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('المبلغ المحصل الآن (EGP) *', 'Collected Amount (EGP) *')}</label>
              <input name="amount" type="number" min="1" max="${inv.remainingAmount}" step="0.01" required value="${inv.remainingAmount}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold" />
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('طريقة الدفع', 'Payment Method')}</label>
              <select name="method" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="cash">${i18n.bi('نقدي (Cash)', 'Cash')}</option>
                <option value="card">${i18n.bi('شبكة / بطاقة (POS Card)', 'POS Card')}</option>
                <option value="bank_transfer">${i18n.bi('تحويل بنكي (Bank Transfer)', 'Bank Transfer')}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block font-semibold mb-1">${i18n.dict.common.notes}</label>
            <input name="notes" value="" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="flex justify-end">
            <button type="submit" class="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer">
              ${i18n.bi('تأكيد التحصيل وتوليد قيد اليومية', 'Confirm Payment & Post Journal Entry')}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('inv-pay-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission('addPayment', 'invoices'))) return;
          const fd = new FormData(form);
          const amt = Math.min(inv.remainingAmount, Math.max(0, Number(fd.get('amount')) || 0));
          if (amt <= 0) return;

          const method = (fd.get('method') as PaymentMethod) || 'cash';
          const today = new Date().toISOString().slice(0, 10);

          inv.paidAmount = Math.round((inv.paidAmount + amt) * 100) / 100;
          inv.remainingAmount = Math.max(0, Math.round((inv.netTotal - inv.paidAmount) * 100) / 100);
          inv.status = inv.remainingAmount === 0 ? 'paid' : 'partial';
          inv.paymentMethod = method;

          await invoicesRepository.save(inv);

          const newPay: Payment = {
            id: `pay_${Date.now()}`,
            paymentNumber: `PAY-2026-${String(Date.now()).slice(-4)}`,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            patientId: inv.patientId,
            date: today,
            amount: amt,
            method,
            createdBy: user?.username || 'accountant',
            status: 'active',
            notes: String(fd.get('notes') || '').trim(),
          };
          await paymentsRepository.save(newPay);
          await accountingService.recordPaymentJournal(newPay, user?.username || 'accountant');

          // Sync Referring Doctor Commission strictly on the collected amount!
          const items = await invoicesRepository.getItemsByInvoiceId(inv.id);
          const syncedComm = await commissionService.syncInvoiceCommission(inv, items);
          if (syncedComm && inv.doctorId) {
            const doc = docMap.get(inv.doctorId);
            if (doc) {
              await accountingService.recordCommissionAccrualJournal(
                syncedComm,
                doc.nameAr,
                doc.nameEn,
                user?.username || 'accountant'
              );
            }
          }

          await authService.logAudit(
            `تحصيل دفعة ${amt} EGP للفاتورة ${inv.invoiceNumber}`,
            'invoices',
            inv.id
          );
          showToast(i18n.bi(`تم تسجيل دفعة ${amt} ج.م وتحديث الحسابات والعمولات`, `Payment of ${amt} EGP recorded`), 'success');
          close();
          invoices = await invoicesRepository.getAll();
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
    const canAddPay = can(user, 'addPayment', 'invoices');
    const canDelete = can(user, 'delete', 'invoices');
    const canPrint = can(user, 'print', 'invoices');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.invoices}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة الفواتير الضريبية وفواتير التعاقدات، تحصيل الدفعات، وإرسال الفاتورة للمريض عبر واتساب بنقرة واحدة.',
                'Manage tax & corporate invoices, record payments, and send invoices via 1-Click WhatsApp.'
              )}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="inv-print-list" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
          </div>
        </div>

        ${renderSearchFilterBar({
          searchInputId: 'inv-search',
          searchQuery,
          filteredCount: filteredRows.length,
          totalCount: invoices.length,
          selectId: 'inv-status-filter',
          selectedValue: statusFilter,
          selectOptions: [
            { value: 'all', label: i18n.dict.actions.filterAll },
            { value: 'paid', label: i18n.dict.statuses.paid },
            { value: 'partial', label: i18n.dict.statuses.partial },
            { value: 'unpaid', label: i18n.dict.statuses.unpaid },
          ],
        })}

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الفاتورة / التاريخ', 'Invoice # / Date')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض والتعاقد', 'Patient & Contract')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.total}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.discount}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.tax}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.net}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.paid}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.remaining}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map((inv) => {
                  const pat = patMap.get(inv.patientId);
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-mono">
                        <div class="font-bold text-slate-900 tabular-nums">${inv.invoiceNumber}</div>
                        <div class="text-[11px] text-slate-400 tabular-nums">${inv.date}</div>
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-800">${pat?.name || inv.patientId}</div>
                        ${
                          inv.contractName
                            ? `<div class="text-[10px] font-bold text-indigo-700">🏢 ${inv.contractName} (تحمل مريض: ${inv.patientShareAmount ?? inv.netTotal} EGP)</div>`
                            : ''
                        }
                      </td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">${inv.subtotal}</td>
                      <td class="py-2.5 px-3 font-mono text-amber-700 tabular-nums">-${inv.discountAmount}</td>
                      <td class="py-2.5 px-3 font-mono text-sky-700 tabular-nums">+${inv.taxAmount}</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${inv.netTotal}</td>
                      <td class="py-2.5 px-3 font-mono font-semibold text-emerald-700 tabular-nums">${inv.paidAmount}</td>
                      <td class="py-2.5 px-3 font-mono font-semibold ${inv.remainingAmount > 0 ? 'text-rose-700' : 'text-slate-400'} tabular-nums">${inv.remainingAmount}</td>
                      <td class="py-2.5 px-3 font-semibold ${
                        inv.status === 'paid' ? 'text-emerald-700' : inv.status === 'partial' ? 'text-amber-700' : 'text-rose-700'
                      }">
                        ${i18n.dict.statuses[inv.status] || inv.status}
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-2">
                          ${
                            canAddPay && inv.remainingAmount > 0
                              ? `<button data-pay="${inv.id}" class="inv-pay-btn text-emerald-700 hover:underline font-bold cursor-pointer">${i18n.dict.actions.addPayment}</button>`
                              : ''
                          }
                          <button data-wa-inv="${inv.id}" class="inv-wa-btn rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-500 cursor-pointer">💬 واتساب</button>
                          ${
                            canPrint
                              ? `<button data-a4="${inv.id}" class="inv-a4-btn text-sky-700 hover:underline font-semibold cursor-pointer">A4</button>
                                 <button data-th="${inv.id}" class="inv-th-btn text-indigo-700 hover:underline font-semibold cursor-pointer">80mm</button>`
                              : ''
                          }
                          ${
                            canDelete
                              ? `<button data-del="${inv.id}" class="inv-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>`
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
        ${createPaginationControls(pagState, undefined, 'inv-pag')}
      </div>
    `;

    bindTablePagination(container, pagState, (page) => {
      currentPage = page;
      renderTable();
    }, 'inv-pag');

    bindSearchInputWithFocus('inv-search', searchQuery, (val) => {
      searchQuery = val;
      currentPage = 1;
      renderTable();
    });

    const stSel = document.getElementById('inv-status-filter') as HTMLSelectElement | null;
    stSel?.addEventListener('change', () => {
      statusFilter = stSel.value;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('inv-print-list')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Patient</th>
              <th>Subtotal</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Net Total</th>
              <th>Paid</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (inv) => `
                <tr>
                  <td class="tabular-nums">${inv.invoiceNumber}</td>
                  <td class="tabular-nums">${inv.date}</td>
                  <td>${patMap.get(inv.patientId)?.name || ''}</td>
                  <td class="tabular-nums">${inv.subtotal}</td>
                  <td class="tabular-nums">${inv.discountAmount}</td>
                  <td class="tabular-nums">${inv.taxAmount}</td>
                  <td class="tabular-nums">${inv.netTotal}</td>
                  <td class="tabular-nums">${inv.paidAmount}</td>
                  <td class="tabular-nums">${inv.remainingAmount}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.invoices, html);
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-pay-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = invoices.find((x) => x.id === btn.getAttribute('data-pay'));
        if (target) openAddPaymentModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-wa-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inv = invoices.find((x) => x.id === btn.getAttribute('data-wa-inv'));
        if (!inv) return;
        const pat = patMap.get(inv.patientId);
        const msg = buildInvoiceWhatsAppMessage({ patient: pat, invoice: inv });
        openWhatsAppDispatchModal({
          recipientName: pat?.name || inv.patientId,
          phone: pat?.phone || '01000000000',
          titleAr: 'إرسال الفاتورة والإيصال عبر واتساب',
          titleEn: 'Send Invoice & Receipt via WhatsApp',
          messageBody: msg,
          referenceId: inv.id,
        });
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-a4-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = invoices.find((x) => x.id === btn.getAttribute('data-a4'));
        if (!inv) return;
        const pat = patMap.get(inv.patientId);
        const items = await invoicesRepository.getItemsByInvoiceId(inv.id);
        const html = `
          <div style="margin-bottom:12px; display:flex; justify-content:space-between; border:1px solid #cbd5e1; padding:8px; border-radius:6px;">
            <div>
              <div><strong>${i18n.bi('رقم الفاتورة:', 'Invoice #:')}</strong> ${inv.invoiceNumber}</div>
              <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''} (${pat?.phone || ''})</div>
            </div>
            <div>
              <div><strong>${i18n.dict.common.date}:</strong> ${inv.date}</div>
              <div><strong>${i18n.dict.common.status}:</strong> ${inv.status.toUpperCase()}</div>
            </div>
          </div>
          <table class="print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>${i18n.bi('التحليل الطبي', 'Medical Test')}</th>
                <th>${i18n.bi('السعر قبل الخصم', 'Unit Price')}</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (it, i) => `
                  <tr>
                    <td class="tabular-nums">${i + 1}</td>
                    <td>${it.testNameAr} / ${it.testNameEn}</td>
                    <td class="tabular-nums">${it.price} EGP</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
          <div style="margin-top:14px; width:260px; margin-inline-start:auto; border:1px solid #0f172a; padding:10px; border-radius:6px;">
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.total}:</span><strong class="tabular-nums">${inv.subtotal} EGP</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.discount}:</span><strong class="tabular-nums">-${inv.discountAmount} EGP</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.tax} (${inv.taxRate}%):</span><strong class="tabular-nums">+${inv.taxAmount} EGP</strong></div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid #cbd5e1; margin-top:4px; padding-top:4px; font-size:14px;"><span>${i18n.dict.common.net}:</span><strong class="tabular-nums">${inv.netTotal} EGP</strong></div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>${i18n.dict.common.paid}:</span><strong class="tabular-nums">${inv.paidAmount} EGP</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.remaining}:</span><strong class="tabular-nums">${inv.remainingAmount} EGP</strong></div>
          </div>
        `;
        await printService.printA4(
          `${i18n.bi('فاتورة ضريبية رسمية', 'Official Tax Invoice')} — ${inv.invoiceNumber}`,
          html
        );
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-th-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const inv = invoices.find((x) => x.id === btn.getAttribute('data-th'));
        if (!inv) return;
        const pat = patMap.get(inv.patientId);
        const bodyHtml = `
          <div><strong>${i18n.bi('فاتورة:', 'Inv:')}</strong> ${inv.invoiceNumber}</div>
          <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || ''}</div>
          <div><strong>${i18n.dict.common.date}:</strong> ${inv.date}</div>
          <hr style="border-top:1px dashed #000; margin:6px 0;" />
          <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.total}:</span><span>${inv.subtotal}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.discount}:</span><span>-${inv.discountAmount}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.tax}:</span><span>+${inv.taxAmount}</span></div>
          <div style="display:flex; justify-content:space-between; font-weight:700;"><span>${i18n.dict.common.net}:</span><span>${inv.netTotal} EGP</span></div>
          <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.paid}:</span><span>${inv.paidAmount} EGP</span></div>
          <div style="display:flex; justify-content:space-between;"><span>${i18n.dict.common.remaining}:</span><span>${inv.remainingAmount} EGP</span></div>
        `;
        await printService.printThermal80mm(
          i18n.bi('إيصال فاتورة ضريبية 80mm', 'Thermal Receipt 80mm'),
          bodyHtml,
          inv.invoiceNumber
        );
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = invoices.find((x) => x.id === btn.getAttribute('data-del'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.invoiceNumber} (${patMap.get(target.patientId)?.name || ''})`,
          customWarning:
            target.paidAmount > 0
              ? i18n.bi(
                  'تنبيه مالي: هذه الفاتورة تحتوي على مبالغ محصلة مسجلة.',
                  'Financial Warning: This invoice has recorded payments.'
                )
              : undefined,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'invoices'))) return;
            await invoicesRepository.delete(target.id);
            await doctorsRepository.deleteCommissionByInvoiceId(target.id);
            await authService.logAudit(`حذف فاتورة: ${target.invoiceNumber}`, 'invoices', target.id, reason || '');
            showToast(i18n.bi('تم حذف الفاتورة بنجاح', 'Invoice deleted'), 'success');
            invoices = await invoicesRepository.getAll();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}
