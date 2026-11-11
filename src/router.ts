export type RouteId =
  | 'login'
  | '403'
  | 'dashboard'
  | 'patients'
  | 'doctors'
  | 'doctorSpecialties'
  | 'employees'
  | 'users'
  | 'permissions'
  | 'tests'
  | 'scientificDepartments'
  | 'sampleTubes'
  | 'testParameters'
  | 'requests'
  | 'samples'
  | 'results'
  | 'aiHub'
  | 'bloodFilmAi'
  | 'urineMicroscopyAi'
  | 'stoolMicroscopyAi'
  | 'microbiology'
  | 'qualityControl'
  | 'homeVisits'
  | 'corporateContracts'
  | 'resultReview'
  | 'reports'
  | 'invoices'
  | 'payments'
  | 'accounts'
  | 'journalEntries'
  | 'cashbox'
  | 'expenses'
  | 'commissions'
  | 'settings'
  | 'printing'
  | 'inventory'
  | 'purchases'
  | 'erpAccounting'
  | 'auditLogs'
  | 'testPlan';

class AppRouter {
  private currentRoute: RouteId = 'dashboard';
  private listeners: Array<(route: RouteId) => void> = [];

  constructor() {
    window.addEventListener('hashchange', () => {
      const hashRoute = this.readHashRoute();
      this.currentRoute = hashRoute;
      this.notify();
    });
    this.currentRoute = this.readHashRoute();
  }

  private readHashRoute(): RouteId {
    const raw = window.location.hash.replace(/^#\/?/, '').trim();
    if (!raw) return 'dashboard';
    return raw as RouteId;
  }

  public getRoute(): RouteId {
    return this.currentRoute;
  }

  public navigate(route: RouteId): void {
    this.currentRoute = route;
    const nextHash = `#/${route}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      this.notify();
    }
  }

  public onRouteChange(cb: (route: RouteId) => void): void {
    this.listeners.push(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb(this.currentRoute);
    }
  }
}

export const router = new AppRouter();
