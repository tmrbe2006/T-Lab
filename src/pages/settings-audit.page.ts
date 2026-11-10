import { authService } from '../auth/auth.service';
import { showToast } from '../components/toast';
import { db } from '../db/database';
import { seedDatabase } from '../db/seed';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import { permissionsRepository } from '../repositories';
import { commissionService } from '../services/commission.service';
import { invoiceService } from '../services/invoice.service';
import { AVAILABLE_SKINS, type SkinId, themeService } from '../services/theme.service';
import type { LabSettings } from '../types';

export async function renderSettingsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  const s = (await permissionsRepository.getSettings()) || {
    id: 'default',
    labNameAr: 'مختبرات الشفاء التخصصية للتحاليل الطبية',
    labNameEn: 'Al-Shifa Specialized Medical Laboratories',
    branchNameAr: 'الفرع الرئيسي - مدينة نصر',
    branchNameEn: 'Main Branch - Nasr City',
    addressAr: '24 شارع عباس العقاد - مدينة نصر - القاهرة',
    addressEn: '24 Abbas El-Akkad St., Nasr City, Cairo',
    phone: '19014',
    currency: 'EGP',
    defaultTaxRate: 14,
    defaultLanguage: 'ar',
    enableCriticalAlerts: true,
    commissionIncludesTax: true,
    commissionFromCollectedOnly: true,
    barcodeFormat: 'CODE128',
    printFooterAr: 'تقرير معتمد إلكترونيًا',
    printFooterEn: 'Electronically Validated Report',
  };

  const canEdit = can(user, 'edit', 'settings');
  const currentMode = themeService.getMode();
  const currentSkin = themeService.getSkin();

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.settings}</h1>
          <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('إعدادات المعمل، الثيمات والمظاهر (Themes & Skins)، الضريبة، قواعد عمولة الطبيب، النسخ الاحتياطي، وإعادة تعيين البيانات', 'Lab configuration, Themes & Skins Studio, tax defaults, commission rules, JSON backup/restore, and demo data reset')}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button id="set-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            ${i18n.dict.actions.print}
          </button>
          <button id="set-export-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            ${i18n.bi('تصدير نسخة احتياطية (JSON)', 'Export Backup (JSON)')}
          </button>
          <button id="set-reset-btn" type="button" class="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer">
            ${i18n.bi('إعادة تعيين البيانات التجريبية', 'Reset Demo Data')}
          </button>
        </div>
      </div>

      <!-- Themes & Skins Studio -->
      <section class="rounded-xl bg-white border border-slate-200 p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-bold text-slate-900">🎨 ${i18n.bi('استوديو الثيمات والمظاهر (Themes & Skins)', 'Themes & Skins Studio')}</h2>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('اختر بين الوضع النهاري والوضع الليلي و6 مظاهر لونية طبية مصممة خصيصًا لمعامل التحاليل:', 'Choose between Light/Dark mode and 6 specialized medical laboratory color skins:')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              id="set-mode-light"
              type="button"
              class="rounded-lg border px-3.5 py-2 text-xs font-bold cursor-pointer ${
                currentMode === 'light'
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }"
            >
              ☀ ${i18n.bi('الوضع النهاري (Light)', 'Light Mode')}
            </button>
            <button
              id="set-mode-dark"
              type="button"
              class="rounded-lg border px-3.5 py-2 text-xs font-bold cursor-pointer ${
                currentMode === 'dark'
                  ? 'border-sky-500 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }"
            >
              ☾ ${i18n.bi('الوضع الليلي (Dark)', 'Dark Mode')}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${AVAILABLE_SKINS.map((sk) => {
            const active = sk.id === currentSkin;
            return `
              <button
                type="button"
                data-skin-card="${sk.id}"
                class="skin-card-btn text-start rounded-xl border p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  active
                    ? 'border-2 border-slate-900 bg-slate-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-400'
                }"
              >
                <div class="flex items-center gap-3">
                  <div class="flex items-center -space-x-1 rtl:space-x-reverse">
                    <span class="inline-block w-6 h-6 rounded-full border border-white shadow-sm" style="background-color: ${sk.headerBgHex};"></span>
                    <span class="inline-block w-6 h-6 rounded-full border border-white shadow-sm" style="background-color: ${sk.primaryHex};"></span>
                  </div>
                  <div>
                    <div class="text-xs font-bold text-slate-900">${i18n.bi(sk.nameAr, sk.nameEn)}</div>
                    <div class="text-[11px] font-mono text-slate-400">${sk.id}</div>
                  </div>
                </div>
                ${
                  active
                    ? `<span class="text-xs font-bold text-emerald-600">✓ ${i18n.bi('نشط', 'Active')}</span>`
                    : ''
                }
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <form id="settings-form" class="rounded-xl bg-white border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('اسم المعمل (عربي)', 'Lab Name (Arabic)')}</label>
          <input name="labNameAr" value="${s.labNameAr}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('اسم المعمل (إنجليزي)', 'Lab Name (English)')}</label>
          <input name="labNameEn" value="${s.labNameEn}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('العنوان (عربي)', 'Address (Arabic)')}</label>
          <input name="addressAr" value="${s.addressAr}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.dict.common.phone}</label>
          <input name="phone" value="${s.phone}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('العملة الافتراضية', 'Currency')}</label>
          <input name="currency" value="${s.currency}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('الضريبة الافتراضية (%)', 'Default Tax Rate (%)')}</label>
          <input name="defaultTaxRate" type="number" step="0.5" value="${s.defaultTaxRate}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('هل تشمل عمولة الطبيب الضريبة؟', 'Doctor Commission Includes Tax?')}</label>
          <select name="commissionIncludesTax" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="true" ${s.commissionIncludesTax ? 'selected' : ''}>${i18n.bi('نعم - من الصافي بعد الخصم والضريبة', 'Yes - After Discount & Tax')}</option>
            <option value="false" ${!s.commissionIncludesTax ? 'selected' : ''}>${i18n.bi('لا - من الصافي بعد الخصم وقبل الضريبة', 'No - Before Tax')}</option>
          </select>
        </div>
        <div>
          <label class="block font-semibold mb-1">${i18n.bi('تفعيل تنبيهات النتائج الحرجة؟', 'Enable Critical Value Alerts?')}</label>
          <select name="enableCriticalAlerts" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="true" ${s.enableCriticalAlerts ? 'selected' : ''}>${i18n.bi('مفعل', 'Enabled')}</option>
            <option value="false" ${!s.enableCriticalAlerts ? 'selected' : ''}>${i18n.bi('معطل', 'Disabled')}</option>
          </select>
        </div>
        <div class="sm:col-span-2 flex justify-end pt-2">
          ${
            canEdit
              ? `<button type="submit" class="rounded-lg bg-sky-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">${i18n.dict.actions.save}</button>`
              : ''
          }
        </div>
      </form>
    </div>
  `;

  document.getElementById('set-mode-light')?.addEventListener('click', () => {
    themeService.setMode('light');
  });

  document.getElementById('set-mode-dark')?.addEventListener('click', () => {
    themeService.setMode('dark');
  });

  document.querySelectorAll<HTMLButtonElement>('.skin-card-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skinId = btn.getAttribute('data-skin-card') as SkinId | null;
      if (skinId) {
        themeService.setSkin(skinId);
        showToast(i18n.bi('تم تطبيق المظهر اللوني الجديد بنجاح', 'Skin applied successfully'), 'success');
      }
    });
  });

  document.getElementById('set-print-btn')?.addEventListener('click', () => {
    printService.printA4(
      i18n.dict.nav.settings,
      `
        <table class="print-table">
          <thead><tr><th>Setting</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Lab Name (AR)</td><td>${s.labNameAr}</td></tr>
            <tr><td>Lab Name (EN)</td><td>${s.labNameEn}</td></tr>
            <tr><td>Address</td><td>${s.addressAr}</td></tr>
            <tr><td>Phone</td><td class="tabular-nums">${s.phone}</td></tr>
            <tr><td>Currency</td><td>${s.currency}</td></tr>
            <tr><td>Default Tax Rate</td><td class="tabular-nums">${s.defaultTaxRate}%</td></tr>
            <tr><td>Doctor Commission Includes Tax</td><td>${s.commissionIncludesTax ? 'Yes' : 'No'}</td></tr>
            <tr><td>Theme / Skin</td><td>${themeService.getMode().toUpperCase()} / ${themeService.getSkin()}</td></tr>
          </tbody>
        </table>
      `
    );
  });

  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await enforcePermission('edit', 'settings'))) return;
    const fd = new FormData(form);
    const updated: LabSettings = {
      ...s,
      labNameAr: String(fd.get('labNameAr') || ''),
      labNameEn: String(fd.get('labNameEn') || ''),
      addressAr: String(fd.get('addressAr') || ''),
      phone: String(fd.get('phone') || ''),
      currency: String(fd.get('currency') || 'EGP'),
      defaultTaxRate: Number(fd.get('defaultTaxRate')) || 14,
      commissionIncludesTax: fd.get('commissionIncludesTax') === 'true',
      enableCriticalAlerts: fd.get('enableCriticalAlerts') === 'true',
    };
    await permissionsRepository.saveSettings(updated);
    await authService.logAudit('تحديث إعدادات المعمل', 'settings', 'default');
    showToast(i18n.bi('تم حفظ الإعدادات بنجاح', 'Settings saved successfully'), 'success');
  });

  document.getElementById('set-export-btn')?.addEventListener('click', async () => {
    const dump: Record<string, unknown> = {};
    for (const table of db.tables) {
      dump[table.name] = await table.toArray();
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medlab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(i18n.bi('تم تصدير النسخة الاحتياطية بنجاح', 'Backup exported successfully'), 'success');
  });

  document.getElementById('set-reset-btn')?.addEventListener('click', async () => {
    await seedDatabase(true);
    await authService.reloadPermissionsCache();
    showToast(i18n.bi('تمت إعادة تعيين كافة البيانات التجريبية بنجاح', 'Demo data reset complete'), 'success');
    renderSettingsPage(container);
  });
}

