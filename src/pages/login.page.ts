import { authService } from '../auth/auth.service';
import { pwaManager } from '../components/pwa-install';
import { showToast } from '../components/toast';
import { i18n } from '../i18n';
import { router } from '../router';
import { themeService } from '../services/theme.service';

export async function renderLoginPage(container: HTMLElement): Promise<void> {
  const d = i18n.dict;
  const branchPilot = window.location.port === '3127';

  const demoAccounts = [
    { user: 'developer', pass: 'dev123', labelAr: '💻 المبرمج (Developer - قاعدة البيانات والإعدادات)', labelEn: 'System Developer (MySQL DB, Settings & Audit)' },
    { user: 'owner', pass: 'owner123', labelAr: 'مالك المعمل (Owner)', labelEn: 'Lab Owner (Lab Management)' },
    { user: 'doctor', pass: 'doctor123', labelAr: 'طبيب مختبر (Doctor)', labelEn: 'Lab Doctor (Review & Approve)' },
    { user: 'chemist', pass: 'chemist123', labelAr: 'كيميائي (Chemist)', labelEn: 'Biochemist (Results & Catalog)' },
    { user: 'technician', pass: 'tech123', labelAr: 'فني مختبر (Technician)', labelEn: 'Technician (Samples & Entry)' },
    { user: 'admin', pass: 'admin123', labelAr: 'استقبال / إداري (Receptionist)', labelEn: 'Receptionist (Patients & Billing)' },
    { user: 'accountant', pass: 'accountant123', labelAr: 'محاسب (Accountant)', labelEn: 'Accountant (Finance & Commissions)' },
  ];

  container.innerHTML = `
    ${branchPilot ? `
    <style>
      .tlab-login-animated { position:relative; overflow:hidden; background:linear-gradient(135deg,#07162e 0%,#0a3150 48%,#133c62 100%); isolation:isolate; }
      .tlab-login-animated::before { content:""; position:absolute; width:48rem; height:48rem; top:-28rem; inset-inline-end:-15rem; border-radius:50%; pointer-events:none; background:radial-gradient(circle,rgba(34,211,238,.22),transparent 68%); animation:tlab-login-glow 11s ease-in-out infinite alternate; }
      .tlab-login-animated::after { content:""; position:absolute; width:35rem; height:35rem; bottom:-23rem; inset-inline-start:-13rem; border-radius:50%; pointer-events:none; background:radial-gradient(circle,rgba(59,130,246,.23),transparent 70%); animation:tlab-login-glow 9s ease-in-out infinite alternate-reverse; }
      .tlab-login-animated > header, .tlab-login-animated > main, .tlab-login-animated > footer { position:relative; z-index:1; }
      .tlab-login-form { animation:tlab-login-enter .7s cubic-bezier(.2,.7,.2,1) both; box-shadow:0 22px 70px rgba(0,0,0,.25); }
      .tlab-login-form input:focus, .tlab-login-form select:focus { box-shadow:0 0 0 3px rgba(14,165,233,.16); transition:box-shadow .2s ease; }
      .tlab-login-showcase { animation:tlab-login-enter .9s .12s cubic-bezier(.2,.7,.2,1) both; position:relative; overflow:hidden; background:linear-gradient(145deg,rgba(8,38,70,.9),rgba(15,83,114,.75)); }
      .tlab-login-orbit { position:relative; width:15rem; height:15rem; margin:1.75rem auto; border:1px solid rgba(125,211,252,.35); border-radius:50%; animation:tlab-login-spin 22s linear infinite; }
      .tlab-login-orbit::before, .tlab-login-orbit::after { content:""; position:absolute; inset:1.8rem; border:1px dashed rgba(125,211,252,.32); border-radius:50%; }
      .tlab-login-orbit::after { inset:-1.6rem; border-style:solid; opacity:.35; }
      .tlab-login-core { position:absolute; inset:4.3rem; display:flex; justify-content:center; align-items:center; border-radius:50%; background:linear-gradient(135deg,#0284c7,#0e7490); box-shadow:0 0 45px rgba(34,211,238,.32); animation:tlab-login-counterspin 22s linear infinite; }
      .tlab-login-core svg { width:3.8rem; height:3.8rem; }
      .tlab-login-particle { position:absolute; width:1rem; height:1rem; border-radius:50%; background:#67e8f9; box-shadow:0 0 18px rgba(103,232,249,.8); }
      .tlab-login-particle.a { top:-.5rem; left:calc(50% - .5rem); }
      .tlab-login-particle.b { bottom:1.3rem; right:1.2rem; width:.7rem; height:.7rem; background:#a5b4fc; }
      .tlab-login-particle.c { top:30%; left:-.4rem; width:.6rem; height:.6rem; }
      .tlab-login-animated #login-form button[type="submit"] { transition:transform .2s ease,box-shadow .2s ease; }
      .tlab-login-animated #login-form button[type="submit"]:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(2,132,199,.28); }
      @keyframes tlab-login-enter { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:translateY(0); } }
      @keyframes tlab-login-spin { to { transform:rotate(360deg); } }
      @keyframes tlab-login-counterspin { to { transform:rotate(-360deg); } }
      @keyframes tlab-login-glow { to { transform:translate(3rem,2rem) scale(1.12); } }
      @media (prefers-reduced-motion:reduce) {
        .tlab-login-animated::before,.tlab-login-animated::after,.tlab-login-form,.tlab-login-showcase,.tlab-login-orbit,.tlab-login-core { animation:none !important; }
        .tlab-login-animated #login-form button[type="submit"]:hover { transform:none; }
      }
    </style>` : ''}
    <div class="min-h-screen skin-header text-slate-100 flex flex-col justify-between p-6 ${branchPilot ? 'tlab-login-animated' : ''}">
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
        <section class="lg:col-span-6 rounded-xl bg-white text-slate-900 p-8 shadow-xl border border-slate-200 flex flex-col justify-between ${branchPilot ? 'tlab-login-form' : ''}">
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
                  value="${branchPilot ? '' : 'owner'}"
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
                  value="${branchPilot ? '' : 'owner123'}"
                  autocomplete="current-password"
                  class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                />
              </div>
              ${branchPilot ? `
                <div class="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
                  <label for="login-branch" class="block text-xs font-bold text-slate-800">
                    ${i18n.bi('اختر الفرع المسموح لك بالدخول إليه', 'Select your authorized branch')}
                  </label>
                  <button id="login-load-branches" type="button" class="rounded bg-sky-800 text-white text-xs font-semibold px-3 py-2">
                    ${i18n.bi('التحقق من الحساب وعرض الفروع', 'Verify account and show branches')}
                  </button>
                  <select id="login-branch" required disabled class="w-full border rounded p-2 text-sm">
                    <option value="">${i18n.bi('تحقق من الحساب أولًا', 'Verify account first')}</option>
                  </select>
                </div>
              ` : ''}
              <button
                type="submit"
                class="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 transition-colors cursor-pointer"
              >
                ${d.login.submit}
              </button>
            </form>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>${branchPilot ? 'MySQL Server · Centralized Branch Data' : 'Legacy recovery mode — browser database'}</span>
            <span class="tabular-nums">v1.0.0</span>
          </div>
        </section>

        ${branchPilot ? `
          <section class="lg:col-span-6 rounded-2xl border border-cyan-300/20 p-7 sm:p-9 flex flex-col justify-between tlab-login-showcase" aria-label="${i18n.bi('التحقق الآمن من دخول فروع المعمل', 'Secure laboratory branch access')}">
            <div>
              <div class="inline-flex items-center gap-2 text-cyan-200 text-xs font-bold tracking-widest uppercase">
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                T-Lab · Multi-Branch
              </div>
              <h2 class="text-2xl sm:text-3xl font-black text-white mt-4 leading-snug">
                ${i18n.bi('معمل واحد، فروع متعددة، وصلاحيات دقيقة', 'One lab system. Multiple branches. Precise permissions.')}
              </h2>
              <p class="mt-3 text-sm leading-7 text-sky-100/85">
                ${i18n.bi('تحقق من حسابك ثم اختر الفرع المسموح لك بدخوله. كل فرع يعرض الصلاحيات المخصصة لك فقط.', 'Verify your account, then choose an authorized branch. Each branch uses your assigned permissions.')}
              </p>
            </div>
            <div class="tlab-login-orbit" aria-hidden="true">
              <span class="tlab-login-particle a"></span>
              <span class="tlab-login-particle b"></span>
              <span class="tlab-login-particle c"></span>
              <div class="tlab-login-core">
                <svg viewBox="0 0 64 64" fill="none" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M25 8h14M29 8v18L15 49a6 6 0 0 0 5 9h24a6 6 0 0 0 5-9L35 26V8"/>
                  <path d="M22 41h20M26 49h12"/><circle cx="33" cy="36" r="2"/><circle cx="28" cy="46" r="1.6"/>
                </svg>
              </div>
            </div>
            <div class="flex gap-3 flex-wrap text-xs text-sky-100">
              <span class="rounded-full bg-white/10 border border-white/15 px-3 py-1.5">🔒 ${i18n.bi('تحقق من الحساب', 'Account verification')}</span>
              <span class="rounded-full bg-white/10 border border-white/15 px-3 py-1.5">🏥 ${i18n.bi('اختيار الفرع', 'Branch selection')}</span>
              <span class="rounded-full bg-white/10 border border-white/15 px-3 py-1.5">✓ ${i18n.bi('صلاحيات مستقلة', 'Scoped permissions')}</span>
            </div>
          </section>
        ` : ''}
        <!-- Demo Accounts Selector -->
        <section class="lg:col-span-6 rounded-xl bg-slate-800/90 border border-slate-700 p-6 flex flex-col justify-between ${branchPilot ? 'hidden' : ''}">
          <div>
            <h2 class="text-sm font-bold text-white">${d.login.demoAccountsTitle}</h2>
            <p class="text-xs text-slate-400 mt-1">
              ${i18n.bi(
                'اضغط على أي حساب لتعبئة بيانات الدخول وتجربة الصلاحيات الخاصة بكل دور وظيفي في المعمل:',
                'Click any demo account below to autofill credentials and test role-specific permissions:'
              )}
            </p>
            <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              ${demoAccounts
                .map(
                  (acc) => `
                  <button
                    type="button"
                    data-demo-user="${acc.user}"
                    data-demo-pass="${acc.pass}"
                    class="demo-acc-btn text-start rounded-lg border border-slate-700 bg-slate-900/80 hover:border-sky-500 hover:bg-slate-900 p-3 transition-colors cursor-pointer"
                  >
                    <div class="text-xs font-bold text-white">${i18n.bi(acc.labelAr, acc.labelEn)}</div>
                    <div class="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
                      ${acc.user} / ${acc.pass}
                    </div>
                  </button>
                `
                )
                .join('')}
            </div>
          </div>

          <div class="mt-6 rounded-lg bg-slate-900/90 border border-slate-700 p-3.5 text-xs text-slate-300 space-y-1">
            <div class="font-semibold text-sky-400">
              ${i18n.bi('معمارية النظام (Repository + Services Layer):', 'System Architecture (Repository + Services Layer):')}
            </div>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              ${i18n.bi(
                'جميع البيانات مخزنة محليًا في IndexedDB عبر 23 جدولًا مع فصل كامل بين الواجهة والخدمات وطبقة الوصول للبيانات (DATA_SOURCE = local | api).',
                'All data is persisted locally in IndexedDB across 23 stores with strict separation between UI, Services, and Repositories (DATA_SOURCE = local | api).'
              )}
            </p>
          </div>
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

  const branchSelect = document.getElementById('login-branch') as HTMLSelectElement | null;
  const loginError = (message: string) => {
    const box = document.getElementById('login-error-box');
    if (box) { box.textContent = message; box.classList.remove('hidden'); }
    showToast(message, 'error');
  };
  const resetBranchSelection = () => {
    if (branchSelect) {
      branchSelect.replaceChildren(new Option('تحقق من الحساب أولًا / Verify account first', ''));
      branchSelect.disabled = true;
    }
  };
  if (branchPilot) {
    document.getElementById('login-username')?.addEventListener('input', resetBranchSelection);
    document.getElementById('login-password')?.addEventListener('input', resetBranchSelection);
    document.getElementById('login-load-branches')?.addEventListener('click', async () => {
      const username = (document.getElementById('login-username') as HTMLInputElement)?.value || '';
      const password = (document.getElementById('login-password') as HTMLInputElement)?.value || '';
      try {
        const response = await fetch('/api/branch-pilot/staff-branches', {
          method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({username,password}),
        });
        const data = await response.json() as {ok:boolean;error?:string;branches?:Array<{branchId:string;code:string;nameAr:string}>};
        if (!response.ok || !data.ok) throw new Error(data.error || 'INVALID_CREDENTIALS');
        if (!data.branches?.length) throw new Error(i18n.bi('لم يتم إسناد فروع لك. اطلب من الإدارة تحديد فروعك وصلاحياتك.', 'No assigned branches. Ask the administrator to assign branches and permissions.'));
        branchSelect?.replaceChildren(new Option('-- اختر الفرع / Choose branch --', ''));
        data.branches.forEach((b) => branchSelect?.add(new Option(b.code + ' — ' + b.nameAr, b.branchId)));
        if (branchSelect) branchSelect.disabled = false;
        document.getElementById('login-error-box')?.classList.add('hidden');
      } catch (error) { resetBranchSelection(); loginError(String(error instanceof Error ? error.message : error)); }
    });
  }

  document.querySelectorAll<HTMLButtonElement>('.demo-acc-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = btn.getAttribute('data-demo-user') || '';
      const p = btn.getAttribute('data-demo-pass') || '';
      const userEl = document.getElementById('login-username') as HTMLInputElement | null;
      const passEl = document.getElementById('login-password') as HTMLInputElement | null;
      if (userEl && passEl) {
        userEl.value = u;
        passEl.value = p;
      }
    });
  });

  const form = document.getElementById('login-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userEl = document.getElementById('login-username') as HTMLInputElement | null;
    const passEl = document.getElementById('login-password') as HTMLInputElement | null;
    const errBox = document.getElementById('login-error-box');

    let branchContext: import('../auth/auth.service').ActiveBranchContext | undefined;
    let verified: {userId:string;role:import('../types').RoleName} | undefined;
    if (branchPilot) {
      if (!branchSelect?.value || branchSelect.disabled) {
        loginError(i18n.bi('يجب التحقق من الحساب واختيار الفرع أولًا.', 'Verify your account and select a branch first.'));
        return;
      }
      try {
        const response = await fetch('/api/branch-pilot/staff-login', {
          method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            username:userEl?.value || '', password:passEl?.value || '', branchId:branchSelect.value,
          }),
        });
        const data = await response.json() as {
          ok:boolean;error?:string;userId:string;role:import('../types').RoleName;
          branch:{branchId:string;code:string;nameAr:string};
          permissions:import('../auth/auth.service').ActiveBranchContext['permissions'];
        };
        if (!response.ok || !data.ok) throw new Error(data.error || 'BRANCH_NOT_ASSIGNED');
        branchContext = { ...data.branch, permissions:data.permissions };
        verified = { userId:data.userId, role:data.role };
      } catch (error) {
        loginError(String(error instanceof Error ? error.message : error));
        return;
      }
    }
    const res = await authService.login(userEl?.value || '', passEl?.value || '', branchContext, verified);
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
