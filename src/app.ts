import { authService } from './auth/auth.service';
import { openCustomModal, showToast } from './components/common';
import { pwaManager } from './components/pwa-install';
import { can } from './guards/permission.guard';
import { i18n } from './i18n';
import { router, type RouteId } from './router';
import { advancedSearchService } from './services/advanced-search.service';
import { mysqlSyncService } from './services/mysql-sync.service';
import { themeService } from './services/theme.service';
import type { ResourceScreen } from './types';

export interface NavItem {
  route: RouteId;
  resource?: ResourceScreen;
  labelKey: keyof typeof i18n.dict.nav;
}

export interface NavGroup {
  id: string;
  icon: string;
  titleAr: string;
  titleEn: string;
  items: NavItem[];
}

export type MenuLayoutMode = 'grouped_expanded' | 'grouped_accordion' | 'flat_classic';

export interface UserMenuPreferences {
  layoutMode: MenuLayoutMode;
  showAllScreensRegardlessOfRole: boolean;
  hiddenGroups: string[];
  hiddenRoutes: string[];
  groupOrder: string[];
  customGroupTitlesAr: Record<string, string>;
}

const MENU_PREFS_STORAGE_KEY = 'tlab_menu_preferences_v2';

export const DEFAULT_SIDEBAR_GROUPS: NavGroup[] = [
  {
    id: 'grp_patients',
    icon: '👥',
    titleAr: '1. قائمة المرضى والعينات',
    titleEn: '1. Patients & Samples',
    items: [
      { route: 'patients', resource: 'patients', labelKey: 'patients' },
      { route: 'requests', resource: 'requests', labelKey: 'requests' },
      { route: 'samples', resource: 'samples', labelKey: 'samples' },
      { route: 'homeVisits', resource: 'homeVisits', labelKey: 'homeVisits' },
    ],
  },
  {
    id: 'grp_tests',
    icon: '🧪',
    titleAr: '2. قائمة التحاليل الطبية',
    titleEn: '2. Medical Lab Tests',
    items: [
      { route: 'tests', resource: 'tests', labelKey: 'tests' },
      { route: 'testParameters', resource: 'testParameters', labelKey: 'testParameters' },
      { route: 'microbiology', resource: 'microbiology', labelKey: 'microbiology' },
      { route: 'scientificDepartments', resource: 'scientificDepartments', labelKey: 'scientificDepartments' },
      { route: 'sampleTubes', resource: 'sampleTubes', labelKey: 'sampleTubes' },
    ],
  },
  {
    id: 'grp_microscopy',
    icon: '🔬',
    titleAr: '3. قائمة التشخيص المجهري',
    titleEn: '3. Microscopic Diagnostics',
    items: [
      { route: 'bloodFilmAi', resource: 'bloodFilmAi', labelKey: 'bloodFilmAi' },
      { route: 'urineMicroscopyAi', resource: 'urineMicroscopyAi', labelKey: 'urineMicroscopyAi' },
      { route: 'stoolMicroscopyAi', resource: 'stoolMicroscopyAi', labelKey: 'stoolMicroscopyAi' },
      { route: 'culturePlateAi', resource: 'culturePlateAi', labelKey: 'culturePlateAi' },
      { route: 'aiHub', resource: 'aiHub', labelKey: 'aiHub' },
    ],
  },
  {
    id: 'grp_results',
    icon: '📋',
    titleAr: '4. قائمة النتائج والجودة',
    titleEn: '4. Results & Quality Control',
    items: [
      { route: 'results', resource: 'results', labelKey: 'results' },
      { route: 'resultReview', resource: 'resultReview', labelKey: 'resultReview' },
      { route: 'qualityControl', resource: 'qualityControl', labelKey: 'qualityControl' },
    ],
  },
  {
    id: 'grp_invoices',
    icon: '🧾',
    titleAr: '5. قائمة الفواتير والمشتريات',
    titleEn: '5. Invoices & Purchases',
    items: [
      { route: 'invoices', resource: 'invoices', labelKey: 'invoices' },
      { route: 'purchases', resource: 'purchases', labelKey: 'purchases' },
      { route: 'payments', resource: 'payments', labelKey: 'payments' },
      { route: 'expenses', resource: 'expenses', labelKey: 'expenses' },
      { route: 'corporateContracts', resource: 'corporateContracts', labelKey: 'corporateContracts' },
      { route: 'inventory', resource: 'inventory', labelKey: 'inventory' },
    ],
  },
  {
    id: 'grp_accounting',
    icon: '📊',
    titleAr: '6. قائمة المحاسبة والمالية',
    titleEn: '6. Accounting & Finance',
    items: [
      { route: 'erpAccounting', resource: 'erpAccounting', labelKey: 'erpAccounting' },
      { route: 'accounts', resource: 'accounts', labelKey: 'accounts' },
      { route: 'journalEntries', resource: 'journalEntries', labelKey: 'journalEntries' },
      { route: 'cashbox', resource: 'cashbox', labelKey: 'cashbox' },
      { route: 'reports', resource: 'reports', labelKey: 'reports' },
    ],
  },
  {
    id: 'grp_doctors',
    icon: '🩺',
    titleAr: '7. قائمة الأطباء والعمولات',
    titleEn: '7. Doctors & Commissions',
    items: [
      { route: 'doctors', resource: 'doctors', labelKey: 'doctors' },
      { route: 'doctorSpecialties', resource: 'doctorSpecialties', labelKey: 'doctorSpecialties' },
      { route: 'commissions', resource: 'commissions', labelKey: 'commissions' },
    ],
  },
  {
    id: 'grp_admin',
    icon: '⚙️',
    titleAr: '8. قائمة الإدارة والإعدادات',
    titleEn: '8. Administration & Settings',
    items: [
      { route: 'employees', resource: 'employees', labelKey: 'employees' },
      { route: 'users', resource: 'users', labelKey: 'users' },
      { route: 'permissions', resource: 'permissions', labelKey: 'permissions' },
      { route: 'printing', resource: 'printing', labelKey: 'printing' },
      { route: 'settings', resource: 'settings', labelKey: 'settings' },
      { route: 'auditLogs', resource: 'permissions', labelKey: 'auditLogs' },
      { route: 'testPlan', labelKey: 'testPlan' },
    ],
  },
];