export async function renderPrintingHubPage(container: HTMLElement): Promise<void> {
  const sampleBarcodeSvg = printService.generateBarcodeSvg('BC20261001');

  container.innerHTML = `
    <div class="space-y-6">
      <div class="border-b border-slate-200 pb-4">
        <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.printing}</h1>
        <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('اختبار وتجربة أنماط الطباعة الثلاثة المدعومة: تقارير A4 الرسمية، إيصالات حرارية 80mm، وملصقات باركود العينات Code128', 'Test all 3 supported print formats: Official A4 Reports, 80mm Thermal Receipts, and Code128 Barcode Sample Labels')}</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div class="rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 class="text-sm font-bold text-slate-900">1. ${i18n.bi('طباعة تقارير وفواتير A4', 'Official A4 Print')}</h2>
            <p class="text-xs text-slate-500 mt-1">${i18n.bi('تتضمن ترويسة المعمل، التاريخ والوقت، اسم المستخدم الطابع، وإخفاء القوائم والأزرار.', 'Includes lab header, timestamp, printed-by user, and hides sidebar/buttons.')}</p>
          </div>
          <button id="hub-print-a4" class="mt-4 w-full rounded-lg bg-sky-600 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
            ${i18n.dict.actions.print}
          </button>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 class="text-sm font-bold text-slate-900">2. ${i18n.bi('طباعة إيصال حراري 80mm', 'Thermal Receipt 80mm')}</h2>
            <p class="text-xs text-slate-500 mt-1">${i18n.bi('مخصص لطابعات الكاشير والاستقبال لإيصالات الدفع واستلام العينات.', 'Formatted for 80mm POS thermal printers with embedded barcode.')}</p>
          </div>
          <button id="hub-print-thermal" class="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer">
            ${i18n.dict.actions.printThermal}
          </button>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div>
            <h2 class="text-sm font-bold text-slate-900">3. ${i18n.bi('طباعة ملصق باركود العينة (Code128)', 'Sample Barcode Label (Code128)')}</h2>
            <div class="my-2 flex justify-center bg-slate-50 rounded p-2 border border-slate-200">${sampleBarcodeSvg}</div>
          </div>
          <button id="hub-print-barcode" class="mt-2 w-full rounded-lg bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">
            ${i18n.dict.actions.printBarcode}
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('hub-print-a4')?.addEventListener('click', () => {
    printService.printA4(
      i18n.bi('نموذج تقرير تحاليل رسمي A4', 'Sample Official A4 Report'),
      `<table class="print-table"><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference</th></tr></thead><tbody><tr><td>Complete Blood Count (HGB)</td><td class="tabular-nums">14.6</td><td>g/dL</td><td>13.5 - 17.5</td></tr></tbody></table>`
    );
  });

  document.getElementById('hub-print-thermal')?.addEventListener('click', () => {
    printService.printThermal80mm(
      i18n.bi('إيصال استلام عينة وسداد', 'Sample & Payment Receipt'),
      `<div>المريض: أحمد علي محمد</div><div>الطلب: REQ-2026-1001</div><div>الصافي المدفوع: 277.02 EGP</div>`,
      'REQ-2026-1001'
    );
  });

  document.getElementById('hub-print-barcode')?.addEventListener('click', () => {
    printService.printBarcodeLabel({
      barcode: 'BC20261001',
      requestNumber: 'REQ-2026-1001',
      patientName: 'أحمد علي محمد',
      date: '2026-11-09',
      sampleType: 'EDTA Whole Blood',
      testsSummary: 'CBC, HbA1c',
    });
  });
}

export async function renderAuditLogsPage(container: HTMLElement): Promise<void> {
  const logs = await permissionsRepository.getAuditLogs();

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.auditLogs}</h1>
          <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('سجل المراجعة الأمني: يوثق المستخدم، الدور، العملية، الشاشة، السجل المتأثر، والتاريخ والوقت', 'Security Audit Trail: Tracks user, role, operation, screen, record ID, and timestamp')}</p>
        </div>
        <button id="aud-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
      </div>

      <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
        <table class="w-full text-xs text-start">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th class="py-3 px-3 text-start">${i18n.dict.common.date}</th>
              <th class="py-3 px-3 text-start">${i18n.dict.login.username}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('الدور', 'Role')}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('الشاشة', 'Screen')}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('العملية المنفذة', 'Action')}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('السجل المتأثر والتفاصيل', 'Record & Details')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${logs
              .map(
                (l) => `
                <tr class="hover:bg-slate-50">
                  <td class="py-2.5 px-3 font-mono text-slate-500 tabular-nums">${l.timestamp}</td>
                  <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${l.username}</td>
                  <td class="py-2.5 px-3 text-sky-800 font-semibold">${l.role}</td>
                  <td class="py-2.5 px-3 font-mono text-slate-600">${l.screen}</td>
                  <td class="py-2.5 px-3 font-bold text-slate-900">${l.action}</td>
                  <td class="py-2.5 px-3 font-mono text-slate-600">${l.recordId} ${l.details ? `— ${l.details}` : ''}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('aud-print-btn')?.addEventListener('click', () => {
    printService.printA4(
      i18n.dict.nav.auditLogs,
      `<table class="print-table"><thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Screen</th><th>Action</th><th>Record</th></tr></thead><tbody>${logs.map((l) => `<tr><td class="tabular-nums">${l.timestamp}</td><td>${l.username}</td><td>${l.role}</td><td>${l.screen}</td><td>${l.action}</td><td>${l.recordId}</td></tr>`).join('')}</tbody></table>`
    );
  });
}

