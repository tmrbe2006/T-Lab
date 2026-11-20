import { authService } from '../auth/auth.service';
import { pwaManager } from '../components/pwa-install';
import { showToast } from '../components/toast';
import { i18n } from '../i18n';
import { router } from '../router';
import { themeService } from '../services/theme.service';

export async function renderLoginPage(container: HTMLElement): Promise<void> {
  const d = i18n.dict;


  container.innerHTML = `
    <div class="min-h-screen skin-header text-slate-100 flex flex-col justify-between p-6">
      <!-- Top Bar -->
      <header class="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
        <div class="flex items-center gap-3">
          <img src="/icon.svg" alt="MedLab Pro" class="w-9 h-9 rounded-lg" referrerPolicy="no-referrer" />
          <span class="text-lg font-bold tracking-tight text-white whitespace-nowrap">${d.appTitle}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${themeService.renderThemeToolbarCompact()}
          <button
            id="login-pwa-btn"
            type="button"
            class="rounded-lg border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap cursor-pointer"
          >
            ${d.installApp}
          </button>
          <button
            id="login-lang-btn"
            type="button"
            class="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 whitespace-nowrap cursor-pointer"
          >
            ${d.langToggle}
          </button>
        </div>
      </header>

      <!-- Main Split Content -->
      <main class="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <!-- Login Form -->
        <section class="lg:col-span-6 rounded-xl bg-white text-slate-900 p-8 shadow-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div class="text-xs font-semibold text-sky-700 mb-1">${d.appSubtitle}</div>
            <h1 class="text-2xl font-bold text-slate-900">${d.login.title}</h1>
            <p class="text-xs text-slate-500 mt-1">${d.login.subtitle}</p>

            <div id="login-error-box" class="hidden mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-semibold text-rose-800"></div>

            <form id="login-form" class="mt-6 space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1.5">${d.login.username}</label>
                <input
                  id="login-username"
                  type="text"
                  required
                  value="developer"
                  autocomplete="username"
                  class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 mb-1.5">${d.login.password}</label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value=""
                  autocomplete="current-password"
                  class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="submit"
                class="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 transition-colors cursor-pointer"
              >
                ${d.login.submit}
              </button>
            </form>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>IndexedDB Local Persistence · Offline PWA</span>
            <span class="tabular-nums">v1.0.0</span>
          </div>
        </section>

        <section class="lg:col-span-6 rounded-xl bg-slate-800/90 border border-slate-700 p-6">
          <h2 class="text-lg font-semibold text-white">مرحلة تأمين السيرفر / Server Security Migration</h2>
          <p class="mt-3 text-sm text-slate-200">Server-based Developer and staff accounts are supported. Developer can provision staff in Settings. Staff may only access the secure patient pilot; legacy medical and financial screens are disabled pending complete server-side RBAC and MySQL synchronization. Configure TLAB_ADMIN_PASSWORD (16+ characters) on the server.</p>
        </section>
      </main>

      <footer class="max-w-6xl w-full mx-auto text-center text-xs text-slate-500 border-t border-slate-800 pt-4">
        Medical Lab Management System · Bilingual RTL/LTR · PWA Ready
      </footer>
    </div>
  `;

  themeService.bindToolbarEvents();

  document.getElementById('login-lang-btn')?.addEventListener('click', () => {
    i18n.toggleLang();
    renderLoginPage(container);
  });

  document.getElementById('login-pwa-btn')?.addEventListener('click', () => {
    pwaManager.triggerInstall();
  });

  const form = document.getElementById('login-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userEl = document.getElementById('login-username') as HTMLInputElement | null;
    const passEl = document.getElementById('login-password') as HTMLInputElement | null;
    const errBox = document.getElementById('login-error-box');

    const res = await authService.login(userEl?.value || '', passEl?.value || '');
    if (!res.ok) {
      if (errBox) {
        errBox.textContent = d.login.invalidCredentials;
        errBox.classList.remove('hidden');
      }
      showToast(d.login.invalidCredentials, 'error');
      return;
    }

    showToast(d.login.welcome, 'success');
    router.navigate('dashboard');
  });
}
