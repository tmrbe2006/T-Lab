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
  permissionsRepository,
  patientsRepository,
  paymentsRepository,
} from '../../repositories';
import { accountingService } from '../../services/accounting.service';
import { commissionService } from '../../services/commission.service';
import { adjustUnpaidInvoice, computeInvoiceAdjustment, voidUnpaidInvoice } from '../../services/invoice-adjustment.service';
import { createManualInvoice } from '../../services/manual-invoice.service';
import { checkPaymentAllowance, paymentAllocation, type PaymentPayer } from '../../services/payment-allocation.service';
import { recordInvoiceReceipt } from '../../services/payment-processing.service';
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

  const openNewManualInvoiceModal = async () => {
    if (!(await enforcePermission('add','invoices'))) return;
    const cfg=await permissionsRepository.getSettings();
    const taxRate=cfg?.defaultTaxRate ?? 14;
    openCustomModal(i18n.bi('إضافة فاتورة خدمات جديدة','New Service Invoice'),
      `<form id="new-manual-invoice" class="space-y-3 text-sm">
        <p class="text-slate-600">${i18n.bi('لفواتير الخدمات المستقلة غير المرتبطة بطلب تحاليل. طلبات التحاليل تصدر فواتيرها تلقائيًا.', 'For independent services only. Lab requests already issue their own invoices.')}</p>
        <label class="block">${i18n.bi('المريض','Patient')}<select name="patientId" required class="block border rounded p-2 w-full mt-1"><option value="">—</option>
        ${patients.filter(p=>p.active).map(p=>`<option value="${p.id}">${p.name} — ${p.code}</option>`).join('')}</select></label>
        <label class="block">${i18n.bi('تاريخ الفاتورة','Invoice Date')}<input name="date" type="date" required value="${new Date().toLocaleDateString('en-CA')}" class="block border rounded p-2 w-full mt-1"/></label>
        <label class="block">${i18n.bi('وصف الخدمة','Service description')}<input name="serviceName" maxlength="200" required class="block border rounded p-2 w-full mt-1"/></label>
        <label class="block">${i18n.bi('سعر الخدمة','Service Amount')}<input name="price" type="number" min="0.01" step="0.01" required class="block border rounded p-2 w-full mt-1"/></label>
        <label class="block">${i18n.bi('قيمة الخصم الثابت','Fixed Discount')}<input name="discount" type="number" min="0" step="0.01" value="0" class="block border rounded p-2 w-full mt-1"/></label>
        <p class="text-sky-800 font-semibold">${i18n.bi('الضريبة من إعدادات البرنامج','Tax from settings')}: ${taxRate}%</p>
        <button type="submit" class="rounded bg-sky-700 text-white px-4 py-2 font-bold">${i18n.bi('تأكيد إنشاء الفاتورة والقيد','Create invoice and journal')}</button>
       </form>`,
       close=>{
         document.getElementById('new-manual-invoice')?.addEventListener('submit',async event=>{
           event.preventDefault();
           if(!(await enforcePermission('add','invoices')))return;
           const form=event.currentTarget as HTMLFormElement;
           const data=new FormData(form);
           const submit=form.querySelector<HTMLButtonElement>('button[type=submit]');
           if(submit)submit.disabled=true;
           try{
             const inv=await createManualInvoice({
               patientId:String(data.get('patientId')||''),date:String(data.get('date')||''),
               serviceName:String(data.get('serviceName')||''),price:Number(data.get('price')),
               discountAmount:Number(data.get('discount')||0),taxRate,
             },user?.username||'accountant');
             await authService.logAudit('إضافة فاتورة خدمات مستقلة: '+inv.invoiceNumber,'invoices',inv.id);
             close();
             invoices=await invoicesRepository.getAll();
             renderTable();
             showToast(i18n.bi('تم إصدار الفاتورة والقيد المتوازن','Invoice and journal created'),'success');
           }catch(error){showToast(String(error instanceof Error?error.message:error),'error');}
           finally{if(submit)submit.disabled=false;}
         });
       });
  };

  const openAddPaymentModal = async (inv: Invoice) => {
    if (inv.remainingAmount <= 0 || inv.status === 'cancelled') {
      showToast(i18n.bi('هذه الفاتورة مسددة بالكامل', 'Invoice is already paid in full'), 'warning');
      return;
    }

    const previousPayments = await paymentsRepository.getByInvoiceId(inv.id);
    const allocated = paymentAllocation(inv,previousPayments);
    if (allocated.unreconciled) {
      showToast(i18n.bi('هذه الفاتورة بها تحصيل سابق غير مطابق لسجل الدفعات. يجب المراجعة قبل أي تحصيل جديد.', 'Existing collections do not match payment records; reconcile them first.'),'warning');
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
          ${inv.contractId ? `
            <div class="rounded border border-indigo-200 bg-indigo-50 p-3 space-y-2">
              <p class="font-bold">${i18n.bi('المستحق على المريض','Patient Due')}: ${allocated.patientDue.toFixed(2)} EGP |
                ${i18n.bi('المطالبة على جهة التعاقد','Corporate Claim Due')}: ${allocated.companyDue.toFixed(2)} EGP</p>
              <label class="block">${i18n.bi('من الذي قام بالدفع؟','Who is paying?')}
                <select name="payerType" id="inv-pay-payer" class="block border rounded w-full p-2 mt-1">
                  <option value="patient">${i18n.bi('المريض','Patient')}</option>
                  <option value="contract">${i18n.bi('جهة التعاقد/التأمين','Corporate / Insurance')}</option>
                </select>
              </label>
            </div>` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('المبلغ المحصل الآن (EGP) *', 'Collected Amount (EGP) *')}</label>
              <input name="amount" type="number" min="0.01" max="${allocated.patientDue || allocated.companyDue}" step="0.01" required value="${allocated.patientDue || allocated.companyDue}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold" />
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
        const payerSel = document.getElementById('inv-pay-payer') as HTMLSelectElement | null;
        const amountInput = document.querySelector<HTMLInputElement>('#inv-pay-form input[name="amount"]');
        payerSel?.addEventListener('change', () => {
          const max = payerSel.value === 'contract' ? allocated.companyDue : allocated.patientDue;
          if(amountInput) { amountInput.max=String(max); amountInput.value=String(max); }
        });
        const form = document.getElementById('inv-pay-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission('addPayment', 'invoices'))) return;
          const fd = new FormData(form);
          let amt=0;
          const payerType:PaymentPayer=fd.get('payerType')==='contract'?'contract':'patient';
          try {
            amt=checkPaymentAllowance(inv,await paymentsRepository.getByInvoiceId(inv.id),
              payerType,Number(fd.get('amount')));
          } catch (error) {
            showToast(String(error instanceof Error ? error.message : error),'warning');
            return;
          }

          const method = (fd.get('method') as PaymentMethod) || 'cash';
          try {
            const receipt=await recordInvoiceReceipt({
              invoiceId:inv.id,payerType,amount:amt,method,
              actor:user?.username || 'accountant',notes:String(fd.get('notes')||'').trim(),
            });
            Object.assign(inv,receipt.invoice);
          } catch(error) {
            showToast(String(error instanceof Error?error.message:error),'error');
            return;
          }

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

  const markInvoicePaidImmediately = async (inv: Invoice) => {
    if (!(await enforcePermission('addPayment', 'invoices'))) return;
    if (inv.status === 'cancelled') return;
    if (inv.contractId && inv.status !== 'paid') {
      await openAddPaymentModal(inv);
      return;
    }

    if (inv.status === 'paid' && inv.remainingAmount <= 0) {
      showToast(i18n.bi('لا يمكن إلغاء تحصيل حقيقي بمجرد تغيير حالة الفاتورة؛ يلزم قيد عكسي موثق.', 'Paid status cannot be cleared without a documented payment reversal and matching journal.'),'warning');
      return;
    }

    const amount=Math.max(0,Math.round((inv.netTotal-inv.paidAmount)*100)/100);
    if(amount<=0)return;
    try {
      const receipt=await recordInvoiceReceipt({
        invoiceId:inv.id,payerType:'patient',amount,method:'cash',
        actor:user?.username || 'accountant',notes:'سداد كامل للفاتورة',
      });
      Object.assign(inv,receipt.invoice);
    } catch(error) {
      showToast(String(error instanceof Error?error.message:error),'error');
      return;
    }
    {
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
    }

    await authService.logAudit(
      `تأكيد سداد الفاتورة بالكامل (تم الدفع): ${inv.invoiceNumber}`,
      'invoices',
      inv.id
    );
    showToast(
      i18n.bi(
        `✅ تم تعديل حالة الفاتورة (${inv.invoiceNumber}) إلى مدفوعة بالكامل (${inv.netTotal} EGP)`,
        `Invoice ${inv.invoiceNumber} marked as Paid in full!`
      ),
      'success'
    );
    invoices = await invoicesRepository.getAll();
    renderTable();
  };

  const openEditInvoiceModal = async (inv: Invoice) => {
    if (inv.paidAmount > 0 || inv.status === 'paid' || inv.status === 'cancelled' || (await paymentsRepository.getByInvoiceId(inv.id)).length > 0) {
      showToast(i18n.bi('الفاتورة المحصلة تحتاج تسوية محاسبية وإشعار دائن قبل التعديل.', 'A collected invoice requires accounting reversal and credit note before changes.'), 'warning');
      return;
    }
    const settings = await permissionsRepository.getSettings();
    const vatRate = settings?.defaultTaxRate ?? 14;
    const pat = patMap.get(inv.patientId);
    openCustomModal(
      `${i18n.bi('✏️ تعديل بيانات الفاتورة:', '✏️ Edit Invoice:')} ${inv.invoiceNumber}`,
      `
        <form id="inv-edit-form" class="space-y-4 text-xs">
          <div class="rounded-lg bg-slate-100 p-3 flex flex-wrap items-center justify-between gap-2">
            <div><span class="text-slate-500">${i18n.bi('رقم الفاتورة:', 'Invoice #:')}</span> <strong class="font-mono text-slate-900">${inv.invoiceNumber}</strong></div>
            <div><span class="text-slate-500">${i18n.bi('المريض:', 'Patient:')}</span> <strong class="text-slate-900">${pat?.name || inv.patientId}</strong></div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('تاريخ الفاتورة *', 'Invoice Date *')}</label>
              <input name="date" type="date" required value="${inv.date}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الإجمالي قبل الخصم (Subtotal) *', 'Subtotal *')}</label>
              <input id="edit-inv-sub" name="subtotal" type="number" step="0.01" min="0" required value="${inv.subtotal}" readonly class=w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('قيمة الخصم (Discount)', 'Discount Amount')}</label>
              <input id="edit-inv-disc" name="discountAmount" type="number" step="0.01" min="0" value="${inv.discountAmount}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-amber-700" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('قيمة الضريبة (Tax)', 'Tax Amount')}</label>
              <input id="edit-inv-tax" name="taxAmount" type="number" step="0.01" min="0" value="${inv.taxAmount}" readonly class=w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-sky-700" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الصافي المطلوب (Net Total)', 'Net Total')}</label>
              <input id="edit-inv-net" name="netTotal" type="number" step="0.01" min="0" required value="${inv.netTotal}" readonly class=w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-extrabold text-slate-900" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('المبلغ المدفوع (Paid Amount)', 'Paid Amount')}</label>
              <input id="edit-inv-paid" name="paidAmount" type="number" step="0.01" min="0" required value="${inv.paidAmount}" readonly class=w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold text-emerald-700" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('طريقة الدفع', 'Payment Method')}</label>
              <select name="paymentMethod" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="cash" ${inv.paymentMethod === 'cash' ? 'selected' : ''}>${i18n.bi('نقدي (Cash)', 'Cash')}</option>
                <option value="card" ${inv.paymentMethod === 'card' ? 'selected' : ''}>${i18n.bi('بطاقة بنكية (POS Card)', 'POS Card')}</option>
                <option value="bank_transfer" ${inv.paymentMethod === 'bank_transfer' ? 'selected' : ''}>${i18n.bi('تحويل بنكي (Bank Transfer)', 'Bank Transfer')}</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('جهة التعاقد (إن وجدت)', 'Contract Name (Optional)')}</label>
              <input name="contractName" type="text" value="${inv.contractName || ''}" placeholder="${i18n.bi('نقدي / اسم النقابة أو الشركة', 'Cash / Corporate Contract')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              💾 ${i18n.bi('حفظ تعديلات الفاتورة', 'Save Invoice Changes')}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const subEl = document.getElementById('edit-inv-sub') as HTMLInputElement | null;
        const discEl = document.getElementById('edit-inv-disc') as HTMLInputElement | null;
        const taxEl = document.getElementById('edit-inv-tax') as HTMLInputElement | null;
        const netEl = document.getElementById('edit-inv-net') as HTMLInputElement | null;

        const recalcNet = () => {
          const math = computeInvoiceAdjustment(Number(subEl?.value) || 0,Number(discEl?.value) || 0,vatRate);
          if(taxEl)taxEl.value=String(math.taxAmount);
          if(netEl)netEl.value=String(math.netTotal);
        };
        subEl?.addEventListener('input', recalcNet);
        discEl?.addEventListener('input', recalcNet);
        taxEl?.addEventListener('input', recalcNet);
        recalcNet();

        const form = document.getElementById('inv-edit-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!(await enforcePermission('edit', 'invoices'))) return;
          const fd = new FormData(form);
          try {
            const adjusted = await adjustUnpaidInvoice(inv.id,Math.max(0,Number(fd.get('discountAmount')) || 0),
              vatRate,user?.username || 'accountant');
            await authService.logAudit('تعديل خصم وضريبة الفاتورة وربط الطلب والقيود: '+adjusted.invoiceNumber,'invoices',adjusted.id);
          } catch (error) {
            showToast(String(error instanceof Error ? error.message:error),'error');
            return;
          }
          showToast(
            i18n.bi(`تم حفظ تعديلات الفاتورة (${inv.invoiceNumber}) بنجاح`, `Invoice ${inv.invoiceNumber} updated`),
            'success'
          );
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
            ${can(user,'add','invoices') ? `<button id="inv-create" class="rounded bg-sky-700 text-white px-3.5 py-2 text-xs font-bold">${i18n.bi('إضافة فاتورة','Add Invoice')}</button>` : ''}
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
            { value: 'cancelled', label: i18n.bi('ملغاة','Cancelled') },
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
                        <div class="flex flex-wrap items-center gap-1.5">
                          <button type="button" data-edit-inv="${inv.id}" class="inv-edit-btn rounded-md border border-sky-600 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                            ✏️ ${i18n.bi('تعديل', 'Edit')}
                          </button>
                          <button type="button" data-del="${inv.id}" class="inv-del-btn rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                            🗑️ ${i18n.dict.actions.delete}
                          </button>
                          ${
                            inv.status !== 'paid' && inv.status !== 'cancelled' && inv.remainingAmount > 0
                              ? `<button type="button" data-mark-paid="${inv.id}" class="inv-mark-paid-btn rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer shadow-2xs">
                                  ✅ ${i18n.bi('تم الدفع', 'Mark Paid')}
                                </button>`
                              : ''
                          }
                          ${
                            canAddPay && inv.status !== 'cancelled' && inv.remainingAmount > 0
                              ? `<button type="button" data-pay="${inv.id}" class="inv-pay-btn rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100 font-bold cursor-pointer">
                                  💰 ${i18n.bi('دفعة جزئية', 'Partial Pay')}
                                </button>`
                              : ''
                          }
                          <button type="button" data-wa-inv="${inv.id}" class="inv-wa-btn rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-500 cursor-pointer">💬 واتساب</button>
                          ${
                            canPrint
                              ? `<button type="button" data-a4="${inv.id}" class="inv-a4-btn rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 hover:bg-sky-100 font-bold cursor-pointer">🖨️ A4</button>
                                 <button type="button" data-th="${inv.id}" class="inv-th-btn rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 hover:bg-indigo-100 font-bold cursor-pointer">receipt 80mm</button>`
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

    document.getElementById('inv-create')?.addEventListener('click', () => {void openNewManualInvoiceModal();});
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

    document.querySelectorAll<HTMLButtonElement>('.inv-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = invoices.find((x) => x.id === btn.getAttribute('data-edit-inv'));
        if (target) void openEditInvoiceModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-mark-paid-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = invoices.find((x) => x.id === btn.getAttribute('data-mark-paid'));
        if (target) void markInvoicePaidImmediately(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.inv-pay-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = invoices.find((x) => x.id === btn.getAttribute('data-pay'));
        if (target) void openAddPaymentModal(target);
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
            const recordedPayments = await paymentsRepository.getByInvoiceId(target.id);
            if (recordedPayments.length || target.paidAmount > 0) {
              showToast(i18n.bi('لا يجوز حذف فاتورة مرتبطة بدفعات. يلزم إلغاء محاسبي موثق.', 'Invoice linked to payments cannot be deleted without an audited reversal.'),'warning');
              return;
            }
            try {
              await voidUnpaidInvoice(target.id,reason||'إلغاء فاتورة',user?.username||'accountant');
              await authService.logAudit(`إلغاء فاتورة وقيدها المحاسبي: ${target.invoiceNumber}`, 'invoices', target.id, reason || '');
              showToast(i18n.bi('تم إلغاء الفاتورة وترحيل قيد عكسي مع حفظ السجل', 'Invoice cancelled with reversal journal and audit history'), 'success');
            } catch(error) {
              showToast(String(error instanceof Error?error.message:error),'error');
              return;
            }
            invoices = await invoicesRepository.getAll();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}