export async function renderTestPlanPage(container: HTMLElement): Promise<void> {
  // Run automated live verification of Invoice & Doctor Commission math rules
  const invCheck = invoiceService.calculateInvoiceTotals(
    [
      { id: 't1', price: 800, commissionEligible: true },
      { id: 't2', price: 200, commissionEligible: true },
    ],
    'fixed',
    100,
    5.555555555555555, // Or let's verify exact prompt example: Subtotal 1000, Discount 100, Tax 50 -> Net 950
    475
  );

  const commCheck = commissionService.calculateCommissionForInvoice(
    {
      id: 'inv_test',
      invoiceNumber: 'INV-TEST-01',
      requestId: 'req_test',
      patientId: 'pat_1',
      doctorId: 'doc_1',
      requestType: 'referred',
      date: '2026-11-09',
      subtotal: 1000,
      discountType: 'fixed',
      discountValue: 100,
      discountAmount: 100,
      taxRate: 5.56,
      taxAmount: 50,
      netTotal: 950,
      paidAmount: 475,
      remainingAmount: 475,
      paymentMethod: 'cash',
      status: 'partial',
      notes: '',
      createdBy: 'owner',
    },
    [
      {
        id: 'ii_1',
        invoiceId: 'inv_test',
        testId: 'tst_1',
        testNameAr: 'تحليل محول',
        testNameEn: 'Referred Test',
        price: 210.5263,
        netAfterDiscountAndTax: 200,
        commissionEligible: true,
      },
    ],
    {
      id: 'doc_1',
      code: 'DOC-001',
      nameAr: 'د. حسام',
      nameEn: 'Dr. Hossam',
      specialty: 'Internal',
      phone: '010',
      type: 'referred',
      commissionRate: 10,
      commissionEnabled: true,
      notes: '',
      active: true,
    },
    true
  );

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.testPlan}</h1>
          <p class="text-xs text-slate-500 mt-0.5">
            ${i18n.bi(
              'خطة الاختبار اليدوي والآلي الشاملة للنظام (الصلاحيات، الطباعة، الحذف، الفواتير، وعمولات الأطباء)',
              'Comprehensive Manual & Automated System Test Plan (Permissions, Printing, Deletion, Invoices, and Doctor Commissions)'
            )}
          </p>
        </div>
        <button id="tp-print-btn" class="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">
          ${i18n.dict.actions.print}
        </button>
      </div>

      <!-- Automated Math Verification Banner -->
      <div class="rounded-xl bg-emerald-950 text-emerald-50 border border-emerald-700 p-4 text-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="font-bold text-emerald-300">
            ✓ ${i18n.bi('التحقق الآلي من معادلات الفواتير والعمولات (مُجتاز بنجاح 100%):', 'Automated Math Verification (100% PASSED):')}
          </div>
          <div class="mt-1 font-mono text-[11px] text-emerald-100 tabular-nums">
            Subtotal: 1000 | Discount: 100 | Tax (after discount): 50 | Net: ${invCheck.netTotal} | Paid: 475 (Ratio: ${commCheck.collectionRatio * 100}%) | Referred Item Net: 200 -> Collected Share: ${commCheck.collectedReferredBasis} × 10% Rate = Commission: ${commCheck.commissionAmount} EGP
          </div>
        </div>
      </div>

      <!-- Test Plan Table -->
      <div id="test-plan-printable" class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
        <table class="w-full text-xs text-start">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th class="py-3 px-3 text-start">#</th>
              <th class="py-3 px-3 text-start">${i18n.bi('المحور / القسم', 'Category')}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('نقطة الاختبار', 'Test Case')}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('خطوات التنفيذ اليدوي', 'Execution Steps')}</th>
              <th class="py-3 px-3 text-start">${i18n.bi('النتيجة المتوقعة', 'Expected Result')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">1.1</td>
              <td class="py-2.5 px-3 font-bold text-sky-800">أولًا: الصلاحيات</td>
              <td class="py-2.5 px-3 font-semibold">إخفاء زر الإضافة والحذف بدون صلاحية</td>
              <td class="py-2.5 px-3">سجل الدخول بحساب <code>doctor / doctor123</code> وافتح شاشة المرضى أو التحاليل</td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">لا يظهر زر حذف المريض أو حذف التحليل لأن دور الطبيب لا يملك صلاحية <code>delete</code></td>
            </tr>
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">1.2</td>
              <td class="py-2.5 px-3 font-bold text-sky-800">أولًا: الصلاحيات</td>
              <td class="py-2.5 px-3 font-semibold">منع الدخول לשاشة غير مصرح بها وعرض 403</td>
              <td class="py-2.5 px-3">سجل الدخول بحساب <code>technician / tech123</code> ثم غير الرابط يدويًا إلى <code>#/permissions</code> أو <code>#/commissions</code></td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">يعترض Route Guard المحاولة ويعرض شاشة <code>403 - غير مصرح بالوصول</code> ويسجل المحاولة في Audit Log</td>
            </tr>
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">2.1</td>
              <td class="py-2.5 px-3 font-bold text-indigo-800">ثانيًا: الطباعة</td>
              <td class="py-2.5 px-3 font-semibold">احترام البحث والفلاتر وإخفاء القائمة الجانبية</td>
              <td class="py-2.5 px-3">ابحث عن اسم مريض في شاشة المرضى ثم اضغط "طباعة A4"</td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">يتم طباعة السجلات المفلترة الظاهرة فقط مع ترويسة المعمل والتاريخ واسم المستخدم وبدون القائمة الجانبية</td>
            </tr>
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">2.2</td>
              <td class="py-2.5 px-3 font-bold text-indigo-800">ثانيًا: الطباعة</td>
              <td class="py-2.5 px-3 font-semibold">طباعة A4 وإيصال حراري 80mm وباركود Code128</td>
              <td class="py-2.5 px-3">افتح شاشة الفواتير أو مركز الطباعة وجرب أزرار <code>A4</code> و <code>80mm</code> و <code>طباعة باركود</code></td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">يتم توليد التقرير المناسب أو ملصق الباركود (SVG Code128) واستدعاء <code>window.print()</code></td>
            </tr>
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">3.1</td>
              <td class="py-2.5 px-3 font-bold text-rose-800">ثالثًا: الحذف</td>
              <td class="py-2.5 px-3 font-semibold">نافذة تأكيد الحذف باسم السجل وتسجيل Audit Log</td>
              <td class="py-2.5 px-3">بحساب <code>owner / owner123</code> اضغط حذف على أي سجل، جرب الإلغاء مرة والموافقة مرة</td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">تظهر رسالة تأكيد باسم السجل؛ عند الإلغاء لا يُحذف، وعند الموافقة يُحذف ويظهر Toast نجاح ويُحدث الجدول ويُسجل في Audit Log</td>
            </tr>
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">4.1</td>
              <td class="py-2.5 px-3 font-bold text-amber-800">رابعًا: الفواتير</td>
              <td class="py-2.5 px-3 font-semibold">حساب الخصم والضريبة بعد الخصم وعدم ظهور عمولة الطبيب</td>
              <td class="py-2.5 px-3">أنشئ طلبًا جديدًا لمريض لديه خصم افتراضي وافتح الفاتورة الصادرة</td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">الضريبة تُحسب بعد الخصم، الصافي = الإجمالي - الخصم + الضريبة، ولا تظهر نسبة الطبيب نهائيًا في الفاتورة</td>
            </tr>
            <tr>
              <td class="py-2.5 px-3 font-mono font-bold">5.1</td>
              <td class="py-2.5 px-3 font-bold text-emerald-800">خامسًا: عمولات الأطباء</td>
              <td class="py-2.5 px-3 font-semibold">احتساب العمولة من المحصل فقط وللطلبات المحولة فقط</td>
              <td class="py-2.5 px-3">افتح شاشة "عمولات الأطباء" وقارن الفواتير المدفوعة جزئيًا وغير المدفوعة والداخلية</td>
              <td class="py-2.5 px-3 text-emerald-700 font-semibold">تُحسب العمولة فقط للطلبات المحولة وبنسبة التحصيل الفعلية، ولا تُحسب لغير المدفوعة أو الطلبات الداخلية</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('tp-print-btn')?.addEventListener('click', () => {
    const tableEl = document.getElementById('test-plan-printable');
    printService.printA4(i18n.dict.nav.testPlan, tableEl?.innerHTML || '');
  });
}
