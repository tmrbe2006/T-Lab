import { authService } from '../auth/auth.service';
import { can } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import {
  invoicesRepository,
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../repositories';
import { router } from '../router';

export async function renderDashboardPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  const [patients, requests, samples, results, invoices, tests] = await Promise.all([
    patientsRepository.getAll(),
    requestsRepository.getAllRequests(),
    requestsRepository.getAllSamples(),
    requestsRepository.getAllResults(),
    invoicesRepository.getAll(),
    testsRepository.getAllTests(),
  ]);

  const todayDate = '2026-11-09';
  const todayRequests = requests.filter((r) => r.createdAt === todayDate);
  const receivedSamples = samples.filter((s) => s.status === 'received');
  const rejectedSamples = samples.filter((s) => s.status !== 'received');
  const pendingResults = results.filter((r) => r.status === 'pending_review' || r.status === 'draft');
  const approvedResults = results.filter((r) => r.status === 'approved');

  const totalCollectedRevenue = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const uncollectedBalance = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);

  const criticalResults = results.filter((r) =>
    r.values.some((v) => v.flag === 'critical_high' || v.flag === 'critical_low')
  );

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const testMap = new Map(tests.map((t) => [t.id, t]));

  const kpis = [
    {
      label: i18n.bi('إجمالي المرضى المسجلين (اليوم / الكل)', 'Registered Patients (Today / Total)'),
      value: `${todayRequests.length} / ${patients.length}`,
      sub: i18n.bi('سجل نشط بالمعمل', 'Active patient records'),
    },
    {
      label: i18n.bi('طلبات التحاليل المسجلة', 'Total Lab Requests'),
      value: `${requests.length}`,
      sub: i18n.bi(`${todayRequests.length} طلبات جديدة اليوم`, `${todayRequests.length} new requests today`),
    },
    {
      label: i18n.bi('العينات المستلمة / المرفوضة', 'Samples Received / Rejected'),
      value: `${receivedSamples.length} / ${rejectedSamples.length}`,
      sub: i18n.bi('مراقبة جودة السحب', 'Sample QC status'),
    },
    {
      label: i18n.bi('النتائج (بانتظار الاعتماد / المعتمدة)', 'Results (Pending / Approved)'),
      value: `${pendingResults.length} / ${approvedResults.length}`,
      sub: i18n.bi(`${criticalResults.length} نتائج حرجة`, `${criticalResults.length} critical alerts`),
    },
    {
      label: i18n.bi('الإيرادات المحصلة الفعلية', 'Total Collected Revenue'),
      value: `${totalCollectedRevenue.toLocaleString()} EGP`,
      sub: i18n.bi('إجمالي النقدية والشبكة المحصلة', 'Actual collected payments'),
    },
    {
      label: i18n.bi('المبالغ غير المحصلة (ذمم المرضى)', 'Uncollected Balance Due'),
      value: `${uncollectedBalance.toLocaleString()} EGP`,
      sub: i18n.bi('فواتير آجلة ومدفوعة جزئيًا', 'Unpaid & partial invoices'),
    },
  ];

  container.innerHTML = `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">
            ${i18n.dict.nav.dashboard} — ${user ? i18n.bi(user.fullNameAr, user.fullNameEn) : ''}
          </h1>
          <p class="text-xs text-slate-500 mt-0.5">
            ${i18n.bi('الدور الوظيفي الحالي:', 'Current Role:')}
            <span class="font-semibold text-slate-800">${user ? i18n.dict.roles[user.role] : ''}</span>
            ·
            <span>${i18n.bi('بيانات حية من IndexedDB', 'Live data from IndexedDB')}</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          ${
            can(user, 'print', 'dashboard')
              ? `<button id="dash-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                  ${i18n.dict.actions.print}
                </button>`
              : ''
          }
          <button id="dash-testplan-btn" type="button" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-700 cursor-pointer">
            ${i18n.dict.nav.testPlan}
          </button>
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${kpis
          .map(
            (k) => `
            <div class="rounded-xl bg-white border border-slate-200 p-4">
              <div class="text-xs font-medium text-slate-500">${k.label}</div>
              <div class="mt-2 text-2xl font-bold text-slate-900 tabular-nums">${k.value}</div>
              <div class="mt-1 text-[11px] text-slate-500">${k.sub}</div>
            </div>
          `
          )
          .join('')}
      </div>

      <!-- Critical Results Alert & Top Requested Tests -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Critical Alerts -->
        <div class="lg:col-span-7 rounded-xl bg-white border border-slate-200 p-5">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h2 class="text-sm font-bold text-rose-800">
              ${i18n.bi('تنبيهات النتائج الحرجة (Critical Values Alert)', 'Critical Values Alerts')}
            </h2>
            <span class="text-xs font-mono text-rose-700 tabular-nums">${criticalResults.length} Cases</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500">
                  <th class="py-2 text-start">${i18n.bi('المريض', 'Patient')}</th>
                  <th class="py-2 text-start">${i18n.bi('التحليل', 'Test')}</th>
                  <th class="py-2 text-start">${i18n.bi('البارامتر والقيمة', 'Parameter & Value')}</th>
                  <th class="py-2 text-start">${i18n.bi('المعدل الطبيعي', 'Normal Range')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${criticalResults
                  .slice(0, 6)
                  .map((cr) => {
                    const pat = patientMap.get(cr.patientId);
                    const tst = testMap.get(cr.testId);
                    const critVal = cr.values.find(
                      (v) => v.flag === 'critical_high' || v.flag === 'critical_low'
                    );
                    return `
                      <tr class="hover:bg-rose-50/40">
                        <td class="py-2.5 font-semibold text-slate-900">${pat?.name || cr.patientId}</td>
                        <td class="py-2.5 text-slate-700">${tst ? i18n.bi(tst.nameAr, tst.nameEn) : cr.testId}</td>
                        <td class="py-2.5 font-mono font-bold text-rose-700 tabular-nums">
                          ${critVal ? `${critVal.value} ${critVal.unit} (CRITICAL)` : ''}
                        </td>
                        <td class="py-2.5 font-mono text-slate-500 tabular-nums">${critVal?.normalRange || ''}</td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Requested Tests -->
        <div class="lg:col-span-5 rounded-xl bg-white border border-slate-200 p-5">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h2 class="text-sm font-bold text-slate-900">
              ${i18n.bi('أكثر التحاليل طلبًا', 'Most Requested Lab Tests')}
            </h2>
            <span class="text-xs text-slate-500">${tests.length} ${i18n.bi('تحليل نشط', 'Active Tests')}</span>
          </div>
          <div class="space-y-2.5 text-xs">
            ${tests
              .slice(0, 7)
              .map(
                (t, idx) => `
                <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <div>
                    <span class="font-mono text-slate-400 me-1.5">0${idx + 1}.</span>
                    <span class="font-semibold text-slate-800">${i18n.bi(t.nameAr, t.nameEn)}</span>
                    <span class="text-slate-400 ms-1">· ${t.code}</span>
                  </div>
                  <span class="font-mono font-semibold text-slate-900 tabular-nums">${t.price} EGP</span>
                </div>
              `
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('dash-testplan-btn')?.addEventListener('click', () => {
    router.navigate('testPlan');
  });

  document.getElementById('dash-print-btn')?.addEventListener('click', () => {
    const html = `
      <table class="print-table">
        <thead>
          <tr>
            <th>${i18n.bi('المؤشر التشغيلي والمالي', 'Operational & Financial Metric')}</th>
            <th>${i18n.bi('القيمة الحالية', 'Current Value')}</th>
          </tr>
        </thead>
        <tbody>
          ${kpis.map((k) => `<tr><td>${k.label}</td><td class="tabular-nums">${k.value}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
    printService.printA4(i18n.dict.nav.dashboard, html);
  });
}