const SIDEBAR_ITEMS: NavItem[] = [
  { route: 'dashboard', resource: 'dashboard', labelKey: 'dashboard' },
  ...DEFAULT_SIDEBAR_GROUPS.flatMap((g) => g.items),
];

function loadMenuPreferences(): UserMenuPreferences {
  const defaultPrefs: UserMenuPreferences = {
    layoutMode: 'grouped_expanded',
    showAllScreensRegardlessOfRole: true,
    hiddenGroups: [],
    hiddenRoutes: [],
    groupOrder: DEFAULT_SIDEBAR_GROUPS.map((g) => g.id),
    customGroupTitlesAr: {},
  };
  try {
    const raw = localStorage.getItem(MENU_PREFS_STORAGE_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw) as Partial<UserMenuPreferences>;
    return {
      layoutMode: parsed.layoutMode || defaultPrefs.layoutMode,
      showAllScreensRegardlessOfRole: parsed.showAllScreensRegardlessOfRole ?? true,
      hiddenGroups: Array.isArray(parsed.hiddenGroups) ? parsed.hiddenGroups : [],
      hiddenRoutes: Array.isArray(parsed.hiddenRoutes) ? parsed.hiddenRoutes : [],
      groupOrder:
        Array.isArray(parsed.groupOrder) && parsed.groupOrder.length > 0
          ? parsed.groupOrder
          : defaultPrefs.groupOrder,
      customGroupTitlesAr: parsed.customGroupTitlesAr || {},
    };
  } catch {
    return defaultPrefs;
  }
}

