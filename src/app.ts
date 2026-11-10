import { authService } from './auth/auth.service';
import { pwaManager } from './components/pwa-install';
import { showToast } from './components/toast';
import { can } from './guards/permission.guard';
import { i18n } from './i18n';
import { renderTestParametersPage, renderTestsCatalogPage } from './pages/catalog.page';
import { renderDashboardPage } from './pages/dashboard.page';
import { renderDoctorsPage } from './pages/doctors.page';
import {
  renderAccountingPage,
  renderCommissionsPage,
  renderInvoicesPage,
  renderPaymentsPage,
} from './pages/finance.page';
import { renderForbiddenPage } from './pages/forbidden.page';
import { renderLoginPage } from './pages/login.page';
import {
  renderRequestsPage,
  renderResultReviewPage,
  renderResultsEntryPage,
  renderSamplesPage,
} from './pages/operations.page';
import { renderPatientsPage } from './pages/patients.page';
import {
  renderAuditLogsPage,
  renderPrintingHubPage,
  renderSettingsPage,
  renderTestPlanPage,
} from './pages/settings-audit.page';
import {
  renderEmployeesPage,
  renderPermissionsPage,
  renderUsersPage,
} from './pages/staff-users.page';
import { router, type RouteId } from './router';
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
  { route: 'requests', resource: 'requests', labelKey: 'requests' },
  { route: 'samples', resource: 'samples', labelKey: 'samples' },
  { route: 'results', resource: 'results', labelKey: 'results' },
  { route: 'resultReview', resource: 'resultReview', labelKey: 'resultReview' },
  { route: 'tests', resource: 'tests', labelKey: 'tests' },
  { route: 'testParameters', resource: 'testParameters', labelKey: 'testParameters' },
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

export class MedicalLabApp {
  private rootEl: HTMLElement;

  constructor(rootEl: HTMLElement) {
    this.rootEl = rootEl;
    router.onRouteChange(() => this.render());
    i18n.onChange(() => this.render());
    themeService.onChange(() => this.render());
  }

  public async render(): Promise<void> {
    const user = authService.getCurrentUser();
    const currentRoute = router.getRoute();

    if (!user) {
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
      renderForbiddenPage(viewport, currentRoute);
      return;
    }

    if (currentRoute === '403') {
      renderForbiddenPage(viewport);
      return;
    }

    switch (currentRoute) {
      case 'dashboard':
        await renderDashboardPage(viewport);
        break;
      case 'patients':
        await renderPatientsPage(viewport);
        break;
      case 'doctors':
        await renderDoctorsPage(viewport);
        break;
      case 'employees':
        await renderEmployeesPage(viewport);
        break;
      case 'users':
        await renderUsersPage(viewport);
        break;
      case 'permissions':
        await renderPermissionsPage(viewport);
        break;
      case 'tests':
        await renderTestsCatalogPage(viewport);
        break;
      case 'testParameters':
        await renderTestParametersPage(viewport);
        break;
      case 'requests':
        await renderRequestsPage(viewport);
        break;
      case 'samples':
        await renderSamplesPage(viewport);
        break;
      case 'results':
        await renderResultsEntryPage(viewport);
        break;
      case 'resultReview':
        await renderResultReviewPage(viewport);
        break;
      case 'invoices':
        await renderInvoicesPage(viewport);
        break;
      case 'payments':
        await renderPaymentsPage(viewport);
        break;
      case 'commissions':
        await renderCommissionsPage(viewport);
        break;
      case 'accounts':
      case 'journalEntries':
      case 'cashbox':
      case 'expenses':
      case 'reports':
        await renderAccountingPage(viewport, currentRoute);
        break;
      case 'settings':
        await renderSettingsPage(viewport);
        break;
      case 'printing':
        await renderPrintingHubPage(viewport);
        break;
      case 'auditLogs':
        await renderAuditLogsPage(viewport);
        break;
      case 'testPlan':
        await renderTestPlanPage(viewport);
        break;
      default:
        await renderDashboardPage(viewport);
        break;
    }
  }
}
