import { authService } from './auth/auth.service';
import { showToast } from './components/common';
import { pwaManager } from './components/pwa-install';
import { can } from './guards/permission.guard';
import { i18n } from './i18n';
import { router, type RouteId } from './router';
import { advancedSearchService } from './services/advanced-search.service';
import { mysqlSyncService } from './services/mysql-sync.service';
import { themeService } from './services/theme.service';
import type { ResourceScreen } from './types';

interface NavItem {
  route: RouteId;
  resource?: ResourceScreen;
  labelKey: keyof typeof i18n.dict.nav;
}

const SIDEBAR_ITEMS: NavItem[] = [
  { route: 'dashboard', resource: 'dashboard', labelKey: 'dashboard' },
  { route: 'patients', resource: 'patients', labelKey: 'patients' },
  { route: 'doctors', resource: 'doctors', labelKey: 'doctors' },
  { route: 'doctorSpecialties', resource: 'doctorSpecialties', labelKey: 'doctorSpecialties' },
  { route: 'requests', resource: 'requests', labelKey: 'requests' },
  { route: 'samples', resource: 'samples', labelKey: 'samples' },
  { route: 'results', resource: 'results', labelKey: 'results' },
  { route: 'resultReview', resource: 'resultReview', labelKey: 'resultReview' },
  { route: 'tests', resource: 'tests', labelKey: 'tests' },
  { route: 'scientificDepartments', resource: 'scientificDepartments', labelKey: 'scientificDepartments' },
  { route: 'sampleTubes', resource: 'sampleTubes', labelKey: 'sampleTubes' },
  { route: 'testParameters', resource: 'testParameters', labelKey: 'testParameters' },
  { route: 'inventory', resource: 'inventory', labelKey: 'inventory' },
  { route: 'purchases', resource: 'purchases', labelKey: 'purchases' },
  { route: 'erpAccounting', resource: 'erpAccounting', labelKey: 'erpAccounting' },
  { route: 'invoices', resource: 'invoices', labelKey: 'invoices' },
  { route: 'payments', resource: 'payments', labelKey: 'payments' },
  { route: 'commissions', resource: 'commissions', labelKey: 'commissions' },
  { route: 'accounts', resource: 'accounts', labelKey: 'accounts' },
  { route: 'journalEntries', resource: 'journalEntries', labelKey: 'journalEntries' },
  { route: 'cashbox', resource: 'cashbox', labelKey: 'cashbox' },
  { route: 'expenses', resource: 'expenses', labelKey: 'expenses' },
  { route: 'reports', resource: 'reports', labelKey: 'reports' },
  { route: 'employees', resource: 'employees', labelKey: 'employees' },
  { route: 'users', resource: 'users', labelKey: 'users' },
  { route: 'permissions', resource: 'permissions', labelKey: 'permissions' },
  { route: 'printing', resource: 'printing', labelKey: 'printing' },
  { route: 'settings', resource: 'settings', labelKey: 'settings' },
  { route: 'auditLogs', resource: 'permissions', labelKey: 'auditLogs' },
  { route: 'testPlan', labelKey: 'testPlan' },
];

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
    case 'samples': {
      const { renderSamplesPage } = await import('./pages/operations/samples.page');
      return renderSamplesPage;
    }
    case 'results': {
      const { renderResultsEntryPage } = await import('./pages/operations/results-entry.page');
      return renderResultsEntryPage;
    }
    case 'resultReview': {
      const { renderResultReviewPage } = await import('./pages/operations/results-review.page');
      return renderResultReviewPage;
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

    // Filter sidebar links strictly by 'view' permission
    const allowedNavItems = SIDEBAR_ITEMS.filter((item) => {
      if (!item.resource) return true;
      return can(user, 'view', item.resource);
    });

    const d = i18n.dict;

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
          <aside class="w-full lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-e border-slate-200 p-3">
            <nav class="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
              ${allowedNavItems
                .map((item) => {
                  const isActive = currentRoute === item.route;
                  return `
                    <a
                      href="#/${item.route}"
                      class="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        isActive
                          ? 'skin-nav-active text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }"
                    >
                      ${d.nav[item.labelKey]}
                    </a>
                  `;
                })
                .join('')}
            </nav>
          </aside>

          <!-- Screen Viewport -->
          <main id="screen-viewport" class="flex-1 p-6 max-w-[1440px] w-full mx-auto overflow-x-hidden"></main>
        </div>
      </div>
    `;

    themeService.bindToolbarEvents();

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
    if (matchedNav?.resource && !can(user, 'view', matchedNav.resource)) {
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