function saveMenuPreferences(prefs: UserMenuPreferences): void {
  try {
    localStorage.setItem(MENU_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Lazy-loads screen modules on demand using Dynamic Imports.
 */
export const loadPage = async (
  route: RouteId
): Promise<(container: HTMLElement) => Promise<void> | void> => {
  switch (route) {
    case 'dashboard': {
      const { renderDashboardPage } = await import('./pages/dashboard.page');
      return renderDashboardPage;
    }
    case 'patients': {
      const { renderPatientsPage } = await import('./pages/patients.page');
      return renderPatientsPage;
    }
    case 'doctors': {
      const { renderDoctorsPage } = await import('./pages/doctors.page');
      return renderDoctorsPage;
    }
    case 'doctorSpecialties': {
      const { renderDoctorSpecialtiesPage } = await import('./pages/catalog/lookups.page');
      return renderDoctorSpecialtiesPage;
    }
    case 'employees': {
      const { renderEmployeesPage } = await import('./pages/staff/employees.page');
      return renderEmployeesPage;
    }
    case 'users': {
      const { renderUsersPage } = await import('./pages/staff/users.page');
      return renderUsersPage;
    }
    case 'permissions': {
      const { renderPermissionsPage } = await import('./pages/staff/permissions.page');
      return renderPermissionsPage;
    }
    case 'tests': {
      const { renderTestsCatalogPage } = await import('./pages/catalog/tests-catalog.page');
      return renderTestsCatalogPage;
    }
    case 'scientificDepartments': {
      const { renderScientificDepartmentsPage } = await import('./pages/catalog/lookups.page');
      return renderScientificDepartmentsPage;
    }
    case 'sampleTubes': {
      const { renderSampleTubesPage } = await import('./pages/catalog/lookups.page');
      return renderSampleTubesPage;
    }
    case 'testParameters': {
      const { renderTestParametersPage } = await import('./pages/catalog/test-parameters.page');
      return renderTestParametersPage;
    }
    case 'inventory': {
      const { renderInventoryPage } = await import('./pages/inventory/inventory.page');
      return renderInventoryPage;
    }
    case 'purchases': {
      const { renderPurchasesPage } = await import('./pages/purchases/purchases.page');
      return renderPurchasesPage;
    }
    case 'erpAccounting': {
      const { renderErpAccountingPage } = await import('./pages/erp-accounting/erp-accounting.page');
      return renderErpAccountingPage;
    }
    case 'requests': {
      const { renderRequestsPage } = await import('./pages/operations/requests.page');
      return renderRequestsPage;
    }
    case 'homeVisits': {
      const { renderHomeVisitsPage } = await import('./pages/operations/home-visits.page');
      return renderHomeVisitsPage;
    }
    case 'samples': {
      const { renderSamplesPage } = await import('./pages/operations/samples.page');
      return renderSamplesPage;
    }
    case 'results': {
      const { renderResultsEntryPage } = await import('./pages/operations/results-entry.page');
      return renderResultsEntryPage;
    }
    case 'microbiology': {
      const { renderMicrobiologyPage } = await import('./pages/operations/microbiology.page');
      return renderMicrobiologyPage;
    }
    case 'qualityControl': {
      const { renderQualityControlPage } = await import('./pages/operations/quality-control.page');
      return renderQualityControlPage;
    }
    case 'aiHub': {
      const { renderAiHubPage } = await import('./pages/operations/microscopy-vision.page');
      return renderAiHubPage;
    }
    case 'bloodFilmAi': {
      const { renderBloodFilmAiPage } = await import('./pages/operations/microscopy-vision.page');
      return renderBloodFilmAiPage;
    }
    case 'urineMicroscopyAi': {
      const { renderUrineMicroscopyAiPage } = await import('./pages/operations/microscopy-vision.page');
      return renderUrineMicroscopyAiPage;
    }
    case 'stoolMicroscopyAi': {
      const { renderStoolMicroscopyAiPage } = await import('./pages/operations/microscopy-vision.page');
      return renderStoolMicroscopyAiPage;
    }
    case 'culturePlateAi': {
      const { renderCulturePlateAiPage } = await import('./pages/operations/microscopy-vision.page');
      return renderCulturePlateAiPage;
    }
    case 'resultReview': {
      const { renderResultReviewPage } = await import('./pages/operations/results-review.page');
      return renderResultReviewPage;
    }
    case 'corporateContracts': {
      const { renderCorporateContractsPage } = await import('./pages/finance/corporate-contracts.page');
      return renderCorporateContractsPage;
    }
    case 'invoices': {
      const { renderInvoicesPage } = await import('./pages/finance/invoices.page');
      return renderInvoicesPage;
    }
    case 'payments': {
      const { renderPaymentsPage } = await import('./pages/finance/payments.page');
      return renderPaymentsPage;
    }
    case 'commissions': {
      const { renderCommissionsPage } = await import('./pages/finance/commissions.page');
      return renderCommissionsPage;
    }
    case 'accounts':
    case 'journalEntries':
    case 'cashbox':
    case 'expenses':
    case 'reports': {
      const { renderAccountingPage } = await import('./pages/finance/accounting.page');
      return (viewport: HTMLElement) => renderAccountingPage(viewport, route);
    }
    case 'settings': {
      const { renderSettingsPage } = await import('./pages/settings-audit.page');
      return renderSettingsPage;
    }
    case 'printing': {
      const { renderPrintingHubPage } = await import('./pages/settings-audit.page');
      return renderPrintingHubPage;
    }
    case 'auditLogs': {
      const { renderAuditLogsPage } = await import('./pages/settings-audit.page');
      return renderAuditLogsPage;
    }
    case 'testPlan': {
      const { renderTestPlanPage } = await import('./pages/settings-audit.page');
      return renderTestPlanPage;
    }
    default: {
      const { renderDashboardPage } = await import('./pages/dashboard.page');
      return renderDashboardPage;
    }
  }
};

export class MedicalLabApp {
  private rootEl: HTMLElement;
  // All 8 groups expanded by default so no menu item is ever hidden!
  private expandedGroups = new Set<string>(DEFAULT_SIDEBAR_GROUPS.map((g) => g.id));

  constructor(rootEl: HTMLElement) {
    this.rootEl = rootEl;
    mysqlSyncService.registerRealtimeHooks();
    router.onRouteChange(() => this.render());
    i18n.onChange(() => this.render());
    themeService.onChange(() => this.render());
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (authService.getCurrentUser()) {
          advancedSearchService.openGlobalSearchModal();
        }
      }
    });
  }

  public openMenuSettingsModal(): void {
    const prefs = loadMenuPreferences();
    const d = i18n.dict;

    const orderedGroups = [...DEFAULT_SIDEBAR_GROUPS].sort((a, b) => {
      const ia = prefs.groupOrder.indexOf(a.id);
      const ib = prefs.groupOrder.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    openCustomModal(
      i18n.bi('⚙️ إعدادات وتنسيق القوائم الجانبية (Menu Settings & Customization)', 'Sidebar Menu Settings & Customization'),
      `
        <form id="menu-prefs-form" class="space-y-4 text-xs">
          <div class="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-3">
            <div class="font-bold text-sky-950 text-sm">${i18n.bi('1. نظام عرض وتنسيق القوائم', '1. Menu Display Style')}</div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label class="flex items-center gap-2 rounded-lg border border-sky-300 bg-white p-2.5 font-bold text-slate-800 cursor-pointer">
                <input type="radio" name="layoutMode" value="grouped_expanded" ${prefs.layoutMode === 'grouped_expanded' ? 'checked' : ''} />
                <span>📂 ${i18n.bi('قوائم رئيسية مفتوحة بالكامل (افتراضي)', 'Grouped & All Expanded')}</span>
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-sky-300 bg-white p-2.5 font-bold text-slate-800 cursor-pointer">
                <input type="radio" name="layoutMode" value="grouped_accordion" ${prefs.layoutMode === 'grouped_accordion' ? 'checked' : ''} />
                <span>📑 ${i18n.bi('قوائم مطوية تفتح عند الضغط (Accordion)', 'Accordion Mode')}</span>
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-sky-300 bg-white p-2.5 font-bold text-slate-800 cursor-pointer">
                <input type="radio" name="layoutMode" value="flat_classic" ${prefs.layoutMode === 'flat_classic' ? 'checked' : ''} />
                <span>📋 ${i18n.bi('قائمة كلاسيكية مسطحة (بدون مجموعات)', 'Classic Flat List')}</span>
              </label>
            </div>
            <label class="flex items-center gap-2 pt-1 font-bold text-emerald-900 cursor-pointer">
              <input type="checkbox" name="showAllScreensRegardlessOfRole" value="1" ${prefs.showAllScreensRegardlessOfRole ? 'checked' : ''} class="w-4 h-4 accent-emerald-600 rounded" />
              <span>✅ ${i18n.bi('إظهار جميع القوائم والشاشات الـ 37 كاملة في القائمة الجانبية بدون إخفاء', 'Show all 37 screens in sidebar without hiding')}</span>
            </label>
          </div>

          <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            <div class="font-bold text-slate-900 text-sm">${i18n.bi('2. تخصيص القوائم الرئيسية والشاشات الفرعية (تعديل الاسم / إظهار أو إخفاء)', '2. Customize Menu Groups & Sub-Screens')}</div>
            ${orderedGroups
              .map((grp, gIdx) => {
                const isGrpVisible = !prefs.hiddenGroups.includes(grp.id);
                const customTitle = prefs.customGroupTitlesAr[grp.id] || grp.titleAr;
                return `
                  <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <label class="flex items-center gap-2 font-bold text-slate-900 cursor-pointer">
                        <input type="checkbox" name="grp_vis_${grp.id}" value="1" ${isGrpVisible ? 'checked' : ''} class="w-4 h-4 accent-sky-600 rounded" />
                        <span>${grp.icon}</span>
                        <input
                          type="text"
                          name="grp_title_${grp.id}"
                          value="${customTitle}"
                          class="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-900 w-56"
                        />
                      </label>
                      <div class="flex items-center gap-1">
                        <span class="text-[11px] text-slate-500 font-semibold">${i18n.bi('الترتيب:', 'Order:')}</span>
                        <input
                          type="number"
                          name="grp_order_${grp.id}"
                          min="1"
                          max="10"
                          value="${gIdx + 1}"
                          class="w-14 rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono font-bold"
                        />
                      </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                      ${grp.items
                        .map((item) => {
                          const isItemVis = !prefs.hiddenRoutes.includes(item.route);
                          return `
                            <label class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
                              <input type="checkbox" name="route_vis_${item.route}" value="1" ${isItemVis ? 'checked' : ''} class="accent-sky-600 rounded" />
                              <span>${d.nav[item.labelKey]}</span>
                            </label>
                          `;
                        })
                        .join('')}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              id="menu-prefs-reset-btn"
              class="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 cursor-pointer"
            >
              🔄 ${i18n.bi('استعادة الإعدادات القياسية وإظهار جميع القوائم', 'Reset to Default & Show All Menus')}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer"
            >
              💾 ${i18n.bi('حفظ وتطبيق إعدادات القوائم', 'Save & Apply Menu Settings')}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const form = document.getElementById('menu-prefs-form') as HTMLFormElement | null;
        document.getElementById('menu-prefs-reset-btn')?.addEventListener('click', () => {
          localStorage.removeItem(MENU_PREFS_STORAGE_KEY);
          this.expandedGroups = new Set(DEFAULT_SIDEBAR_GROUPS.map((g) => g.id));
          close();
          this.render();
          showToast(i18n.bi('تمت استعادة جميع القوائم والشاشات بنجاح', 'Default menus restored'), 'success');
        });

        form?.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const layoutMode = (fd.get('layoutMode') as MenuLayoutMode) || 'grouped_expanded';
          const showAllScreensRegardlessOfRole = Boolean(fd.get('showAllScreensRegardlessOfRole'));
          const hiddenGroups: string[] = [];
          const hiddenRoutes: string[] = [];
          const customGroupTitlesAr: Record<string, string> = {};
          const orderPairs: Array<{ id: string; ord: number }> = [];

          for (const grp of DEFAULT_SIDEBAR_GROUPS) {
            if (!fd.get(`grp_vis_${grp.id}`)) {
              hiddenGroups.push(grp.id);
            }
            const tAr = String(fd.get(`grp_title_${grp.id}`) || '').trim();
            if (tAr) {
              customGroupTitlesAr[grp.id] = tAr;
            }
            const ord = Number(fd.get(`grp_order_${grp.id}`)) || 99;
            orderPairs.push({ id: grp.id, ord });

            for (const item of grp.items) {
              if (!fd.get(`route_vis_${item.route}`)) {
                hiddenRoutes.push(item.route);
              }
            }
          }

          orderPairs.sort((a, b) => a.ord - b.ord);
          const groupOrder = orderPairs.map((p) => p.id);

          saveMenuPreferences({
            layoutMode,
            showAllScreensRegardlessOfRole,
            hiddenGroups,
            hiddenRoutes,
            groupOrder,
            customGroupTitlesAr,
          });

          if (layoutMode === 'grouped_expanded') {
            this.expandedGroups = new Set(DEFAULT_SIDEBAR_GROUPS.map((g) => g.id));
          } else if (layoutMode === 'grouped_accordion') {
            const currentRoute = router.getRoute();
            const activeGrp = DEFAULT_SIDEBAR_GROUPS.find((g) => g.items.some((i) => i.route === currentRoute));
            this.expandedGroups = new Set(activeGrp ? [activeGrp.id] : [DEFAULT_SIDEBAR_GROUPS[0].id]);
          }

          close();
          this.render();
          showToast(i18n.bi('تم حفظ وتحديث إعدادات القوائم بنجاح', 'Menu settings saved'), 'success');
        });
      }
    );
  }

  public async render(): Promise<void> {
    const user = authService.getCurrentUser();
    const currentRoute = router.getRoute();

    if (!user) {
      const { renderLoginPage } = await import('./pages/login.page');
      await renderLoginPage(this.rootEl);
      return;
    }

    if (currentRoute === 'login') {
      router.navigate('dashboard');
      return;
    }

    const prefs = loadMenuPreferences();

    // Ensure the group containing the active route is expanded automatically
    const activeGroup = DEFAULT_SIDEBAR_GROUPS.find((g) => g.items.some((i) => i.route === currentRoute));
    if (activeGroup) {
      this.expandedGroups.add(activeGroup.id);
    }

    const orderedGroups = [...DEFAULT_SIDEBAR_GROUPS].sort((a, b) => {
      const ia = prefs.groupOrder.indexOf(a.id);
      const ib = prefs.groupOrder.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    const canViewDashboard = prefs.showAllScreensRegardlessOfRole || can(user, 'view', 'dashboard');
    const visibleGroups = orderedGroups
      .filter((grp) => !prefs.hiddenGroups.includes(grp.id))
      .map((grp) => ({
        ...grp,
        titleAr: prefs.customGroupTitlesAr[grp.id] || grp.titleAr,
        items: grp.items.filter((item) => {
          if (prefs.hiddenRoutes.includes(item.route)) return false;
          if (prefs.showAllScreensRegardlessOfRole) return true;
          return !item.resource || can(user, 'view', item.resource);
        }),
      }))
      .filter((grp) => grp.items.length > 0);

    const d = i18n.dict;
    const totalVisibleItems = visibleGroups.reduce((acc, g) => acc + g.items.length, 0) + (canViewDashboard ? 1 : 0);

    this.rootEl.innerHTML = `
      <div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <!-- Top Header Bar -->
        <header class="sticky top-0 z-30 skin-header text-white border-b border-white/15 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3 shrink-0">
            <img src="/icon.svg" alt="MedLab" class="w-8 h-8 rounded-md" referrerPolicy="no-referrer" />
            <a href="#/dashboard" class="text-base font-bold tracking-tight text-white whitespace-nowrap">
              ${d.appTitle}
            </a>
          </div>

          <div class="hidden xl:flex items-center gap-3 text-xs text-slate-200">
            <span>${i18n.bi(user.fullNameAr, user.fullNameEn)}</span>
            <span aria-hidden="true">·</span>
            <span class="font-semibold text-sky-300">${d.roles[user.role]}</span>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button
              id="top-menu-settings-btn"
              type="button"
              class="rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-100 hover:bg-amber-500/35 whitespace-nowrap cursor-pointer"
              title="Menu Settings & Customization"
            >
              🛠️ ${i18n.bi('إعدادات القوائم', 'Menu Settings')}
            </button>
            <button
              id="top-mysql-btn"
              type="button"
              class="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/35 whitespace-nowrap cursor-pointer"
              title="MySQL 5.5 / 8.0.28 Database & .SQL Download"
            >
              🗄️ ${i18n.bi('قاعدة بيانات MySQL (.SQL)', 'MySQL DB (.SQL)')}
            </button>
            <button
              id="top-global-search-btn"
              type="button"
              class="rounded-lg border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500/35 whitespace-nowrap cursor-pointer"
              title="Ctrl+K"
            >
              🔍 ${i18n.bi('بحث متقدم شامل (Ctrl+K)', 'Omni Search (Ctrl+K)')}
            </button>
            ${themeService.renderThemeToolbarCompact()}
            <button
              id="top-pwa-btn"
              type="button"
              class="rounded-lg border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-white/10 whitespace-nowrap cursor-pointer"
            >
              ${d.installApp}
            </button>
            <button
              id="top-lang-btn"
              type="button"
              class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap cursor-pointer"
            >
              ${d.langToggle}
            </button>
            <button
              id="top-logout-btn"
              type="button"
              class="rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 whitespace-nowrap cursor-pointer"
            >
              ${d.nav.logout}
            </button>
          </div>
        </header>

        <!-- Main Workspace Layout -->
        <div class="flex-1 flex flex-col lg:flex-row">
          <!-- Sidebar Navigation -->
          <aside class="w-full lg:w-76 shrink-0 bg-white border-b lg:border-b-0 lg:border-e border-slate-200 p-3">
            <nav class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2 rounded-xl bg-slate-100/90 border border-slate-200 px-3 py-2">
                <div class="text-[11px] font-bold text-slate-700">
                  📑 ${i18n.bi(`القوائم (${visibleGroups.length} قوائم · ${totalVisibleItems} شاشة)`, `Menus (${visibleGroups.length} Groups · ${totalVisibleItems} Screens)`)}
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    id="sidebar-menu-config-btn"
                    type="button"
                    class="rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200 cursor-pointer"
                  >
                    ⚙️ ${i18n.bi('إعدادات القوائم', 'Configure')}
                  </button>
                  ${
                    prefs.layoutMode !== 'flat_classic'
                      ? `<button
                          id="sidebar-toggle-all-btn"
                          type="button"
                          class="rounded-md bg-white border border-slate-300 px-2 py-0.5 text-[11px] font-bold text-sky-700 hover:bg-slate-50 cursor-pointer"
                        >
                          ${
                            this.expandedGroups.size >= visibleGroups.length
                              ? i18n.bi('طي الكل −', 'Collapse −')
                              : i18n.bi('فتح الكل +', 'Expand +')
                          }
                        </button>`
                      : ''
                  }
                </div>
              </div>

              ${
                canViewDashboard
                  ? `
                    <a
                      href="#/dashboard"
                      class="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                        currentRoute === 'dashboard'
                          ? 'skin-nav-active text-white shadow-xs'
                          : 'bg-slate-100/80 text-slate-800 hover:bg-slate-200/70'
                      }"
                    >
                      <span class="flex items-center gap-2">
                        <span>🏠</span>
                        <span>${d.nav.dashboard}</span>
                      </span>
                    </a>
                  `
                  : ''
              }

              ${
                prefs.layoutMode === 'flat_classic'
                  ? `
                    <div class="space-y-1">
                      ${visibleGroups
                        .flatMap((g) => g.items)
                        .map((item) => {
                          const isActive = currentRoute === item.route;
                          return `
                            <a
                              href="#/${item.route}"
                              class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                isActive
                                  ? 'skin-nav-active text-white shadow-xs'
                                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                              }"
                            >
                              <span class="text-[10px] ${isActive ? 'text-white' : 'text-slate-400'}">●</span>
                              <span>${d.nav[item.labelKey]}</span>
                            </a>
                          `;
                        })
                        .join('')}
                    </div>
                  `
                  : `
                    <div class="space-y-2">
                      ${visibleGroups
                        .map((grp) => {
                          const isExpanded = this.expandedGroups.has(grp.id);
                          const hasActiveChild = grp.items.some((i) => i.route === currentRoute);
                          return `
                            <div class="rounded-xl border ${hasActiveChild ? 'border-sky-300 bg-sky-50/30 shadow-2xs' : 'border-slate-200 bg-slate-50/50'} overflow-hidden">
                              <button
                                type="button"
                                data-nav-group="${grp.id}"
                                class="w-full flex items-center justify-between gap-2 px-3 py-2 text-start text-xs font-bold transition-colors cursor-pointer ${
                                  hasActiveChild
                                    ? 'text-sky-950 bg-sky-100/70'
                                    : 'text-slate-800 hover:bg-slate-100'
                                }"
                              >
                                <span class="flex items-center gap-2">
                                  <span>${grp.icon}</span>
                                  <span>${i18n.bi(grp.titleAr, grp.titleEn)}</span>
                                </span>
                                <span class="flex items-center gap-1.5 shrink-0">
                                  <span class="rounded-full bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] font-mono text-slate-600">${grp.items.length}</span>
                                  <span class="nav-grp-arrow text-[10px] text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}">▼</span>
                                </span>
                              </button>
                              <div
                                id="nav-grp-body-${grp.id}"
                                class="${isExpanded ? 'block' : 'hidden'} px-2 py-1.5 space-y-0.5 bg-white border-t border-slate-100"
                              >
                                ${grp.items
                                  .map((item) => {
                                    const isActive = currentRoute === item.route;
                                    return `
                                      <a
                                        href="#/${item.route}"
                                        class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold leading-snug transition-colors ${
                                          isActive
                                            ? 'skin-nav-active text-white shadow-xs'
                                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                        }"
                                      >
                                        <span class="text-[10px] shrink-0 ${isActive ? 'text-white' : 'text-sky-500'}">●</span>
                                        <span>${d.nav[item.labelKey]}</span>
                                      </a>
                                    `;
                                  })
                                  .join('')}
                              </div>
                            </div>
                          `;
                        })
                        .join('')}
                    </div>
                  `
              }
            </nav>
          </aside>

          <!-- Screen Viewport -->
          <main id="screen-viewport" class="flex-1 p-6 max-w-[1440px] w-full mx-auto overflow-x-hidden"></main>
        </div>
      </div>
    `;

    themeService.bindToolbarEvents();

    document.getElementById('top-menu-settings-btn')?.addEventListener('click', () => {
      this.openMenuSettingsModal();
    });
    document.getElementById('sidebar-menu-config-btn')?.addEventListener('click', () => {
      this.openMenuSettingsModal();
    });

    // Bind collapsible group headers
    document.querySelectorAll<HTMLButtonElement>('button[data-nav-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const grpId = btn.getAttribute('data-nav-group');
        if (!grpId) return;
        const bodyEl = document.getElementById(`nav-grp-body-${grpId}`);
        const arrowEl = btn.querySelector('.nav-grp-arrow');
        if (this.expandedGroups.has(grpId)) {
          this.expandedGroups.delete(grpId);
          bodyEl?.classList.add('hidden');
          bodyEl?.classList.remove('block');
          arrowEl?.classList.remove('rotate-180');
        } else {
          if (prefs.layoutMode === 'grouped_accordion') {
            this.expandedGroups.clear();
            document.querySelectorAll('[id^="nav-grp-body-"]').forEach((el) => {
              el.classList.add('hidden');
              el.classList.remove('block');
            });
            document.querySelectorAll('.nav-grp-arrow').forEach((el) => {
              el.classList.remove('rotate-180');
            });
          }
          this.expandedGroups.add(grpId);
          bodyEl?.classList.remove('hidden');
          bodyEl?.classList.add('block');
          arrowEl?.classList.add('rotate-180');
        }
      });
    });

    document.getElementById('sidebar-toggle-all-btn')?.addEventListener('click', () => {
      if (this.expandedGroups.size >= visibleGroups.length) {
        this.expandedGroups.clear();
      } else {
        visibleGroups.forEach((g) => this.expandedGroups.add(g.id));
      }
      this.render();
    });

    document.getElementById('top-mysql-btn')?.addEventListener('click', () => {
      mysqlSyncService.openMySQLModal();
    });

    document.getElementById('top-global-search-btn')?.addEventListener('click', () => {
      advancedSearchService.openGlobalSearchModal();
    });

    document.getElementById('top-lang-btn')?.addEventListener('click', () => {
      i18n.toggleLang();
    });

    document.getElementById('top-pwa-btn')?.addEventListener('click', () => {
      pwaManager.triggerInstall();
    });

    document.getElementById('top-logout-btn')?.addEventListener('click', async () => {
      await authService.logout();
      router.navigate('login');
    });

    const viewport = document.getElementById('screen-viewport');
    if (!viewport) return;

    // Route Guard Check
    const matchedNav = SIDEBAR_ITEMS.find((i) => i.route === currentRoute);
    if (!prefs.showAllScreensRegardlessOfRole && matchedNav?.resource && !can(user, 'view', matchedNav.resource)) {
      await authService.logAudit(
        `محاولة فتح شاشة غير مصرح بها (403): ${currentRoute}`,
        matchedNav.resource,
        'ROUTE-GUARD-403',
        `User ${user.username} (${user.role}) tried to open #/${currentRoute}`
      );
      showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
      const { renderForbiddenPage } = await import('./pages/forbidden.page');
      renderForbiddenPage(viewport, currentRoute);
      return;
    }

    if (currentRoute === '403') {
      const { renderForbiddenPage } = await import('./pages/forbidden.page');
      renderForbiddenPage(viewport);
      return;
    }

    const pageRenderer = await loadPage(currentRoute);
    await pageRenderer(viewport);
    advancedSearchService.mountInScreenAdvancedSearch(viewport, currentRoute);
  }
}
