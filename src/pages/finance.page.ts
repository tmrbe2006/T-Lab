import { authService } from '../auth/auth.service';
import { openCustomModal, openDeleteConfirmModal } from '../components/modal';
import { showToast } from '../components/toast';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import {
  accountingRepository,
  doctorsRepository,
  invoicesRepository,
  patientsRepository,
  paymentsRepository,
} from '../repositories';
import { accountingService } from '../services/accounting.service';
import { commissionService } from '../services/commission.service';
import type { DailyClosing, Expense, Invoice, Payment, PaymentMethod } from '../types';

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
    const rows = getFiltered();
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
                'إدارة الفواتير الضريبية (الصافي = الإجمالي - الخصم + الضريبة بعد الخصم). لا تظهر نسبة الطبيب ولا تُخصم داخل الفاتورة.',
                'Manage invoices (Net = Subtotal - Discount + Tax after discount). Doctor commission is never displayed or deducted on invoices.'
              )}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="inv-print-list" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <input id="inv-search" type="search" value="${searchQuery}" placeholder="${i18n.dict.actions.search}" class="w-64 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs" />
            <select id="inv-status-filter" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>${i18n.dict.actions.filterAll}</option>
              <option value="paid" ${statusFilter === 'paid' ? 'selected' : ''}>${i18n.dict.statuses.paid}</option>
              <option value="partial" ${statusFilter === 'partial' ? 'selected' : ''}>${i18n.dict.statuses.partial}</option>
              <option value="unpaid" ${statusFilter === 'unpaid' ? 'selected' : ''}>${i18n.dict.statuses.unpaid}</option>
            </select>
          </div>
          <span class="text-xs font-mono text-slate-500 tabular-nums">${rows.length} / ${invoices.length}</span>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('رقم الفاتورة / التاريخ', 'Invoice # / Date')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
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
                      <td class="py-2.5 px-3 font-bold text-slate-800">${pat?.name || inv.patientId}</td>
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
      </div>
    `;

    const sInput = document.getElementById('inv-search') as HTMLInputElement | null;
    sInput?.addEventListener('input', () => {
      searchQuery = sInput.value;
      renderTable();
      const nInput = document.getElementById('inv-search') as HTMLInputElement | null;
      if (nInput) {
        nInput.focus();
        nInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    const stSel = document.getElementById('inv-status-filter') as HTMLSelectElement | null;
    stSel?.addEventListener('change', () => {
      statusFilter = stSel.value;
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

export async function renderPaymentsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  const [payments, patients] = await Promise.all([
    paymentsRepository.getAll(),
    patientsRepository.getAll(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));

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
            ${payments
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
    </div>
  `;

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
}

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

  const getFiltered = () => {
    if (selectedDocId === 'all') return commissions;
    return commissions.filter((c) => c.doctorId === selectedDocId);
  };

  const renderView = () => {
    const rows = getFiltered();
    const canPay = can(user, 'payCommission', 'commissions');
    const canPrint = can(user, 'print', 'commissions');

    const totalAccrued = rows.reduce((s, c) => s + c.commissionAmount, 0);
    const totalPaid = rows.reduce((s, c) => s + c.paidAmount, 0);
    const totalRemaining = rows.reduce((s, c) => s + c.remainingAmount, 0);

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
                      </td>
                      <td class="py-2.5 px-3">
                        ${
                          canPay && c.remainingAmount > 0
                            ? `<button data-payout="${c.id}" class="com-pay-btn rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer">
                                ${i18n.dict.actions.payCommission}
                              </button>`
                            : '<span class="text-slate-400">—</span>'
                        }
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

    const docSel = document.getElementById('com-doc-filter') as HTMLSelectElement | null;
    docSel?.addEventListener('change', () => {
      selectedDocId = docSel.value;
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

    document.querySelectorAll<HTMLButtonElement>('.com-pay-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await enforcePermission('payCommission', 'commissions'))) return;
        const target = commissions.find((x) => x.id === btn.getAttribute('data-payout'));
        if (!target || target.remainingAmount <= 0) return;

        const amtToPay = target.remainingAmount;
        target.paidAmount = target.commissionAmount;
        target.remainingAmount = 0;
        target.status = 'paid';
        await doctorsRepository.saveCommission(target);

        const doc = docMap.get(target.doctorId);
        await accountingService.recordCommissionPayoutJournal(
          target,
          amtToPay,
          doc?.nameAr || target.doctorId,
          doc?.nameEn || target.doctorId,
          user?.username || 'accountant'
        );

        await authService.logAudit(
          `صرف عمولة طبيب (${doc?.nameAr}) بقيمة ${amtToPay} EGP`,
          'commissions',
          target.id
        );
        showToast(
          i18n.bi(`تم صرف العمولة (${amtToPay} ج.م) وإنشاء قيد اليومية التلقائي`, `Commission paid (${amtToPay} EGP) & journal entry created`),
          'success'
        );
        commissions = await doctorsRepository.getAllCommissions();
        renderView();
      });
    });
  };

  renderView();
}

