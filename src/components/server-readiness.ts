import { authService } from '../auth/auth.service';

type Report = {
  databaseConnected: boolean; mysqlVersion: string | null;
  schemaTablesPresent: number; schemaTablesExpected: number; missingTables: string[];
  productionStaticAssets: boolean; backgroundLegacySyncDisabled: boolean;
  unsafeBulkImportDisabled: boolean; snapshotPullDisabled: boolean;
  developerPasswordConfigured: boolean;
  status: 'technical_checks_passed' | 'attention_required';
  clinicalReleaseApproved: false;
};

export function renderReadinessPanel(element: HTMLElement): void {
  if (authService.getCurrentUser()?.role !== 'Developer') return;
  element.innerHTML = `
    <section class="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <h2 class="font-bold text-slate-900">فحص جاهزية السيرفر وقاعدة البيانات — Technical Readiness</h2>
      <p class="text-xs text-rose-800 font-semibold">حتى عند نجاح الفحوص التقنية، هذه ليست شهادة جاهزية طبية أو موافقة تشغيل على بيانات مرضى حقيقية.</p>
      <button id="server-readiness-refresh" type="button" class="rounded bg-slate-900 text-white px-3 py-2 text-xs">فحص الآن</button>
      <p id="server-readiness-status" role="status" class="text-xs"></p>
      <div id="server-readiness-results" class="text-xs space-y-1"></div>
    </section>`;
  const status = element.querySelector<HTMLElement>('#server-readiness-status');
  const output = element.querySelector<HTMLElement>('#server-readiness-results');
  const line = (label: string, value: string) => {
    const p = document.createElement('p');
    p.textContent = label + ': ' + value;
    output?.append(p);
  };
  const check = async () => {
    if (status) status.textContent = 'جارٍ فحص السيرفر...';
    if (output) output.replaceChildren();
    try {
      const response = await fetch('/api/v2/admin/readiness', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('فشل التحقق من الجلسة أو السيرفر');
      const body = await response.json() as { ok: boolean; report: Report };
      const report = body.report;
      if (!body.ok || !report) throw new Error('لم يتم توفير تقرير حالة صالح');
      line('قاعدة البيانات متصلة', report.databaseConnected ? 'نعم' : 'لا');
      line('إصدار MySQL', report.mysqlVersion || 'غير متاح');
      line('جداول قاعدة البيانات المطلوبة', report.schemaTablesPresent + ' / ' + report.schemaTablesExpected);
      line('الجداول المفقودة', report.missingTables.length ? report.missingTables.join(', ') : 'لا يوجد');
      line('تشغيل ملفات الإنتاج الثابتة', report.productionStaticAssets ? 'نعم' : 'لا — بيئة اختبار');
      line('مزامنة البيانات القديمة غير الآمنة معطلة', report.backgroundLegacySyncDisabled ? 'نعم' : 'تحذير');
      line('الاستيراد الجماعي الخطر معطل', report.unsafeBulkImportDisabled ? 'نعم' : 'تحذير');
      line('استبدال البيانات من Snapshot معطل', report.snapshotPullDisabled ? 'نعم' : 'تحذير');
      line('كلمة مرور المبرمج مضبوطة', report.developerPasswordConfigured ? 'نعم' : 'لا');
      line('الإذن بالتشغيل الطبي', 'غير ممنوح — الاختبارات السريرية والمالية غير مكتملة');
      if (status) status.textContent =
        report.status === 'technical_checks_passed'
        ? 'اجتازت الإعدادات التقنية الأساسية فقط؛ ليست جاهزية إنتاج طبي.'
        : 'هناك إعدادات تقنية تتطلب المعالجة.';
    } catch {
      if (status) status.textContent = 'لم يمكن استكمال الفحص. لا تفترض أن السيرفر جاهز.';
    }
  };
  element.querySelector('#server-readiness-refresh')?.addEventListener('click', () => { void check(); });
  void check();
}
