import { authService } from '../../auth/auth.service';
import {
  closeModal,
  formatCurrency,
  openModal,
  pageHeader,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { i18n } from '../../i18n';
import {
  ACCOUNTING_MAPPINGS,
  erpAccountingService,
} from '../../services/erp-accounting.service';
import { printService } from '../../print/print.service';

type ErpAccTab =
  | 'coa'
  | 'journal'
  | 'ledgerAndClosing'
  | 'statements'
  | 'agingAndTax'
  | 'integrationTracer';

export async function renderErpAccountingPage(container: HTMLElement): Promise<void> {
  let activeTab: ErpAccTab = 'statements';
  let selectedLedgerAccount = '1101';
  let traceQuery = 'REQ-2026-1001';

  async function draw(): Promise<void> {
    const user = authService.getCurrentUser()!;
    const [
      accounts,
      entries,
      costCenters,
      periodLocks,
      trialBalance,
      statements,
      aging,
      chainResult,
      boms,
      tests,
    ] = await Promise.all([
      db.chartOfAccounts.toArray(),
      db.journalEntries.toArray(),
      db.costCenters.toArray(),
      db.periodLocks.toArray(),
      erpAccountingService.generateTrialBalance(),
      erpAccountingService.generateFinancialStatements(),
      erpAccountingService.generateAgingReports(),
      erpAccountingService.traceDocumentChain(traceQuery),
      db.testBOMs.toArray(),
      db.tests.toArray(),
    ]);

    const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
    const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));

    const tabs: Array<{ id: ErpAccTab; labelAr: string; labelEn: string; badge?: number }> = [
      {
        id: 'statements',
        labelAr: 'القوائم المالية وميزان المراجعة',
        labelEn: 'Financial Statements & Trial Balance',
      },
      {
        id: 'coa',
        labelAr: 'دليل الحسابات الهرمي (IFRS)',
        labelEn: 'IFRS Chart of Accounts',
        badge: accounts.length,
      },
      {
        id: 'journal',
        labelAr: 'دفتر اليومية والقيود العكسية',
        labelEn: 'General Journal & Reversals',
        badge: entries.length,
      },
      {
        id: 'ledgerAndClosing',
        labelAr: 'الأستاذ العام ومراكز التكلفة وإقفال الفترات',
        labelEn: 'Ledger, Cost Centers & Period Lock',
      },
      {
        id: 'agingAndTax',
        labelAr: 'أعمار الديون والإقرار الضريبي وربحية التحاليل',
        labelEn: 'Aging, VAT Return & Profitability',
      },
      {
        id: 'integrationTracer',
        labelAr: 'التكامل الشامل وتتبع سلسلة المستندات',
        labelEn: 'End-to-End Integration & Audit Trail',
      },
    ];

    container.innerHTML = `
      ${pageHeader(
        i18n.bi('المحاسبة المتقدمة والقوائم المالية وفق معايير IFRS', 'Advanced IFRS Financial Accounting & Statements'),
        i18n.bi(
          'القيد المزدوج المتوازن، شجرة الحسابات الهرمية، مراكز التكلفة، القوائم المالية الختامية، وتتبع سلسلة المستندات المتكاملة',
          'Double-entry bookkeeping, hierarchical Chart of Accounts, cost centers, financial statements, and end-to-end audit trail'
        ),
        `
          <button id="btn-add-manual-je" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer">
            + ${i18n.bi('قيد يومية مزدوج جديد', 'New Double-Entry Journal')}
          </button>
          <button id="btn-print-financial-stmt" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
            ${i18n.bi('طباعة القوائم المالية A4', 'Print Financial Statements A4')}
          </button>
        `
      )}

      <!-- Financial KPI Bar -->
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">صافي الإيرادات</div>
          <div class="text-lg font-bold text-slate-900 mt-1">${formatCurrency(statements.incomeStatement.netRevenue)}</div>
          <div class="text-[11px] text-emerald-700 mt-0.5">مجمل الربح: ${statements.incomeStatement.grossMarginPercent}%</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">تكلفة الكواشف والمستهلكات (COGS)</div>
          <div class="text-lg font-bold text-amber-700 mt-1">${formatCurrency(statements.incomeStatement.totalCOGS)}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">مرتبط بقوائم BOM</div>
        </div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
          <div class="text-xs text-emerald-800 font-semibold">صافي الربح القابل للتوزيع</div>
          <div class="text-lg font-bold text-emerald-700 mt-1">${formatCurrency(statements.incomeStatement.netProfit)}</div>
          <div class="text-[11px] text-emerald-700 mt-0.5">هامش صافي الربح: ${statements.incomeStatement.netMarginPercent}%</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">إجمالي الأصول (الميزانية)</div>
          <div class="text-lg font-bold text-sky-700 mt-1">${formatCurrency(statements.balanceSheet.totalAssets)}</div>
          <div class="text-[11px] text-emerald-700 mt-0.5">${statements.balanceSheet.isBalanced ? 'الأصول = الخصوم + الملكية ✅' : ''}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">توازن ميزان المراجعة</div>
          <div class="text-lg font-bold text-emerald-700 mt-1">${formatCurrency(trialBalance.totalDebitMovement)}</div>
          <div class="text-[11px] text-emerald-700 mt-0.5">المدين = الدائن تمامًا ✅</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">صافي التدفق النقدي التشغيلي</div>
          <div class="text-lg font-bold text-slate-900 mt-1">${formatCurrency(statements.cashFlow.netOperatingCashFlow)}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">نقدية وبنوك: ${formatCurrency(statements.cashFlow.closingCashBalance)}</div>
        </div>
      </div>

      <!-- Sub-Tabs -->
      <div class="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 mb-5">
        ${tabs
          .map(
            (t) => `
            <button
              type="button"
              data-erp-tab="${t.id}"
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

      <div id="erp-acc-tab-body"></div>
    `;

    const tabBody = document.getElementById('erp-acc-tab-body')!;

    if (activeTab === 'statements') {
      const inc = statements.incomeStatement;
      const bs = statements.balanceSheet;
      const cf = statements.cashFlow;

      tabBody.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <!-- 1. Income Statement -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5 mb-3">1) قائمة الدخل الشاملة (Income Statement)</h3>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between"><span>إجمالي إيرادات التحاليل الطبية</span><strong class="text-slate-900">${formatCurrency(inc.grossRevenue)}</strong></div>
              <div class="flex justify-between text-rose-600"><span>(-) خصومات ومردودات المبيعات</span><span>(${formatCurrency(inc.salesReturnsAndDiscounts)})</span></div>
              <div class="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-sky-800"><span>= صافي الإيرادات التشغيلية</span><span>${formatCurrency(inc.netRevenue)}</span></div>
              <div class="flex justify-between text-slate-600 pt-1"><span>(-) تكلفة الكواشف المستهلكة (COGS)</span><span>(${formatCurrency(inc.reagentsCOGS)})</span></div>
              <div class="flex justify-between text-slate-600"><span>(-) تكلفة الأنابيب والمستهلكات</span><span>(${formatCurrency(inc.consumablesCOGS)})</span></div>
              <div class="flex justify-between text-slate-600"><span>(-) خسائر تلف وانتهاء صلاحية المخزون</span><span>(${formatCurrency(inc.expiredStockWriteOff)})</span></div>
              <div class="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-emerald-700"><span>= مجمل الربح (Gross Profit - ${inc.grossMarginPercent}%)</span><span>${formatCurrency(inc.grossProfit)}</span></div>
              <div class="flex justify-between text-slate-600 pt-1"><span>(-) مصروف عمولات الأطباء المحولين</span><span>(${formatCurrency(inc.doctorCommissions)})</span></div>
              <div class="flex justify-between text-slate-600"><span>(-) الرواتب والأجور</span><span>(${formatCurrency(inc.salariesAndWages)})</span></div>
              <div class="flex justify-between text-slate-600"><span>(-) الإيجار والمرافق (كهرباء ومياه)</span><span>(${formatCurrency(inc.rentAndUtilities)})</span></div>
              <div class="flex justify-between text-slate-600"><span>(-) صيانة الأجهزة ومصروفات إدارية</span><span>(${formatCurrency(inc.maintenanceAndAdmin)})</span></div>
              <div class="flex justify-between border-t-2 border-slate-300 pt-2 text-sm font-bold text-emerald-800 bg-emerald-50/70 px-2 py-1.5 rounded">
                <span>= صافي ربح الفترة (${inc.netMarginPercent}%)</span>
                <span>${formatCurrency(inc.netProfit)}</span>
              </div>
            </div>
          </div>

          <!-- 2. Balance Sheet -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5 mb-3">2) الميزانية العمومية (Balance Sheet)</h3>
            <div class="space-y-2 text-xs">
              <div class="font-bold text-sky-800">الأصول المتداولة (Current Assets):</div>
              <div class="flex justify-between ps-2"><span>النقدية بالصندوق والبنوك</span><span>${formatCurrency(bs.cashAndBanks)}</span></div>
              <div class="flex justify-between ps-2"><span>ذمم المرضى وشركات التأمين</span><span>${formatCurrency(bs.accountsReceivable)}</span></div>
              <div class="flex justify-between ps-2"><span>قيمة مخزون الكواشف والمستهلكات</span><span>${formatCurrency(bs.inventoryValue)}</span></div>
              <div class="flex justify-between ps-2"><span>ضريبة القيمة المضافة للمشتريات (مدخلات)</span><span>${formatCurrency(bs.vatInputReceivable)}</span></div>
              <div class="flex justify-between font-semibold border-t border-slate-100 pt-1"><span>إجمالي الأصول المتداولة</span><span>${formatCurrency(bs.totalCurrentAssets)}</span></div>
              <div class="flex justify-between font-semibold"><span>صافي الأصول الثابتة (الأجهزة بعد الإهلاك)</span><span>${formatCurrency(bs.netFixedAssets)}</span></div>
              <div class="flex justify-between font-bold text-sky-900 bg-sky-50 px-2 py-1 rounded"><span>إجمالي الأصول (Total Assets)</span><span>${formatCurrency(bs.totalAssets)}</span></div>

              <div class="font-bold text-rose-800 pt-1">الخصوم وحقوق الملكية:</div>
              <div class="flex justify-between ps-2"><span>ذمم الموردين والدائنين</span><span>${formatCurrency(bs.suppliersPayable)}</span></div>
              <div class="flex justify-between ps-2"><span>ضريبة مخرجات مستحقة + عمولات أطباء + رواتب</span><span>${formatCurrency(bs.vatOutputPayable + bs.doctorsCommissionsPayable + bs.accruedSalaries)}</span></div>
              <div class="flex justify-between ps-2"><span>رأس المال والأرباح المحتجزة وصافي الربح</span><span>${formatCurrency(bs.totalEquity)}</span></div>
              <div class="flex justify-between font-bold text-emerald-900 bg-emerald-50 px-2 py-1.5 rounded border-t-2 border-slate-300">
                <span>إجمالي الخصوم وحقوق الملكية</span>
                <span>${formatCurrency(bs.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>

          <!-- 3. Cash Flow Statement -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5 mb-3">3) قائمة التدفقات النقدية (Cash Flow)</h3>
            <div class="space-y-2 text-xs">
              <div class="font-bold text-slate-800">الأنشطة التشغيلية (Operating):</div>
              <div class="flex justify-between ps-2 text-emerald-700"><span>(+) المقبوضات النقدية من المرضى والعملاء</span><span>${formatCurrency(cf.cashFromPatients)}</span></div>
              <div class="flex justify-between ps-2 text-rose-600"><span>(-) المدفوعات النقدية للموردين</span><span>(${formatCurrency(cf.cashPaidToSuppliers)})</span></div>
              <div class="flex justify-between ps-2 text-rose-600"><span>(-) المدفوعات للمصروفات والرواتب</span><span>(${formatCurrency(cf.cashPaidForExpenses)})</span></div>
              <div class="flex justify-between ps-2 text-rose-600"><span>(-) المدفوعات لعمولات الأطباء</span><span>(${formatCurrency(cf.cashPaidForCommissions)})</span></div>
              <div class="flex justify-between font-bold border-t border-slate-100 pt-1.5"><span>= صافي التدفق النقدي التشغيلي</span><span>${formatCurrency(cf.netOperatingCashFlow)}</span></div>
              <div class="flex justify-between text-slate-600 pt-1"><span>صافي التدفق الاستثماري (شراء تجهيزات)</span><span>${formatCurrency(cf.netInvestingCashFlow)}</span></div>
              <div class="flex justify-between text-slate-600"><span>رصيد النقدية والبنوك أول المدة</span><span>${formatCurrency(cf.openingCashBalance)}</span></div>
              <div class="flex justify-between font-bold text-sky-900 bg-sky-50 px-2 py-1.5 rounded border-t-2 border-slate-300 mt-2">
                <span>= رصيد النقدية والبنوك آخر المدة</span>
                <span>${formatCurrency(cf.closingCashBalance)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Trial Balance Table -->
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">4) ميزان المراجعة بالمجاميع والأرصدة (Trial Balance)</h3>
              <p class="text-xs text-slate-500">يتحقق النظام آليًا من قاعدة القيد المزدوج: إجمالي الحركات والأرصدة المدينة = إجمالي الحركات والأرصدة الدائنة</p>
            </div>
            <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              ✅ متوازن بالكامل: المدين (${formatCurrency(trialBalance.totalDebitBalance)}) = الدائن (${formatCurrency(trialBalance.totalCreditBalance)})
            </span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start border border-slate-200">
              <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th class="px-3 py-2 text-start">رقم الحساب</th>
                  <th class="px-3 py-2 text-start">اسم الحساب</th>
                  <th class="px-3 py-2 text-start">النوع</th>
                  <th class="px-3 py-2 text-start">إجمالي حركة مدين</th>
                  <th class="px-3 py-2 text-start">إجمالي حركة دائن</th>
                  <th class="px-3 py-2 text-start">رصيد مدين</th>
                  <th class="px-3 py-2 text-start">رصيد دائن</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${trialBalance.rows
                  .map(
                    (r) => `
                    <tr class="hover:bg-slate-50">
                      <td class="px-3 py-2 font-mono font-bold">${r.code}</td>
                      <td class="px-3 py-2 font-semibold text-slate-900">${r.nameAr}</td>
                      <td class="px-3 py-2 uppercase text-[11px] text-slate-500">${r.type}</td>
                      <td class="px-3 py-2 font-mono">${formatCurrency(r.debitMovement)}</td>
                      <td class="px-3 py-2 font-mono">${formatCurrency(r.creditMovement)}</td>
                      <td class="px-3 py-2 font-mono font-bold text-emerald-700">${r.debitBalance > 0 ? formatCurrency(r.debitBalance) : '-'}</td>
                      <td class="px-3 py-2 font-mono font-bold text-sky-700">${r.creditBalance > 0 ? formatCurrency(r.creditBalance) : '-'}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
              <tfoot class="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colspan="3" class="px-3 py-2.5">الإجمالي العام لميزان المراجعة</td>
                  <td class="px-3 py-2.5 font-mono text-emerald-800">${formatCurrency(trialBalance.totalDebitMovement)}</td>
                  <td class="px-3 py-2.5 font-mono text-sky-800">${formatCurrency(trialBalance.totalCreditMovement)}</td>
                  <td class="px-3 py-2.5 font-mono text-emerald-800">${formatCurrency(trialBalance.totalDebitBalance)}</td>
                  <td class="px-3 py-2.5 font-mono text-sky-800">${formatCurrency(trialBalance.totalCreditBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    } else if (activeTab === 'coa') {
      tabBody.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4 flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-900">شجرة الحسابات الهرمية متعددة المستويات (IFRS Hierarchical Chart of Accounts - Levels 1..4)</h3>
            <p class="text-xs text-slate-500">يمنع النظام حذف أي حساب رئيسي له فروع أو أي حساب فرعي مسجل عليه قيود محاسبية.</p>
          </div>
        </div>
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2.5 text-start">كود الحساب</th>
                <th class="px-3 py-2.5 text-start">اسم الحساب (عربي / إنجليزي)</th>
                <th class="px-3 py-2.5 text-start">المستوى</th>
                <th class="px-3 py-2.5 text-start">التصنيف المالي</th>
                <th class="px-3 py-2.5 text-start">الرصيد الدفتري</th>
                <th class="px-3 py-2.5 text-start">التحقق والحذف</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${sortedAccounts
                .map((acc) => {
                  const lvl = acc.level ?? 3;
                  const indentPx = (lvl - 1) * 18;
                  return `
                    <tr class="${acc.isGroup ? 'bg-slate-50/80 font-bold' : 'hover:bg-slate-50'}">
                      <td class="px-3 py-2 font-mono font-bold text-slate-800">${acc.code}</td>
                      <td class="px-3 py-2" style="padding-inline-start: ${12 + indentPx}px;">
                        <span class="text-slate-900">${acc.isGroup ? '📂 ' : '📄 '}${acc.nameAr}</span>
                        <span class="text-[11px] text-slate-400 ms-2">${acc.nameEn}</span>
                      </td>
                      <td class="px-3 py-2 font-mono text-slate-500">L${lvl}</td>
                      <td class="px-3 py-2 uppercase text-[11px] font-semibold text-sky-700">${acc.type}</td>
                      <td class="px-3 py-2 font-mono font-bold">${formatCurrency(acc.balance)}</td>
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          data-try-delete-acc="${acc.code}"
                          class="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-100 cursor-pointer"
                        >
                          اختبار الحذف الآمن
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'journal') {
      tabBody.innerHTML = `
        <div class="space-y-3">
          ${sortedEntries
            .slice(0, 35)
            .map(
              (je) => `
              <div class="rounded-xl border ${
                je.status === 'reversed' ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'
              } p-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-2.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-mono text-xs font-bold text-sky-700">${je.entryNumber}</span>
                    <span class="text-xs font-bold text-slate-900">${je.descriptionAr}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${
                      je.status === 'reversed'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }">${je.status === 'reversed' ? 'معكوس (Reversed)' : 'مرحل (Posted)'}</span>
                    ${
                      je.costCenter
                        ? `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">مركز تكلفة: ${je.costCenter}</span>`
                        : ''
                    }
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-slate-500">${je.date}</span>
                    ${
                      je.status !== 'reversed' && je.entryType !== 'reversal'
                        ? `<button
                            type="button"
                            data-reverse-je="${je.id}"
                            class="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                          >
                            ↩️ عكس القيد (Reverse)
                          </button>`
                        : ''
                    }
                  </div>
                </div>
                <table class="w-full text-xs">
                  <thead class="text-slate-500">
                    <tr>
                      <th class="py-1 text-start">كود الحساب</th>
                      <th class="py-1 text-start">اسم الحساب</th>
                      <th class="py-1 text-start">مدين (Debit)</th>
                      <th class="py-1 text-start">دائن (Credit)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                    ${je.lines
                      .map(
                        (l) => `
                        <tr>
                          <td class="py-1 font-mono font-semibold">${l.accountCode}</td>
                          <td class="py-1">${l.accountNameAr}</td>
                          <td class="py-1 font-mono font-bold text-emerald-700">${l.debit > 0 ? formatCurrency(l.debit) : '-'}</td>
                          <td class="py-1 font-mono font-bold text-sky-700">${l.credit > 0 ? formatCurrency(l.credit) : '-'}</td>
                        </tr>
                      `
                      )
                      .join('')}
                  </tbody>
                  <tfoot class="border-t border-slate-200 font-bold">
                    <tr>
                      <td colspan="2" class="py-1">الإجمالي المتوازن</td>
                      <td class="py-1 font-mono text-emerald-800">${formatCurrency(je.totalDebit)}</td>
                      <td class="py-1 font-mono text-sky-800">${formatCurrency(je.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            `
            )
            .join('')}
        </div>
      `;
    } else if (activeTab === 'ledgerAndClosing') {
      const ledgerLines = sortedEntries.flatMap((je) =>
        je.lines
          .filter((l) => l.accountCode === selectedLedgerAccount)
          .map((l) => ({
            entryNumber: je.entryNumber,
            date: je.date,
            desc: je.descriptionAr,
            debit: l.debit,
            credit: l.credit,
          }))
      );

      tabBody.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <!-- Cost Centers -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-3">مراكز التكلفة لأقسام المختبر (Cost Centers & Budget vs Actual)</h3>
            <div class="space-y-3 text-xs">
              ${costCenters
                .map((cc) => {
                  const pct = Math.min(100, Math.round((cc.actualSpent / cc.budgetMonthly) * 100));
                  return `
                    <div class="rounded-lg border border-slate-200 p-3">
                      <div class="flex justify-between font-bold text-slate-900 mb-1">
                        <span>${cc.code} — ${cc.nameAr}</span>
                        <span>${formatCurrency(cc.actualSpent)} / ${formatCurrency(cc.budgetMonthly)} (${pct}%)</span>
                      </div>
                      <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full bg-sky-600" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>

          <!-- Period Closing Locks -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-1">إقفال الفترات المالية الشهرية والسنوية (Period Closing Lock)</h3>
            <p class="text-xs text-slate-500 mb-3">عند قفل الفترة المالية يمنع النظام إضافة أو تعديل أو عكس أي قيد محاسبي يقع تاريخه داخل الشهر المقفل.</p>
            <div class="space-y-2.5 text-xs">
              ${periodLocks
                .map(
                  (pl) => `
                  <div class="rounded-lg border border-slate-200 p-3 flex items-center justify-between">
                    <div>
                      <div class="font-bold font-mono text-sm text-slate-900">${pl.periodMonth}</div>
                      <div class="text-slate-500">${pl.notes || ''}</div>
                    </div>
                    <button
                      type="button"
                      data-toggle-period-lock="${pl.id}"
                      class="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                        pl.locked
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }"
                    >
                      ${pl.locked ? '🔒 مقفلة (اضغط للفتح)' : '🔓 مفتوحة (اضغط للإقفال)'}
                    </button>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- General Ledger Account Filter -->
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 class="text-sm font-bold text-slate-900">دفتر الأستاذ العام التفصيلي (General Ledger)</h3>
            <select id="gl-account-select" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white">
              ${sortedAccounts
                .filter((a) => !a.isGroup)
                .map(
                  (a) =>
                    `<option value="${a.code}" ${selectedLedgerAccount === a.code ? 'selected' : ''}>${a.code} - ${a.nameAr}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start border border-slate-200">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-3 py-2 text-start">رقم القيد</th>
                  <th class="px-3 py-2 text-start">التاريخ</th>
                  <th class="px-3 py-2 text-start">البيان</th>
                  <th class="px-3 py-2 text-start">مدين</th>
                  <th class="px-3 py-2 text-start">دائن</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${ledgerLines
                  .slice(0, 25)
                  .map(
                    (l) => `
                    <tr>
                      <td class="px-3 py-2 font-mono font-bold">${l.entryNumber}</td>
                      <td class="px-3 py-2 font-mono">${l.date}</td>
                      <td class="px-3 py-2">${l.desc}</td>
                      <td class="px-3 py-2 font-mono text-emerald-700 font-bold">${l.debit > 0 ? formatCurrency(l.debit) : '-'}</td>
                      <td class="px-3 py-2 font-mono text-sky-700 font-bold">${l.credit > 0 ? formatCurrency(l.credit) : '-'}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (activeTab === 'agingAndTax') {
      const vatOut = statements.balanceSheet.vatOutputPayable;
      const vatIn = statements.balanceSheet.vatInputReceivable;
      const netVatPayable = Math.round((vatOut - vatIn) * 100) / 100;

      tabBody.innerHTML = `
        <!-- VAT Tax Return Card -->
        <div class="rounded-xl border border-sky-200 bg-sky-50/40 p-5 mb-5">
          <h3 class="text-sm font-bold text-slate-900 mb-2">الإقرار الضريبي لضريبة القيمة المضافة (VAT Return Summary - 14%)</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div class="rounded-lg bg-white p-3.5 border border-slate-200">
              <div class="text-slate-500">ضريبة المخرجات المحصلة على فواتير المبيعات (2101)</div>
              <div class="text-lg font-bold text-rose-600 mt-1">${formatCurrency(vatOut)}</div>
            </div>
            <div class="rounded-lg bg-white p-3.5 border border-slate-200">
              <div class="text-slate-500">(-) ضريبة المدخلات القابلة للخصم على المشتريات (1.1.4.2)</div>
              <div class="text-lg font-bold text-emerald-700 mt-1">${formatCurrency(vatIn)}</div>
            </div>
            <div class="rounded-lg bg-white p-3.5 border border-sky-300">
              <div class="text-slate-700 font-semibold">= صافي الضريبة المستحقة السداد لمصلحة الضرائب</div>
              <div class="text-lg font-bold text-sky-800 mt-1">${formatCurrency(netVatPayable)}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <!-- AR Aging -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-3">تقرير أعمار ديون العملاء والمرضى (AR Aging)</h3>
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-2 py-2 text-start">المريض / العميل</th>
                  <th class="px-2 py-2 text-start">0-30 يوم</th>
                  <th class="px-2 py-2 text-start">31-60 يوم</th>
                  <th class="px-2 py-2 text-start">>60 يوم</th>
                  <th class="px-2 py-2 text-start">الإجمالي</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${aging.receivablesAging
                  .slice(0, 10)
                  .map(
                    (r) => `
                    <tr>
                      <td class="px-2 py-2 font-semibold">${r.partyName}</td>
                      <td class="px-2 py-2 font-mono">${formatCurrency(r.current0to30)}</td>
                      <td class="px-2 py-2 font-mono">${formatCurrency(r.days31to60)}</td>
                      <td class="px-2 py-2 font-mono">${formatCurrency(r.days61to90 + r.over90)}</td>
                      <td class="px-2 py-2 font-mono font-bold text-rose-600">${formatCurrency(r.totalDue)}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <!-- AP Aging -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-3">تقرير أعمار ديون الموردين (AP Aging)</h3>
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-2 py-2 text-start">المورد</th>
                  <th class="px-2 py-2 text-start">0-30 يوم</th>
                  <th class="px-2 py-2 text-start">31-60 يوم</th>
                  <th class="px-2 py-2 text-start">>60 يوم</th>
                  <th class="px-2 py-2 text-start">الإجمالي</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${aging.payablesAging
                  .map(
                    (r) => `
                    <tr>
                      <td class="px-2 py-2 font-semibold">${r.partyName}</td>
                      <td class="px-2 py-2 font-mono">${formatCurrency(r.current0to30)}</td>
                      <td class="px-2 py-2 font-mono">${formatCurrency(r.days31to60)}</td>
                      <td class="px-2 py-2 font-mono">${formatCurrency(r.days61to90 + r.over90)}</td>
                      <td class="px-2 py-2 font-mono font-bold text-rose-600">${formatCurrency(r.totalDue)}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Test Profitability Report -->
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <h3 class="text-sm font-bold text-slate-900 mb-3">تحليل ربحية التحاليل الطبية ومقارنة سعر البيع بتكلفة قوائم المواد (Test Profitability Analysis)</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-3 py-2 text-start">كود التحليل</th>
                  <th class="px-3 py-2 text-start">اسم التحليل</th>
                  <th class="px-3 py-2 text-start">سعر البيع للمريض</th>
                  <th class="px-3 py-2 text-start">تكلفة مواد الـ BOM الفعلية</th>
                  <th class="px-3 py-2 text-start">عمالة وتشغيل مباشر</th>
                  <th class="px-3 py-2 text-start">صافي ربح التحليل</th>
                  <th class="px-3 py-2 text-start">هامش الربح %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${boms
                  .slice(0, 12)
                  .map((bom) => {
                    const tst = tests.find((t) => t.id === bom.testId);
                    const price = tst?.price ?? 180;
                    const totalCost =
                      bom.directMaterialCost + bom.laborCostEstimate + bom.overheadCostEstimate;
                    const profit = Math.round((price - totalCost) * 100) / 100;
                    const margin = Math.round((profit / price) * 100);
                    return `
                      <tr>
                        <td class="px-3 py-2 font-mono font-bold">${bom.testCode}</td>
                        <td class="px-3 py-2 font-semibold">${bom.testNameAr}</td>
                        <td class="px-3 py-2 font-bold">${formatCurrency(price)}</td>
                        <td class="px-3 py-2 text-amber-700">${formatCurrency(bom.directMaterialCost)}</td>
                        <td class="px-3 py-2 text-slate-600">${formatCurrency(bom.laborCostEstimate + bom.overheadCostEstimate)}</td>
                        <td class="px-3 py-2 font-bold text-emerald-700">${formatCurrency(profit)}</td>
                        <td class="px-3 py-2"><span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">${margin}%</span></td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (activeTab === 'integrationTracer') {
      tabBody.innerHTML = `
        <!-- Document Chain Audit Trail Tracer -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 mb-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 class="text-sm font-bold text-slate-900">تتبع سلسلة المستندات المتكاملة (Document Chain & Audit Trail Tracer)</h3>
              <p class="text-xs text-slate-500">أدخل رقم طلب تحليل (مثل REQ-2026-1001) أو رقم فاتورة مشتريات (مثل PINV-2026-401) لتتبع السلسلة الكاملة من الألف إلى الياء</p>
            </div>
            <div class="flex items-center gap-2">
              <input
                id="trace-doc-input"
                type="text"
                value="${traceQuery}"
                placeholder="مثال: REQ-2026-1001 أو PINV-2026-401"
                class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono w-64"
              />
              <button
                id="btn-run-trace"
                type="button"
                class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer"
              >
                🔍 تتبع السلسلة
              </button>
              <button
                id="btn-trace-purchase"
                type="button"
                class="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                تجربة تتبع فاتورة شراء (PINV-2026-401)
              </button>
            </div>
          </div>

          <div class="space-y-2.5">
            ${chainResult.steps
              .map(
                (step) => `
                <div class="rounded-lg border border-sky-200 bg-sky-50/30 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div class="font-bold text-sky-900">${step.stage}</div>
                    <div class="text-slate-700 mt-0.5">${step.details}</div>
                  </div>
                  <div class="text-end font-mono">
                    <div class="font-bold text-slate-900">${step.docNumber}</div>
                    <div class="text-[11px] text-emerald-700">${step.amountOrQty} · ${step.date}</div>
                  </div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>

        <!-- Automatic Accounting Integration Mapping Rules -->
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <h3 class="text-sm font-bold text-slate-900 mb-3">قواعد التوجيه المحاسبي الآلي بين الأنظمة (ACCOUNTING_MAPPINGS Engine)</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start border border-slate-200">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="px-3 py-2 text-start">العملية التشغيلية / المخزنية</th>
                  <th class="px-3 py-2 text-start">الحساب المدين (Debit)</th>
                  <th class="px-3 py-2 text-start">الحساب الدائن (Credit)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${ACCOUNTING_MAPPINGS.map(
                  (m) => `
                  <tr>
                    <td class="px-3 py-2 font-bold text-slate-900">${m.titleAr} <span class="text-slate-400 font-mono text-[11px]">(${m.operation})</span></td>
                    <td class="px-3 py-2 font-semibold text-emerald-700"><span class="font-mono">${m.debitAccountCode}</span> — ${m.debitAccountNameAr}</td>
                    <td class="px-3 py-2 font-semibold text-sky-700"><span class="font-mono">${m.creditAccountCode}</span> — ${m.creditAccountNameAr}</td>
                  </tr>
                `
                ).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Bind Tab Switch
    container.querySelectorAll<HTMLButtonElement>('[data-erp-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.erpTab as ErpAccTab;
        draw();
      });
    });

    // Safe Account Delete Verification
    container.querySelectorAll<HTMLButtonElement>('[data-try-delete-acc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.tryDeleteAcc!;
        const check = await erpAccountingService.canDeleteAccount(code);
        if (!check.allowed) {
          showToast(`حماية النظام: ${check.reasonAr}`, 'warning');
        } else {
          showToast(`الحساب (${code}) لا يحتوي على حركات ويمكن حذفه بأمان`, 'info');
        }
      });
    });

    // Reverse Journal Entry
    container.querySelectorAll<HTMLButtonElement>('[data-reverse-je]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const rev = await erpAccountingService.reverseJournalEntry(
            btn.dataset.reverseJe!,
            user.username
          );
          showToast(
            `تم عكس القيد المحاسبي بنجاح وتوليد القيد العكسي رقم (${rev.entryNumber})`,
            'success'
          );
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Toggle Period Lock
    container.querySelectorAll<HTMLButtonElement>('[data-toggle-period-lock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pl = periodLocks.find((p) => p.id === btn.dataset.togglePeriodLock);
        if (!pl) return;
        await db.periodLocks.put({
          ...pl,
          locked: !pl.locked,
          closedBy: user.username,
          closedAt: '2026-11-10 15:00',
        });
        showToast(
          !pl.locked
            ? `تم قفل الفترة المالية (${pl.periodMonth}) ومنع التعديل عليها`
            : `تم إعادة فتح الفترة المالية (${pl.periodMonth})`,
          'info'
        );
        await draw();
      });
    });

    // General Ledger Select
    document.getElementById('gl-account-select')?.addEventListener('change', (e) => {
      selectedLedgerAccount = (e.target as HTMLSelectElement).value;
      draw();
    });

    // Document Chain Tracer
    document.getElementById('btn-run-trace')?.addEventListener('click', () => {
      const inp = document.getElementById('trace-doc-input') as HTMLInputElement | null;
      if (inp && inp.value.trim()) {
        traceQuery = inp.value.trim();
        draw();
      }
    });

    document.getElementById('btn-trace-purchase')?.addEventListener('click', () => {
      traceQuery = 'PINV-2026-401';
      draw();
    });

    // Add Manual Double-Entry Journal Modal
    document.getElementById('btn-add-manual-je')?.addEventListener('click', () => {
      openModal(
        'إنشاء قيد يومية مزدوج جديد (Double-Entry Validation)',
        `
          <form id="modal-manual-je-form" class="space-y-3 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block font-semibold mb-1">تاريخ القيد</label>
                <input name="date" type="date" value="2026-11-10" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label class="block font-semibold mb-1">مركز التكلفة</label>
                <select name="costCenter" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                  ${costCenters.map((c) => `<option value="${c.code}">${c.code} - ${c.nameAr}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block font-semibold mb-1">نوع القيد</label>
                <select name="entryType" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                  <option value="manual">قيد يدوي (Manual)</option>
                  <option value="adjustment">قيد تسوية (Adjustment)</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block font-semibold mb-1">بيان وشرح القيد</label>
              <input name="descriptionAr" required value="قيد تسوية مصروفات تشغيل ومعايرة أجهزة المختبر" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-200 pt-3">
              <div class="rounded-lg bg-emerald-50/60 p-3 border border-emerald-200">
                <div class="font-bold text-emerald-900 mb-2">الطرف المدين (Debit)</div>
                <select name="debitAccount" class="w-full rounded border border-slate-300 px-2 py-1.5 bg-white mb-2">
                  ${sortedAccounts
                    .filter((a) => !a.isGroup)
                    .map((a) => `<option value="${a.code}">${a.code} - ${a.nameAr}</option>`)
                    .join('')}
                </select>
                <input name="debitAmount" type="number" step="0.01" value="1500" required class="w-full rounded border border-slate-300 px-2 py-1.5 font-mono" />
              </div>
              <div class="rounded-lg bg-sky-50/60 p-3 border border-sky-200">
                <div class="font-bold text-sky-900 mb-2">الطرف الدائن (Credit)</div>
                <select name="creditAccount" class="w-full rounded border border-slate-300 px-2 py-1.5 bg-white mb-2">
                  ${sortedAccounts
                    .filter((a) => !a.isGroup)
                    .map(
                      (a) =>
                        `<option value="${a.code}" ${a.code === '1101' ? 'selected' : ''}>${a.code} - ${a.nameAr}</option>`
                    )
                    .join('')}
                </select>
                <input name="creditAmount" type="number" step="0.01" value="1500" required class="w-full rounded border border-slate-300 px-2 py-1.5 font-mono" />
              </div>
            </div>
            <div class="flex justify-end pt-2">
              <button type="submit" class="rounded-lg bg-sky-600 px-4 py-2 text-white font-semibold hover:bg-sky-500 cursor-pointer">تحقق من التوازن وترحيل القيد</button>
            </div>
          </form>
        `
      );

      document
        .getElementById('modal-manual-je-form')
        ?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const drCode = String(fd.get('debitAccount'));
          const crCode = String(fd.get('creditAccount'));
          const drAcc = sortedAccounts.find((a) => a.code === drCode);
          const crAcc = sortedAccounts.find((a) => a.code === crCode);
          const drAmt = Number(fd.get('debitAmount')) || 0;
          const crAmt = Number(fd.get('creditAmount')) || 0;

          try {
            const je = await erpAccountingService.createJournalEntry({
              date: String(fd.get('date')),
              entryType: String(fd.get('entryType')) as 'manual' | 'adjustment',
              costCenter: String(fd.get('costCenter')),
              descriptionAr: String(fd.get('descriptionAr')),
              descriptionEn: String(fd.get('descriptionAr')),
              createdBy: user.username,
              lines: [
                {
                  accountCode: drCode,
                  accountNameAr: drAcc?.nameAr ?? drCode,
                  accountNameEn: drAcc?.nameEn ?? drCode,
                  debit: drAmt,
                  credit: 0,
                },
                {
                  accountCode: crCode,
                  accountNameAr: crAcc?.nameAr ?? crCode,
                  accountNameEn: crAcc?.nameEn ?? crCode,
                  debit: 0,
                  credit: crAmt,
                },
              ],
            });
            closeModal();
            showToast(`تم ترحيل القيد المتوازن بنجاح (${je.entryNumber})`, 'success');
            activeTab = 'journal';
            await draw();
          } catch (err) {
            showToast((err as Error).message, 'error');
          }
        });
    });

    // Print Financial Statements A4
    document.getElementById('btn-print-financial-stmt')?.addEventListener('click', async () => {
      const settings = (await db.settings.get('default'))!;
      const inc = statements.incomeStatement;
      const bs = statements.balanceSheet;
      printService.printHtmlDocument(
        'القوائم المالية الختامية وميزان المراجعة',
        `
          <div style="font-family: Cairo, sans-serif; direction: rtl; padding: 18px;">
            <h2 style="margin:0 0 6px;">${settings.labNameAr} — القوائم المالية الختامية (IFRS)</h2>
            <p style="margin:0 0 14px; font-size:12px;">صافي الإيرادات: ${formatCurrency(inc.netRevenue)} | تكلفة البضاعة المباعة COGS: ${formatCurrency(inc.totalCOGS)} | صافي الربح: <strong>${formatCurrency(inc.netProfit)}</strong></p>
            <h3 style="font-size:14px;">ملخص المركز المالي (الميزانية العمومية):</h3>
            <p style="font-size:12px;">إجمالي الأصول: <strong>${formatCurrency(bs.totalAssets)}</strong> = إجمالي الخصوم وحقوق الملكية: <strong>${formatCurrency(bs.totalLiabilitiesAndEquity)}</strong></p>
            <h3 style="font-size:14px;">توازن ميزان المراجعة:</h3>
            <p style="font-size:12px;">إجمالي الأرصدة المدينة: <strong>${formatCurrency(trialBalance.totalDebitBalance)}</strong> = إجمالي الأرصدة الدائنة: <strong>${formatCurrency(trialBalance.totalCreditBalance)}</strong></p>
          </div>
        `
      );
    });
  }

  await draw();
}