export async function renderAccountingPage(
  container: HTMLElement,
  subView: 'accounts' | 'journalEntries' | 'cashbox' | 'expenses' | 'reports'
): Promise<void> {
  const user = authService.getCurrentUser();
  const [accounts, journalEntries, expenses, closings, invoices] = await Promise.all([
    accountingRepository.getAccounts(),
    accountingRepository.getJournalEntries(),
    accountingRepository.getExpenses(),
    accountingRepository.getDailyClosings(),
    invoicesRepository.getAll(),
  ]);

  if (subView === 'accounts') {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.accounts}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('شجرة الحسابات المحاسبية: الأصول، الالتزامات، الإيرادات، والمصروفات', 'Chart of Accounts: Assets, Liabilities, Revenues, and Expenses')}</p>
          </div>
          <button id="acc-print" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.name}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النوع المحاسبي', 'Account Type')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الرصيد الحالي', 'Current Balance')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${accounts
                .map(
                  (a) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${a.code}</td>
                    <td class="py-2.5 px-3 font-bold text-slate-800">${i18n.bi(a.nameAr, a.nameEn)}</td>
                    <td class="py-2.5 px-3 uppercase font-mono text-slate-600">${a.type}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${a.balance.toLocaleString()} EGP</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById('acc-print')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.accounts,
        `<table class="print-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Balance</th></tr></thead><tbody>${accounts.map((a) => `<tr><td class="tabular-nums">${a.code}</td><td>${i18n.bi(a.nameAr, a.nameEn)}</td><td>${a.type}</td><td class="tabular-nums">${a.balance.toLocaleString()} EGP</td></tr>`).join('')}</tbody></table>`
      );
    });
    return;
  }

  if (subView === 'journalEntries') {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.journalEntries}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('دفتر القيود اليومية التلقائية (عند إصدار فاتورة، تحصيل دفعة، تسجيل مصروف، احتساب أو صرف عمولة طبيب)', 'Automatic double-entry journal entries for invoices, payments, expenses, and doctor commissions')}</p>
          </div>
          <button id="je-print" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
        </div>
        <div class="space-y-3">
          ${journalEntries
            .slice(0, 35)
            .map(
              (je) => `
              <div class="rounded-xl bg-white border border-slate-200 p-4 text-xs">
                <div class="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <div>
                    <span class="font-mono font-bold text-sky-700 tabular-nums">${je.entryNumber}</span>
                    <span class="mx-2">·</span>
                    <span class="font-bold text-slate-900">${i18n.bi(je.descriptionAr, je.descriptionEn)}</span>
                  </div>
                  <div class="font-mono text-slate-500 tabular-nums">${je.date} · [${je.referenceType}]</div>
                </div>
                <table class="w-full text-start">
                  <thead>
                    <tr class="text-slate-400">
                      <th class="py-1 text-start">${i18n.bi('الحساب', 'Account')}</th>
                      <th class="py-1 text-end">${i18n.bi('مدين (Debit)', 'Debit')}</th>
                      <th class="py-1 text-end">${i18n.bi('دائن (Credit)', 'Credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${je.lines
                      .map(
                        (l) => `
                        <tr>
                          <td class="py-1 font-medium text-slate-700">${l.accountCode} — ${i18n.bi(l.accountNameAr, l.accountNameEn)}</td>
                          <td class="py-1 text-end font-mono tabular-nums">${l.debit > 0 ? l.debit.toFixed(2) : '-'}</td>
                          <td class="py-1 text-end font-mono tabular-nums">${l.credit > 0 ? l.credit.toFixed(2) : '-'}</td>
                        </tr>
                      `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
            )
            .join('')}
        </div>
      </div>
    `;
    document.getElementById('je-print')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.journalEntries,
        `<table class="print-table"><thead><tr><th>Entry #</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${journalEntries.slice(0, 30).map((j) => `<tr><td class="tabular-nums">${j.entryNumber}</td><td class="tabular-nums">${j.date}</td><td>${i18n.bi(j.descriptionAr, j.descriptionEn)}</td><td class="tabular-nums">${j.totalDebit}</td><td class="tabular-nums">${j.totalCredit}</td></tr>`).join('')}</tbody></table>`
      );
    });
    return;
  }

  if (subView === 'expenses') {
    const canAdd = can(user, 'add', 'expenses');
    const canDelete = can(user, 'delete', 'expenses');
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.expenses}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('تسجيل مصروفات المعمل وتوليد قيود اليومية التلقائية', 'Record laboratory operational expenses with automatic journal entry creation')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="exp-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
            ${canAdd ? `<button id="exp-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('بند المصروف', 'Category')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.date}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.amount}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('البيان', 'Description')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${expenses
                .map(
                  (ex) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono font-bold tabular-nums">${ex.expenseNumber}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-900">${ex.category}</td>
                    <td class="py-2.5 px-3 font-mono tabular-nums">${ex.date}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-rose-700 tabular-nums">${ex.amount} EGP</td>
                    <td class="py-2.5 px-3 text-slate-600">${ex.description}</td>
                    <td class="py-2.5 px-3">
                      ${
                        canDelete
                          ? `<button data-del-exp="${ex.id}" class="exp-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>`
                          : '<span class="text-slate-400">—</span>'
                      }
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById('exp-print-btn')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.expenses,
        `<table class="print-table"><thead><tr><th>Code</th><th>Category</th><th>Date</th><th>Amount</th><th>Description</th></tr></thead><tbody>${expenses.map((ex) => `<tr><td class="tabular-nums">${ex.expenseNumber}</td><td>${ex.category}</td><td class="tabular-nums">${ex.date}</td><td class="tabular-nums">${ex.amount} EGP</td><td>${ex.description}</td></tr>`).join('')}</tbody></table>`
      );
    });
    document.querySelectorAll<HTMLButtonElement>('.exp-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = expenses.find((x) => x.id === btn.getAttribute('data-del-exp'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.expenseNumber} (${target.category} - ${target.amount} EGP)`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'expenses'))) return;
            await accountingRepository.deleteExpense(target.id);
            await authService.logAudit(`حذف مصروف: ${target.expenseNumber}`, 'expenses', target.id, reason || '');
            showToast(i18n.bi('تم حذف المصروف بنجاح', 'Expense deleted'), 'success');
            renderAccountingPage(container, 'expenses');
          },
        });
      });
    });
    document.getElementById('exp-add-btn')?.addEventListener('click', () => {
      openCustomModal(
        i18n.bi('تسجيل مصروف تشغيلي جديد', 'Record New Expense'),
        `
          <form id="exp-form" class="space-y-4 text-xs">
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('فئة المصروف', 'Expense Category')}</label>
              <input name="category" required value="المحاليل والمستلزمات" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.dict.common.amount} (EGP) *</label>
              <input name="amount" type="number" min="1" required value="500" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('البيان والتفاصيل', 'Description')}</label>
              <input name="description" required value="شراء مستلزمات سحب عينات" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">${i18n.dict.actions.save}</button>
            </div>
          </form>
        `,
        (close) => {
          const form = document.getElementById('exp-form') as HTMLFormElement | null;
          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!(await enforcePermission('add', 'expenses'))) return;
            const fd = new FormData(form);
            const rec: Expense = {
              id: `exp_${Date.now()}`,
              expenseNumber: `EXP-2026-${String(Date.now()).slice(-4)}`,
              category: String(fd.get('category') || ''),
              accountCode: '5104',
              amount: Number(fd.get('amount')) || 0,
              date: new Date().toISOString().slice(0, 10),
              paidBy: user?.username || 'accountant',
              paymentMethod: 'cash',
              description: String(fd.get('description') || ''),
            };
            await accountingRepository.saveExpense(rec);
            await accountingService.recordExpenseJournal(rec, user?.username || 'accountant');
            await authService.logAudit(`تسجيل مصروف: ${rec.expenseNumber}`, 'expenses', rec.id, `${rec.amount} EGP`);
            showToast(i18n.bi('تم تسجيل المصروف وإنشاء قيد اليومية التلقائي', 'Expense & journal entry recorded'), 'success');
            close();
            renderAccountingPage(container, 'expenses');
          });
        }
      );
    });
    return;
  }

  if (subView === 'cashbox') {
    const canClose = can(user, 'closeDay', 'cashbox');
    const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
    const netCash = totalCollected - totalExp;

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.cashbox}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('مراقبة حركة النقدية بالصندوق وإغلاق اليومية المحاسبية', 'Cashbox session monitoring and daily financial closing')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="cb-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
            ${canClose ? `<button id="cb-close-btn" class="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">${i18n.dict.actions.closeDay}</button>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي المقبوضات المحصلة', 'Total Collected Inflows')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-emerald-700 tabular-nums">${totalCollected.toLocaleString()} EGP</div>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي المصروفات', 'Total Outflows / Expenses')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-rose-700 tabular-nums">${totalExp.toLocaleString()} EGP</div>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('صافي النقدية والأرصدة', 'Net Cash Position')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-slate-900 tabular-nums">${netCash.toLocaleString()} EGP</div>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 p-5">
          <h2 class="text-sm font-bold text-slate-900 mb-3">${i18n.bi('سجل إغلاقات اليومية السابقة', 'Daily Closings Log')}</h2>
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500">
                <th class="py-2">${i18n.dict.common.date}</th>
                <th class="py-2">${i18n.bi('المبيعات', 'Invoices')}</th>
                <th class="py-2">${i18n.bi('النقدي المحصل', 'Cash Collected')}</th>
                <th class="py-2">${i18n.bi('المصروفات', 'Expenses')}</th>
                <th class="py-2">${i18n.bi('الصافي بالصندوق', 'Net Cash')}</th>
                <th class="py-2">${i18n.bi('أغلق بواسطة', 'Closed By')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${closings
                .map(
                  (c) => `
                  <tr>
                    <td class="py-2 font-mono tabular-nums">${c.date}</td>
                    <td class="py-2 font-mono tabular-nums">${c.totalInvoices}</td>
                    <td class="py-2 font-mono tabular-nums">${c.totalCollectedCash}</td>
                    <td class="py-2 font-mono tabular-nums">${c.totalExpenses}</td>
                    <td class="py-2 font-mono font-bold tabular-nums">${c.netCashInBox} EGP</td>
                    <td class="py-2">${c.closedBy} (${c.closedAt})</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('cb-print-btn')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.cashbox,
        `<table class="print-table"><thead><tr><th>Date</th><th>Total Invoices</th><th>Cash Collected</th><th>Expenses</th><th>Net Cash</th><th>Closed By</th></tr></thead><tbody>${closings.map((c) => `<tr><td class="tabular-nums">${c.date}</td><td class="tabular-nums">${c.totalInvoices}</td><td class="tabular-nums">${c.totalCollectedCash}</td><td class="tabular-nums">${c.totalExpenses}</td><td class="tabular-nums">${c.netCashInBox} EGP</td><td>${c.closedBy}</td></tr>`).join('')}</tbody></table>`
      );
    });

    document.getElementById('cb-close-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('closeDay', 'cashbox'))) return;
      const newClose: DailyClosing = {
        id: `dc_${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        totalInvoices: Math.round(invoices.reduce((s, i) => s + i.netTotal, 0)),
        totalCollectedCash: Math.round(totalCollected),
        totalCollectedCard: 0,
        totalCollectedBank: 0,
        totalExpenses: Math.round(totalExp),
        netCashInBox: Math.round(netCash),
        closedBy: user?.username || 'accountant',
        closedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
        notes: 'إغلاق يومية معتمد من الشاشة',
      };
      await accountingRepository.saveDailyClosing(newClose);
      await authService.logAudit('إغلاق اليومية المحاسبية', 'cashbox', newClose.id, `Net: ${newClose.netCashInBox} EGP`);
      showToast(i18n.bi('تم إغلاق اليومية وترحيل الأرصدة بنجاح', 'Daily closing completed'), 'success');
      renderAccountingPage(container, 'cashbox');
    });
    return;
  }

  // subView === 'reports' (Simplified Profit & Loss Statement)
  const totalInvoicedNet = invoices.reduce((s, i) => s + i.netTotal, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalCollected - totalExpenses;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.reports}</h1>
          <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('تقرير الأرباح والخسائر المبسط وتقارير الإيرادات والمصروفات', 'Simplified Profit & Loss (P&L), Revenue, and Expense Reports')}</p>
        </div>
        <button id="rep-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('إجمالي صافي الفواتير الصادرة', 'Total Invoiced Net')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-slate-900 tabular-nums">${totalInvoicedNet.toFixed(2)} EGP</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('الإيرادات المحصلة فعليًا', 'Collected Revenue')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-emerald-700 tabular-nums">${totalCollected.toFixed(2)} EGP</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('إجمالي المصروفات التشغيلية', 'Total Operating Expenses')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-rose-700 tabular-nums">${totalExpenses.toFixed(2)} EGP</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('صافي الربح التشغيلي', 'Net Operating Profit')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-sky-700 tabular-nums">${netProfit.toFixed(2)} EGP</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('rep-print-btn')?.addEventListener('click', () => {
    printService.printA4(
      i18n.dict.nav.reports,
      `
        <table class="print-table">
          <thead><tr><th>Statement Line</th><th>Amount (EGP)</th></tr></thead>
          <tbody>
            <tr><td>Total Invoiced Net</td><td class="tabular-nums">${totalInvoicedNet.toFixed(2)}</td></tr>
            <tr><td>Total Collected Revenue</td><td class="tabular-nums">${totalCollected.toFixed(2)}</td></tr>
            <tr><td>Total Operating Expenses</td><td class="tabular-nums">-${totalExpenses.toFixed(2)}</td></tr>
            <tr><td><strong>Net Operating Profit</strong></td><td class="tabular-nums"><strong>${netProfit.toFixed(2)} EGP</strong></td></tr>
          </tbody>
        </table>
      `
    );
  });
}
