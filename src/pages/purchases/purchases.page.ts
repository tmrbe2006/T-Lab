import { authService } from '../../auth/auth.service';
import {
  closeModal,
  emptyState,
  exportToCsv,
  formatCurrency,
  openModal,
  pageHeader,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { i18n } from '../../i18n';
import { inventoryService } from '../../services/inventory.service';
import { printService } from '../../print/print.service';
import type { PurchaseInvoice, ReturnNote } from '../../types';

type PurchasesTab =
  | 'purchaseInvoices'
  | 'suppliers'
  | 'supplierPayments'
  | 'returns'
  | 'contracts';

export async function renderPurchasesPage(container: HTMLElement): Promise<void> {
  let activeTab: PurchasesTab = 'purchaseInvoices';
  let selectedSupplierId = 'all';

  async function draw(): Promise<void> {
    const user = authService.getCurrentUser()!;
    const [purchaseInvoices, suppliers, returnNotes, items, invoices] = await Promise.all([
      db.purchaseInvoices.toArray(),
      db.suppliers.toArray(),
      db.returnNotes.toArray(),
      db.inventoryItems.toArray(),
      db.invoices.toArray(),
    ]);

    const totalPurchasesEgp = purchaseInvoices.reduce(
      (s, p) => s + Math.round(p.netTotal * (p.exchangeRate || 1)),
      0
    );
    const totalSuppliersBalance = suppliers.reduce((s, sup) => s + sup.currentBalance, 0);
    const pendingReceiptCount = purchaseInvoices.filter((p) => !p.stockReceived).length;

    const tabs: Array<{ id: PurchasesTab; labelAr: string; labelEn: string; badge?: number }> = [
      {
        id: 'purchaseInvoices',
        labelAr: 'فواتير المشتريات والاستلام المخزني',
        labelEn: 'Purchase Invoices',
        badge: purchaseInvoices.length,
      },
      {
        id: 'suppliers',
        labelAr: 'سجل الموردين وكشوف الحساب',
        labelEn: 'Suppliers & Statements',
        badge: suppliers.length,
      },
      {
        id: 'supplierPayments',
        labelAr: 'سداد مستحقات الموردين',
        labelEn: 'Supplier Payments',
      },
      {
        id: 'returns',
        labelAr: 'المرتجعات وإشعارات دائن/مدين',
        labelEn: 'Returns & Credit/Debit Notes',
        badge: returnNotes.length,
      },
      {
        id: 'contracts',
        labelAr: 'فواتير التعاقدات والعملات المتعددة',
        labelEn: 'Contract & Multi-Currency Billing',
      },
    ];

    container.innerHTML = `
      ${pageHeader(
        i18n.bi('نظام المشتريات والموردين والمرتجعات المتقدم', 'Purchases, Suppliers & Returns Management'),
        i18n.bi(
          'إدارة أوامر وفواتير الشراء متعدّدة العملات، الاستلام المخزني الآلي للدفعات، كشوف حسابات الموردين، وإشعارات المرتجعات',
          'Multi-currency purchase invoices, automated warehouse lot receipt, supplier statements, and credit/debit return notes'
        ),
        `
          <button id="btn-new-purchase-inv" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer">
            + ${i18n.bi('فاتورة مشتريات جديدة', 'New Purchase Invoice')}
          </button>
          <button id="btn-new-return-note" class="rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500 cursor-pointer">
            + ${i18n.bi('إشعار مرتجع / دائن / مدين', 'New Return / Credit Note')}
          </button>
          <button id="btn-export-purchases" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
            CSV
          </button>
        `
      )}

      <!-- Summary KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">إجمالي فواتير المشتريات (بالجنيه)</div>
          <div class="text-xl font-bold text-slate-900 mt-1">${formatCurrency(totalPurchasesEgp)}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${purchaseInvoices.length} فاتورة مسجلة</div>
        </div>
        <div class="rounded-xl border border-rose-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">إجمالي مديونية الموردين المستحقة</div>
          <div class="text-xl font-bold text-rose-600 mt-1">${formatCurrency(totalSuppliersBalance)}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${suppliers.length} مورد معتمد</div>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
          <div class="text-xs text-amber-800 font-semibold">فواتير بانتظار الاستلام المخزني</div>
          <div class="text-xl font-bold text-amber-700 mt-1">${pendingReceiptCount}</div>
          <div class="text-[11px] text-amber-700 mt-0.5">اضغط "استلام المخزون" لإضافة الدفعات</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">إشعارات المرتجعات والتسويات</div>
          <div class="text-xl font-bold text-sky-700 mt-1">${returnNotes.length}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">مبيعات / مشتريات / دائن / مدين</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 mb-5">
        ${tabs
          .map(
            (t) => `
            <button
              type="button"
              data-purch-tab="${t.id}"
              class="px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === t.id
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }"
            >
              <span>${i18n.bi(t.labelAr, t.labelEn)}</span>
              ${
                t.badge !== undefined
                  ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                    }">${t.badge}</span>`
                  : ''
              }
            </button>
          `
          )
          .join('')}
      </div>

      <div id="purchases-tab-body"></div>
    `;

    const tabBody = document.getElementById('purchases-tab-body')!;

    if (activeTab === 'purchaseInvoices') {
      tabBody.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2.5 text-start">رقم الفاتورة / أمر الشراء</th>
                <th class="px-3 py-2.5 text-start">المورد</th>
                <th class="px-3 py-2.5 text-start">التاريخ / الاستحقاق</th>
                <th class="px-3 py-2.5 text-start">العملة والصافي</th>
                <th class="px-3 py-2.5 text-start">المدفوع / المتبقي</th>
                <th class="px-3 py-2.5 text-start">حالة الاستلام المخزني</th>
                <th class="px-3 py-2.5 text-start">الإجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${purchaseInvoices
                .map(
                  (p) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-mono">
                      <div class="font-bold text-slate-900">${p.invoiceNumber}</div>
                      <div class="text-[11px] text-slate-500">مورد: ${p.supplierInvoiceNumber} | ${p.purchaseOrderNumber ?? ''}</div>
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="font-semibold text-slate-900">${p.supplierName}</div>
                      <div class="text-[11px] text-slate-500">${p.items.length} بنود (${p.items.map((i) => i.lotNumber).join(', ')})</div>
                    </td>
                    <td class="px-3 py-2.5 font-mono">
                      <div>${p.date}</div>
                      <div class="text-[11px] text-slate-500">استحقاق: ${p.dueDate}</div>
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="font-bold text-slate-900">${p.netTotal.toLocaleString()} ${p.currency}</div>
                      ${
                        p.currency !== 'EGP'
                          ? `<div class="text-[11px] text-sky-700">سعر الصرف: ${p.exchangeRate} (${formatCurrency(p.netTotal * p.exchangeRate)})</div>`
                          : `<div class="text-[11px] text-slate-500">ضريبة 14%: ${formatCurrency(p.taxAmount)}</div>`
                      }
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="text-emerald-700 font-semibold">مدفوع: ${p.paidAmount.toLocaleString()} ${p.currency}</div>
                      <div class="text-rose-600 font-semibold">متبقي: ${p.remainingAmount.toLocaleString()} ${p.currency}</div>
                    </td>
                    <td class="px-3 py-2.5">
                      ${
                        p.stockReceived
                          ? `<span class="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 font-semibold">✅ تم الاستلام وإضافة الدفعات</span>`
                          : `<span class="px-2 py-1 rounded-md bg-amber-100 text-amber-800 font-semibold">⏳ بانتظار الاستلام المخزني</span>`
                      }
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="flex flex-wrap gap-1">
                        ${
                          !p.stockReceived
                            ? `<button type="button" data-purch-receive="${p.id}" class="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 cursor-pointer">
                                📥 استلام المخزون
                              </button>`
                            : ''
                        }
                        <button type="button" data-print-pinv="${p.id}" class="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
                          طباعة A4
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'suppliers') {
      const filteredInvoices =
        selectedSupplierId === 'all'
          ? purchaseInvoices
          : purchaseInvoices.filter((p) => p.supplierId === selectedSupplierId);

      tabBody.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          ${suppliers
            .map(
              (s) => `
              <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs font-bold text-sky-700">${s.code}</span>
                    <span class="text-amber-500 text-xs">${'★'.repeat(s.rating)}</span>
                  </div>
                  <h4 class="font-bold text-sm text-slate-900 mt-1">${s.nameAr}</h4>
                  <p class="text-[11px] text-slate-500">${s.nameEn}</p>
                  <div class="mt-2 space-y-1 text-xs text-slate-600">
                    <div>الرقم الضريبي: <span class="font-mono">${s.taxNumber}</span> | س.ت: <span class="font-mono">${s.commercialRegister}</span></div>
                    <div>مسؤول التواصل: ${s.contactPerson} (${s.phone})</div>
                    <div>شروط الدفع: <strong>${s.paymentTermsDays} يوم</strong> | حد الائتمان: ${formatCurrency(s.creditLimit)}</div>
                  </div>
                </div>
                <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span class="text-[11px] text-slate-500">الرصيد المستحق:</span>
                    <strong class="text-xs text-rose-600 ms-1">${formatCurrency(s.currentBalance)}</strong>
                  </div>
                  <button type="button" data-filter-supplier="${s.id}" class="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer">
                    كشف حساب المورد
                  </button>
                </div>
              </div>
            `
            )
            .join('')}
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-slate-900">كشف حساب حركات وفواتير الموردين</h3>
            <select id="sup-statement-select" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white">
              <option value="all">جميع الموردين</option>
              ${suppliers
                .map(
                  (s) =>
                    `<option value="${s.id}" ${selectedSupplierId === s.id ? 'selected' : ''}>${s.nameAr}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th class="px-3 py-2 text-start">رقم الفاتورة</th>
                  <th class="px-3 py-2 text-start">المورد</th>
                  <th class="px-3 py-2 text-start">التاريخ</th>
                  <th class="px-3 py-2 text-start">إجمالي الفاتورة (دائن)</th>
                  <th class="px-3 py-2 text-start">المسدد (مدين)</th>
                  <th class="px-3 py-2 text-start">الرصيد المتبقي</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filteredInvoices
                  .map(
                    (f) => `
                    <tr>
                      <td class="px-3 py-2 font-mono font-bold">${f.invoiceNumber}</td>
                      <td class="px-3 py-2">${f.supplierName}</td>
                      <td class="px-3 py-2 font-mono">${f.date}</td>
                      <td class="px-3 py-2 font-semibold">${f.netTotal} ${f.currency}</td>
                      <td class="px-3 py-2 text-emerald-700 font-semibold">${f.paidAmount} ${f.currency}</td>
                      <td class="px-3 py-2 text-rose-600 font-bold">${f.remainingAmount} ${f.currency}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (activeTab === 'supplierPayments') {
      const unpaidPInvs = purchaseInvoices.filter((p) => p.remainingAmount > 0);
      tabBody.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-1">تسجيل سند صرف / سداد مستحقات مورد</h3>
            <p class="text-xs text-slate-500 mb-4">يتم تخفيض مديونية المورد وتحديث حالة فاتورة الشراء وتوليد قيد اليومية (من حـ/ الموردين 2.1.1 إلى حـ/ البنك أو الصندوق) آليًا.</p>
            ${
              unpaidPInvs.length === 0
                ? emptyState('جميع فواتير المشتريات مسددة بالكامل')
                : `
                <form id="supplier-payment-form" class="space-y-3 text-xs">
                  <div>
                    <label class="block font-semibold text-slate-700 mb-1">اختر فاتورة الشراء المستحقة</label>
                    <select name="pinvId" required class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                      ${unpaidPInvs
                        .map(
                          (p) =>
                            `<option value="${p.id}">${p.invoiceNumber} - ${p.supplierName} (المتبقي: ${p.remainingAmount} ${p.currency})</option>`
                        )
                        .join('')}
                    </select>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block font-semibold text-slate-700 mb-1">المبلغ المسدد</label>
                      <input name="amount" type="number" step="0.01" min="1" value="${unpaidPInvs[0]?.remainingAmount ?? 100}" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
                    </div>
                    <div>
                      <label class="block font-semibold text-slate-700 mb-1">طريقة الدفع</label>
                      <select name="method" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                        <option value="bank_transfer">تحويل بنكي / شيك (1102)</option>
                        <option value="cash">نقدًا من الصندوق (1101)</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" class="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
                    اعتماد سند الصرف للمورد وتوليد القيد المحاسبي
                  </button>
                </form>
              `
            }
          </div>

          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-3">ملخص الذمم الدائنة للموردين</h3>
            <div class="space-y-2 text-xs">
              ${suppliers
                .map(
                  (s) => `
                  <div class="flex items-center justify-between border-b border-slate-100 py-2">
                    <div>
                      <div class="font-semibold text-slate-900">${s.nameAr}</div>
                      <div class="text-[11px] text-slate-500">فترة الائتمان: ${s.paymentTermsDays} يوم</div>
                    </div>
                    <span class="font-bold ${s.currentBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}">${formatCurrency(s.currentBalance)}</span>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;
    } else if (activeTab === 'returns') {
      const typeBadges: Record<ReturnNote['type'], string> = {
        sales_return: '↩️ إشعار مرتجع مبيعات (Sales Return)',
        purchase_return: '📦 إشعار مرتجع مشتريات (Purchase Return)',
        credit_note: '🟢 إشعار دائن للعميل (Credit Note)',
        debit_note: '🟠 إشعار مدين للمورد (Debit Note)',
      };

      tabBody.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2.5 text-start">رقم الإشعار</th>
                <th class="px-3 py-2.5 text-start">نوع الإشعار</th>
                <th class="px-3 py-2.5 text-start">الفاتورة الأصلية</th>
                <th class="px-3 py-2.5 text-start">العميل / المورد</th>
                <th class="px-3 py-2.5 text-start">السبب والبنود</th>
                <th class="px-3 py-2.5 text-start">الصافي شامل الضريبة</th>
                <th class="px-3 py-2.5 text-start">طريقة التسوية</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${returnNotes
                .map(
                  (r) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-mono font-bold text-slate-900">${r.noteNumber}</td>
                    <td class="px-3 py-2.5 font-semibold">${typeBadges[r.type]}</td>
                    <td class="px-3 py-2.5 font-mono text-sky-700">${r.originalInvoiceNumber}</td>
                    <td class="px-3 py-2.5 font-semibold">${r.partyName}</td>
                    <td class="px-3 py-2.5">
                      <div class="text-slate-800">${r.reason}</div>
                      <div class="text-[11px] text-slate-500">${r.items.map((i) => i.descriptionAr).join('، ')}</div>
                    </td>
                    <td class="px-3 py-2.5 font-bold text-rose-600">${formatCurrency(r.netTotal)}</td>
                    <td class="px-3 py-2.5">${r.refundMethod === 'cash' ? 'رد نقدي فوري' : 'خصم من رصيد الحساب'}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'contracts') {
      tabBody.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white p-5 mb-4">
          <h3 class="text-sm font-bold text-slate-900 mb-1">فواتير التعاقدات والتأمين الطبي والعملات المتعددة (Multi-Currency & B2B Contracts)</h3>
          <p class="text-xs text-slate-500 mb-4">يدعم النظام التسعير التعاقدي لشركات التأمين والنقابات المهنية مع حساب حصة المريض وحصة جهة التعاقد وأسعار الصرف للعملات الأجنبية.</p>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-4">
            <div class="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div class="text-slate-500">الجنيه المصري (EGP)</div>
              <div class="text-base font-bold text-slate-900 mt-0.5">عملة الأساس (1.00)</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div class="text-slate-500">الدولار الأمريكي (USD)</div>
              <div class="text-base font-bold text-sky-700 mt-0.5">49.50 ج.م</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div class="text-slate-500">اليورو الأوروبي (EUR)</div>
              <div class="text-base font-bold text-sky-700 mt-0.5">53.20 ج.م</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div class="text-slate-500">الريال السعودي (SAR)</div>
              <div class="text-base font-bold text-sky-700 mt-0.5">13.20 ج.م</div>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start border border-slate-200 rounded-lg">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-3 py-2 text-start">رقم الفاتورة</th>
                  <th class="px-3 py-2 text-start">التاريخ</th>
                  <th class="px-3 py-2 text-start">الإجمالي قبل الخصم</th>
                  <th class="px-3 py-2 text-start">الخصم التعاقدي</th>
                  <th class="px-3 py-2 text-start">ضريبة القيمة المضافة</th>
                  <th class="px-3 py-2 text-start">الصافي بالجنيه</th>
                  <th class="px-3 py-2 text-start">المعادل بالدولار (USD)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${invoices
                  .slice(0, 12)
                  .map(
                    (inv) => `
                    <tr>
                      <td class="px-3 py-2 font-mono font-bold">${inv.invoiceNumber}</td>
                      <td class="px-3 py-2 font-mono">${inv.date}</td>
                      <td class="px-3 py-2">${formatCurrency(inv.subtotal)}</td>
                      <td class="px-3 py-2 text-amber-700 font-semibold">${formatCurrency(inv.discountAmount)}</td>
                      <td class="px-3 py-2">${formatCurrency(inv.taxAmount)}</td>
                      <td class="px-3 py-2 font-bold text-slate-900">${formatCurrency(inv.netTotal)}</td>
                      <td class="px-3 py-2 font-mono text-sky-700">$${(inv.netTotal / 49.5).toFixed(2)} USD</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Bind Tab Switch
    container.querySelectorAll<HTMLButtonElement>('[data-purch-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.purchTab as PurchasesTab;
        draw();
      });
    });

    // Receive Stock from Purchase Invoice
    container.querySelectorAll<HTMLButtonElement>('[data-purch-receive]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await inventoryService.receivePurchaseInvoiceStock(
            btn.dataset.purchReceive!,
            user.username
          );
          showToast(
            `تم استلام المخزون بنجاح (${res.lotsCreated.length} دفعة) وتوليد القيد المحاسبي (${res.journalEntry.entryNumber})`,
            'success'
          );
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Print Purchase Invoice A4
    container.querySelectorAll<HTMLButtonElement>('[data-print-pinv]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pinv = purchaseInvoices.find((p) => p.id === btn.dataset.printPinv);
        if (!pinv) return;
        const settings = (await db.settings.get('default'))!;
        printService.printHtmlDocument(
          `فاتورة مشتريات ${pinv.invoiceNumber}`,
          `
            <div style="font-family: Cairo, sans-serif; direction: rtl; padding: 18px;">
              <h2 style="margin:0 0 6px;">${settings.labNameAr} — فاتورة مشتريات وتوريد مخزني</h2>
              <p style="margin:0 0 12px; font-size:12px;">رقم الفاتورة: <strong>${pinv.invoiceNumber}</strong> | المورد: <strong>${pinv.supplierName}</strong> | التاريخ: ${pinv.date} | العملة: ${pinv.currency}</p>
              <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="border:1px solid #cbd5e1; padding:6px;">الصنف</th>
                    <th style="border:1px solid #cbd5e1; padding:6px;">رقم الدفعة Lot</th>
                    <th style="border:1px solid #cbd5e1; padding:6px;">تاريخ الانتهاء</th>
                    <th style="border:1px solid #cbd5e1; padding:6px;">الكمية</th>
                    <th style="border:1px solid #cbd5e1; padding:6px;">سعر الوحدة</th>
                    <th style="border:1px solid #cbd5e1; padding:6px;">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  ${pinv.items
                    .map(
                      (l) => `
                      <tr>
                        <td style="border:1px solid #cbd5e1; padding:6px;">${l.itemNameAr}</td>
                        <td style="border:1px solid #cbd5e1; padding:6px;">${l.lotNumber}</td>
                        <td style="border:1px solid #cbd5e1; padding:6px;">${l.expiryDate}</td>
                        <td style="border:1px solid #cbd5e1; padding:6px;">${l.quantity}</td>
                        <td style="border:1px solid #cbd5e1; padding:6px;">${l.unitPrice} ${pinv.currency}</td>
                        <td style="border:1px solid #cbd5e1; padding:6px;">${l.netTotal} ${pinv.currency}</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
              <div style="font-size:13px; font-weight:bold;">الصافي الإجمالي: ${pinv.netTotal} ${pinv.currency} | المدفوع: ${pinv.paidAmount} | المتبقي: ${pinv.remainingAmount}</div>
            </div>
          `
        );
      });
    });

    // Filter supplier statement
    container.querySelectorAll<HTMLButtonElement>('[data-filter-supplier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedSupplierId = btn.dataset.filterSupplier!;
        draw();
      });
    });

    document.getElementById('sup-statement-select')?.addEventListener('change', (e) => {
      selectedSupplierId = (e.target as HTMLSelectElement).value;
      draw();
    });

    // Supplier payment submission
    document
      .getElementById('supplier-payment-form')
      ?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const pinvId = String(fd.get('pinvId'));
        const amount = Number(fd.get('amount')) || 0;
        const method = String(fd.get('method'));

        const pinv = await db.purchaseInvoices.get(pinvId);
        if (!pinv) return;
        const payAmt = Math.min(pinv.remainingAmount, amount);
        const newPaid = Math.round((pinv.paidAmount + payAmt) * 100) / 100;
        const newRem = Math.round((pinv.netTotal - newPaid) * 100) / 100;

        await db.purchaseInvoices.put({
          ...pinv,
          paidAmount: newPaid,
          remainingAmount: newRem,
          status: newRem <= 0 ? 'paid' : 'partial',
        });

        const sup = await db.suppliers.get(pinv.supplierId);
        const egpAmt = Math.round(payAmt * (pinv.exchangeRate || 1) * 100) / 100;
        if (sup) {
          await db.suppliers.put({
            ...sup,
            currentBalance: Math.max(0, Math.round((sup.currentBalance - egpAmt) * 100) / 100),
          });
        }

        await db.journalEntries.put({
          id: `je_sup_pay_${Date.now()}`,
          entryNumber: `JE-SPAY-${Date.now().toString().slice(-5)}`,
          date: '2026-11-10',
          entryType: 'auto',
          referenceType: 'supplier_payment',
          referenceId: pinv.id,
          status: 'posted',
          descriptionAr: `سداد مستحقات مورد (${pinv.supplierName}) عن فاتورة ${pinv.invoiceNumber}`,
          descriptionEn: `Supplier Payment (${pinv.supplierName}) for ${pinv.invoiceNumber}`,
          lines: [
            { accountCode: '2.1.1', accountNameAr: 'الموردون والدائنون التجاريون', accountNameEn: 'Suppliers Payable', debit: egpAmt, credit: 0 },
            {
              accountCode: method === 'cash' ? '1101' : '1102',
              accountNameAr: method === 'cash' ? 'الصندوق النقدي الرئيسي' : 'البنك والحسابات الجارية',
              accountNameEn: method === 'cash' ? 'Main Cashbox' : 'Bank Account',
              debit: 0,
              credit: egpAmt,
            },
          ],
          totalDebit: egpAmt,
          totalCredit: egpAmt,
          createdBy: user.username,
        });

        showToast(`تم تسجيل دفعة المورد بمبلغ ${formatCurrency(egpAmt)} وتوليد القيد المحاسبي`, 'success');
        await draw();
      });

    // New Purchase Invoice Modal
    document.getElementById('btn-new-purchase-inv')?.addEventListener('click', () => {
      openModal(
        'إنشاء فاتورة مشتريات جديدة (مع استلام الدفعات المخزنية)',
        `
          <form id="modal-new-pinv-form" class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label class="block font-semibold mb-1">المورد</label>
              <select name="supplierId" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                ${suppliers.map((s) => `<option value="${s.id}">${s.nameAr}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">الصنف المشترى</label>
              <select name="itemId" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                ${items.map((i) => `<option value="${i.id}">${i.code} - ${i.nameAr}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">رقم الدفعة (Lot Number)</label>
              <input name="lotNumber" required value="LOT-26P-${Math.floor(100 + Math.random() * 899)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
            </div>
            <div>
              <label class="block font-semibold mb-1">تاريخ انتهاء الصلاحية</label>
              <input name="expiryDate" type="date" value="2027-10-30" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">الكمية</label>
              <input name="quantity" type="number" min="1" value="100" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">سعر الوحدة</label>
              <input name="unitPrice" type="number" step="0.1" value="5.5" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">العملة</label>
              <select name="currency" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                <option value="EGP">جنيه مصري (EGP)</option>
                <option value="USD">دولار أمريكي (USD - 49.5)</option>
                <option value="EUR">يورو (EUR - 53.2)</option>
              </select>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 font-semibold text-emerald-800 cursor-pointer">
                <input type="checkbox" name="receiveNow" checked />
                <span>استلام المخزون وتوليد القيد المحاسبي فورًا</span>
              </label>
            </div>
            <div class="md:col-span-2 flex justify-end gap-2 pt-3">
              <button type="submit" class="rounded-lg bg-sky-600 px-4 py-2 text-white font-semibold hover:bg-sky-500 cursor-pointer">حفظ فاتورة الشراء</button>
            </div>
          </form>
        `
      );

      document
        .getElementById('modal-new-pinv-form')
        ?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const sup = suppliers.find((s) => s.id === String(fd.get('supplierId'))) ?? suppliers[0];
          const itm = items.find((i) => i.id === String(fd.get('itemId'))) ?? items[0];
          const qty = Number(fd.get('quantity')) || 100;
          const price = Number(fd.get('unitPrice')) || itm.unitCost;
          const currency = String(fd.get('currency')) as PurchaseInvoice['currency'];
          const exchangeRate = currency === 'USD' ? 49.5 : currency === 'EUR' ? 53.2 : 1;
          const sub = Math.round(qty * price * 100) / 100;
          const tax = Math.round(sub * 0.14 * 100) / 100;
          const net = Math.round((sub + tax) * 100) / 100;
          const pinvId = `pinv_${Date.now()}`;

          const newPinv: PurchaseInvoice = {
            id: pinvId,
            invoiceNumber: `PINV-2026-${purchaseInvoices.length + 401}`,
            supplierInvoiceNumber: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
            purchaseOrderNumber: `PO-2026-${purchaseInvoices.length + 201}`,
            supplierId: sup.id,
            supplierName: sup.nameAr,
            date: '2026-11-10',
            dueDate: '2026-12-10',
            currency,
            exchangeRate,
            items: [
              {
                id: `line_${Date.now()}`,
                itemId: itm.id,
                itemCode: itm.code,
                itemNameAr: itm.nameAr,
                itemNameEn: itm.nameEn,
                lotNumber: String(fd.get('lotNumber')),
                productionDate: '2026-08-01',
                expiryDate: String(fd.get('expiryDate')),
                quantity: qty,
                unitPrice: price,
                discountAmount: 0,
                taxRate: 14,
                taxAmount: tax,
                netTotal: net,
                storageLocation: 'المخزن الرئيسي M-01',
              },
            ],
            subtotal: sub,
            discountAmount: 0,
            taxRate: 14,
            taxAmount: tax,
            shippingCost: 0,
            netTotal: net,
            paidAmount: 0,
            remainingAmount: net,
            paymentMethod: 'credit',
            status: 'unpaid',
            stockReceived: false,
            createdBy: user.username,
            notes: 'فاتورة مشتريات مسجلة',
          };

          await db.purchaseInvoices.put(newPinv);
          if (fd.get('receiveNow')) {
            await inventoryService.receivePurchaseInvoiceStock(pinvId, user.username);
          }

          closeModal();
          showToast('تم حفظ فاتورة المشتريات بنجاح', 'success');
          await draw();
        });
    });

    // New Return / Credit / Debit Note Modal
    document.getElementById('btn-new-return-note')?.addEventListener('click', () => {
      openModal(
        'إصدار إشعار مرتجع / إشعار دائن / إشعار مدين',
        `
          <form id="modal-new-return-form" class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label class="block font-semibold mb-1">نوع الإشعار</label>
              <select name="type" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                <option value="sales_return">إشعار مرتجع مبيعات (Sales Return)</option>
                <option value="purchase_return">إشعار مرتجع مشتريات (Purchase Return)</option>
                <option value="credit_note">إشعار دائن للعميل (Credit Note)</option>
                <option value="debit_note">إشعار مدين للمورد (Debit Note)</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">رقم الفاتورة الأصلية</label>
              <input name="originalInvoiceNumber" required value="INV-2026-3005" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
            </div>
            <div>
              <label class="block font-semibold mb-1">اسم المريض / المورد</label>
              <input name="partyName" required value="عمر فاروق الجندي" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">المبلغ قبل الضريبة</label>
              <input name="subtotal" type="number" min="10" value="250" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div class="md:col-span-2">
              <label class="block font-semibold mb-1">سبب الإشعار / المرتجع</label>
              <input name="reason" required value="إلغاء تحليل قبل سحب العينة ورد المبلغ للمريض" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div class="md:col-span-2 flex justify-end pt-2">
              <button type="submit" class="rounded-lg bg-amber-600 px-4 py-2 text-white font-semibold hover:bg-amber-500 cursor-pointer">إصدار الإشعار وتوليد قيد التسوية</button>
            </div>
          </form>
        `
      );

      document
        .getElementById('modal-new-return-form')
        ?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const sub = Number(fd.get('subtotal')) || 100;
          const tax = Math.round(sub * 0.14 * 100) / 100;
          const net = Math.round((sub + tax) * 100) / 100;
          const type = String(fd.get('type')) as ReturnNote['type'];

          await db.returnNotes.put({
            id: `ret_${Date.now()}`,
            noteNumber: `RN-2026-00${returnNotes.length + 1}`,
            type,
            originalInvoiceId: 'inv_5',
            originalInvoiceNumber: String(fd.get('originalInvoiceNumber')),
            partyId: 'pat_5',
            partyName: String(fd.get('partyName')),
            date: '2026-11-10',
            reason: String(fd.get('reason')),
            items: [
              {
                descriptionAr: String(fd.get('reason')),
                descriptionEn: 'Return / Adjustment Item',
                quantity: 1,
                unitPrice: sub,
                taxAmount: tax,
                totalAmount: net,
              },
            ],
            subtotal: sub,
            taxAmount: tax,
            netTotal: net,
            refundMethod: 'cash',
            status: 'approved',
            createdBy: user.username,
          });

          closeModal();
          showToast('تم إصدار الإشعار واعتماده بنجاح', 'success');
          activeTab = 'returns';
          await draw();
        });
    });

    // Export CSV
    document.getElementById('btn-export-purchases')?.addEventListener('click', () => {
      exportToCsv(
        'purchase-invoices.csv',
        ['Invoice_No', 'Supplier', 'Date', 'Currency', 'Net_Total', 'Paid', 'Remaining', 'Stock_Received'],
        purchaseInvoices.map((p) => [
          p.invoiceNumber,
          p.supplierName,
          p.date,
          p.currency,
          p.netTotal,
          p.paidAmount,
          p.remainingAmount,
          p.stockReceived ? 'Yes' : 'No',
        ])
      );
    });
  }

  await draw();
}
