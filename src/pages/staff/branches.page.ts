import { authService } from '../../auth/auth.service';
import { can } from '../../guards/permission.guard';
import { i18n } from '../../i18n';

interface Branch {
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  isMain: boolean;
  active: boolean;
}
interface StaffUser { id: string; username: string; name: string; role: string }

const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (x) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x] || x);

async function api<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/branch-pilot' + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/**
 * This is an intentionally local-only administrative pilot. Other lab screens
 * still use legacy repositories: selecting/creating a branch here does NOT
 * yet scope patients, tests, results, invoices or inventory.
 */
export async function renderBranchesPage(container: HTMLElement): Promise<void> {
  const current = authService.getCurrentUser();
  if (!can(current, 'view', 'branches')) {
    container.textContent = i18n.bi('ليس لديك صلاحية إدارة الفروع.', 'Branch administration access denied.');
    return;
  }

  const heading = i18n.bi('إدارة الفروع — نسخة تجريبية محلية', 'Branch Administration — Local Pilot');
  const note = i18n.bi(
    'إدارة الفروع للمبرمج والمالك فقط. استخدم اسم المستخدم وكلمة المرور الخاصة بتسجيل الدخول لبرنامج T-Lab والمسجلين بجدول users في قاعدة MySQL الحالية؛ لا تستخدم حساب MySQL root أو كلمة مرور قاعدة البيانات. عزل المرضى والفواتير بين الفروع لم يكتمل بعد.',
    'Owner/Developer only. Sign in with your T-Lab application username and password stored in the MySQL users table. Do NOT use the MySQL root credentials. Clinical and financial data are NOT yet branch-isolated.',
  );
  const setMessage = (value: string) => {
    const target = container.querySelector<HTMLElement>('#branch-status');
    if (target) target.textContent = value;
  };
  const shell = (body: string) => {
    container.innerHTML = `
      <section class="space-y-4">
        <header class="rounded-xl bg-slate-900 text-white p-5">
          <h1 class="text-xl font-bold">${esc(heading)}</h1>
          <p class="text-sm mt-2 text-amber-200">${esc(note)}</p>
        </header>
        <div id="branch-status" role="status" class="text-sm text-slate-700"></div>
        ${body}
      </section>`;
  };

  const showLogin = (message = '') => {
    const appUsername = current?.username || '';
    shell(`
      <form id="branch-auth" class="rounded-xl border bg-white p-5 space-y-3 max-w-xl">
        <h2 class="font-bold">${esc(i18n.bi('التحقق من مسؤول الفروع', 'Verify branch administrator'))}</h2>
        <label class="block text-sm">${esc(i18n.bi('اسم مستخدم برنامج T-Lab (وليس root الخاص بـ MySQL)', 'T-Lab application username (not MySQL root)'))}
          <input name="username" value="${esc(appUsername)}" autocomplete="username" required maxlength="64" class="block mt-1 border rounded p-2 w-full" />
        </label>
        <label class="block text-sm">${esc(i18n.bi('كلمة مرور حساب T-Lab', 'T-Lab account password'))}
          <input name="password" type="password" autocomplete="current-password" required class="block mt-1 border rounded p-2 w-full" />
        </label>
        <p class="text-xs text-amber-800">${esc(i18n.bi('إذا كان الحساب موجودًا في المتصفح فقط وغير محفوظ في جدول users على MySQL، فلن تعمل هذه الشاشة حتى تتم مزامنة حساب الإدارة بطريقة آمنة.', 'If the application account exists only in the browser and not in the MySQL users table, the admin login cannot work until that account is securely provisioned.'))}</p>
        <button type="submit" class="bg-sky-700 text-white rounded p-2 font-semibold">${esc(i18n.bi('الدخول لإدارة الفروع', 'Sign in'))}</button>
      </form>`);
    setMessage(message);
    const form = container.querySelector<HTMLFormElement>('#branch-auth');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      try {
        await api('/login', {
          username: String(values.get('username') || ''),
          password: String(values.get('password') || ''),
        });
        await showBranches();
      } catch (err) {
        const error = String(err instanceof Error ? err.message : err);
        const explanation = error === 'MYSQL_USER_IS_NOT_APP_USER'
          ? i18n.bi('حساب root خاص بخادم MySQL، وليس مستخدمًا ببرنامج T-Lab. استخدم حساب المبرمج أو المالك المسجل داخل البرنامج.', 'MySQL root is a database account, not a T-Lab application account. Use the app Owner or Developer username.')
          : error === 'ADMIN_ACCOUNT_NOT_FOUND'
            ? i18n.bi('حساب الإدارة غير موجود في جدول users بقاعدة MySQL الحالية أو غير مفعل. تحقق من اسم القاعدة وحساب الإدارة دون حذف بيانات.', 'The administrator account is not present or active in this MySQL users table. Verify the configured database and safely provision the account.')
            : error === 'INVALID_CREDENTIALS'
              ? i18n.bi('كلمة مرور مستخدم T-Lab غير صحيحة لهذا الحساب في قاعدة MySQL، وهي مختلفة عن كلمة مرور خادم MySQL.', 'The T-Lab account password does not match the user stored in MySQL. It is different from the MySQL server password.')
              : error;
        setMessage(explanation);
      } finally {
        const pwd = form.querySelector<HTMLInputElement>('input[name="password"]');
        if (pwd) pwd.value = '';
      }
    });
  };

  const showBranches = async () => {
    let branches: Branch[], users: StaffUser[];
    try {
      const responses = await Promise.all([
        api<{ ok: boolean; branches: Branch[] }>('/branches'),
        api<{ ok: boolean; users: StaffUser[] }>('/users'),
      ]);
      branches = responses[0].branches;
      users = responses[1].users;
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      if (/Session required/.test(msg)) { showLogin(); return; }
      shell('<div class="rounded-xl border p-4 bg-white"></div>');
      setMessage(i18n.bi('تعذر تحميل بيانات الفروع: ', 'Could not load branches: ') + msg);
      return;
    }

    shell(`
      <div class="rounded-xl bg-white border p-4 space-y-2">
        <div class="flex justify-between items-center">
          <h2 class="font-bold">${esc(i18n.bi('الفروع المسجلة', 'Registered Branches'))}</h2>
          <button id="branch-logout" class="underline text-sm text-slate-600">${esc(i18n.bi('خروج مسؤول الفروع', 'Administrator sign out'))}</button>
        </div>
        <div class="space-y-2">
          ${branches.map((b) => `<div class="border rounded p-3 flex justify-between"><div><strong>${esc(b.nameAr)}</strong> <span class="text-xs text-slate-500">(${esc(b.code)})</span></div><span class="text-xs">${b.isMain ? esc(i18n.bi('رئيسي', 'Main')) : ''}</span></div>`).join('')}
        </div>
      </div>
      <div class="grid lg:grid-cols-2 gap-4">
        <form id="branch-create" class="rounded-xl border bg-white p-4 space-y-3">
          <h2 class="font-bold">${esc(i18n.bi('إضافة فرع', 'Create Branch'))}</h2>
          <input name="code" required maxlength="32" placeholder="BR-002" class="border rounded p-2 w-full" />
          <input name="nameAr" required maxlength="191" placeholder="${esc(i18n.bi('اسم الفرع بالعربية', 'Branch Arabic name'))}" class="border rounded p-2 w-full" />
          <input name="nameEn" maxlength="191" placeholder="Branch English name" class="border rounded p-2 w-full" />
          <button class="bg-sky-700 text-white rounded p-2 font-semibold">${esc(i18n.bi('حفظ الفرع', 'Save branch'))}</button>
        </form>
        <form id="branch-assign" class="rounded-xl border bg-white p-4 space-y-3">
          <h2 class="font-bold">${esc(i18n.bi('إسناد مستخدم إلى فرع', 'Assign user to branch'))}</h2>
          <select name="userId" required class="border rounded p-2 w-full">
            ${users.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.role)})</option>`).join('')}
          </select>
          <select name="branchId" required class="border rounded p-2 w-full">
            ${branches.map((b) => `<option value="${esc(b.branchId)}">${esc(b.nameAr)} (${esc(b.code)})</option>`).join('')}
          </select>
          <button class="bg-sky-700 text-white rounded p-2 font-semibold">${esc(i18n.bi('حفظ الإسناد', 'Save assignment'))}</button>
        </form>
      </div>`);

    container.querySelector('#branch-logout')?.addEventListener('click', async () => {
      try { await api('/logout', {}); } catch { /* session expires anyway */ }
      showLogin();
    });

    for (const [formId, path] of [['#branch-create', '/branches'], ['#branch-assign', '/assign']] as const) {
      container.querySelector<HTMLFormElement>(formId)?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
        try {
          await api(path, data);
          await showBranches();
          setMessage(i18n.bi('تم حفظ البيانات بنجاح.', 'Saved successfully.'));
        } catch (err) {
          setMessage(i18n.bi('تعذر الحفظ: ', 'Save failed: ') + String(err instanceof Error ? err.message : err));
        }
      });
    }
  };

  await showBranches();
}
