import { authService } from '../../auth/auth.service';
import { ALL_ACTIONS, ALL_RESOURCES } from '../../db/seed';
import { i18n } from '../../i18n';
import type { PermissionAction, ResourceScreen } from '../../types';

type UserOption = { id:string; username:string; name:string; role:string };
type BranchOption = { branchId:string; code:string; nameAr:string };
type MatrixRow = { resource:string; actions:Record<string, boolean> };

async function callApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/branch-pilot' + path, {
    method:body ? 'POST' : 'GET', credentials:'same-origin',
    headers:body ? {'Content-Type':'application/json'} : undefined,
    body:body ? JSON.stringify(body) : undefined,
    cache:'no-store',
  });
  const data = await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Per-user, per-branch RBAC editor for Owner/Developer (not a global role editor). */
export async function renderBranchPermissionPanel(container: HTMLElement): Promise<void> {
  const current = authService.getCurrentUser();
  if (!current || !['Developer','Owner'].includes(current.role) || !authService.getActiveBranch()) {
    container.textContent = i18n.bi('ليس لديك صلاحية إدارة صلاحيات الفروع.', 'Branch permissions access denied.');
    return;
  }
  container.innerHTML =
    '<div class="space-y-4">' +
      '<h2 class="text-xl font-bold text-slate-900">صلاحيات المستخدم حسب الفرع / User permissions by branch</h2>' +
      '<p class="text-sm text-slate-600">الصلاحيات هنا لكل مستخدم داخل فرع محدد، وليست تعديلًا عامًا للدور. اختر المستخدم والفرع. التعديلات لا تؤثر على الفروع الأخرى؛ والخانات المقفلة تحتفظ بقيمها.</p>' +
      '<div class="grid sm:grid-cols-2 gap-3 rounded-xl border bg-white p-4">' +
        '<label class="text-sm font-semibold">المستخدم / User<select id="bp-user" class="block w-full border p-2 rounded mt-2"></select></label>' +
        '<label class="text-sm font-semibold">الفرع / Branch<select id="bp-branch" class="block w-full border p-2 rounded mt-2"></select></label>' +
      '</div>' +
      '<div id="bp-status" role="status" class="text-sm"></div>' +
      '<div id="bp-grid" class="border rounded-xl bg-white overflow-auto"></div>' +
      '<div class="flex gap-3"><button id="bp-save" class="rounded bg-sky-700 text-white px-4 py-2 font-bold">حفظ صلاحيات هذا المستخدم في هذا الفرع</button>' +
      '<a href="#/branches" class="border rounded px-4 py-2">إسناد مستخدم لفرع</a></div>' +
    '</div>';
  const userEl = container.querySelector<HTMLSelectElement>('#bp-user')!;
  const branchEl = container.querySelector<HTMLSelectElement>('#bp-branch')!;
  const statusEl = container.querySelector<HTMLElement>('#bp-status')!;
  const grid = container.querySelector<HTMLElement>('#bp-grid')!;
  const save = container.querySelector<HTMLButtonElement>('#bp-save')!;
  let currentRows: MatrixRow[] = [];

  const message = (text: string) => { statusEl.textContent = text; };
  const renderGrid = () => {
    grid.replaceChildren();
    const table = document.createElement('table');
    table.className = 'w-full text-xs text-start min-w-[1100px]';
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.className = 'border-b bg-slate-100';
    const first = document.createElement('th');
    first.textContent = 'الشاشة / Screen';
    first.className = 'p-3 text-start';
    hr.append(first);
    for (const action of ALL_ACTIONS) {
      const th = document.createElement('th');
      th.className = 'p-2 text-center';
      th.textContent = i18n.dict.actions[action] || action;
      hr.append(th);
    }
    head.append(hr);
    table.append(head);
    const body = document.createElement('tbody');
    body.className = 'divide-y';
    for (const resource of ALL_RESOURCES) {
      const record = currentRows.find((row) => row.resource === resource);
      const tr = document.createElement('tr');
      const title = document.createElement('td');
      title.className = 'p-2 font-bold whitespace-nowrap';
      const screenLabel = ((i18n.dict.nav as Record<string,string>)[resource] || resource) + ' (' + resource + ')';
      const selectAllLabel = document.createElement('label');
      selectAllLabel.className = 'inline-flex items-center gap-2 cursor-pointer';
      const selectAll = document.createElement('input');
      selectAll.type = 'checkbox';
      selectAll.className = 'bp-row-all w-4 h-4 accent-emerald-600';
      selectAll.setAttribute('aria-label', i18n.bi('تحديد كل صلاحيات شاشة ', 'Select all permissions for ') + screenLabel);
      selectAllLabel.append(selectAll, document.createTextNode(screenLabel));
      title.append(selectAllLabel);
      tr.append(title);
      for (const action of ALL_ACTIONS) {
        const td = document.createElement('td');
        td.className = 'p-2 text-center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'bp-allow w-4 h-4 accent-sky-600';
        cb.dataset.resource = resource;
        cb.dataset.action = action;
        cb.checked = record?.actions[action] === true;
        if ((resource === 'settings' && action !== 'view') ||
            (['branches','permissions'].includes(resource) && !['view','print','edit','managePermissions'].includes(action))) {
          cb.disabled = true;
        }
        td.append(cb);
        tr.append(td);
      }
      // Row Select All controls only enabled actions in THIS screen.
      // Disabled/locked actions remain unchanged.
      const enabledActions = Array.from(tr.querySelectorAll<HTMLInputElement>('.bp-allow:not(:disabled)'));
      const syncRowSelectAll = () => {
        const checked = enabledActions.filter((cb) => cb.checked).length;
        selectAll.checked = enabledActions.length > 0 && checked === enabledActions.length;
        selectAll.indeterminate = checked > 0 && checked < enabledActions.length;
        selectAll.disabled = enabledActions.length === 0;
      };
      selectAll.addEventListener('change', () => {
        for (const cb of enabledActions) cb.checked = selectAll.checked;
        syncRowSelectAll();
      });
      for (const cb of enabledActions) cb.addEventListener('change', syncRowSelectAll);
      syncRowSelectAll();
      body.append(tr);
    }
    table.append(body);
    grid.append(table);
  };
  const loadPermissions = async () => {
    if (!userEl.value || !branchEl.value) { currentRows=[]; grid.replaceChildren(); save.disabled=true; return; }
    try {
      const path = '/user-permissions?userId=' + encodeURIComponent(userEl.value) + '&branchId=' + encodeURIComponent(branchEl.value);
      const data = await callApi<{ok:boolean;rows:MatrixRow[]}>(path);
      currentRows = data.rows;
      renderGrid();
      save.disabled=false;
      message(i18n.bi('تم تحميل صلاحيات هذا المستخدم في هذا الفرع. الخانات غير المحددة ممنوعة.', 'Branch-specific permissions loaded; unchecked operations are denied.'));
    } catch (error) {
      currentRows=[]; grid.replaceChildren(); save.disabled=true;
      message(String(error instanceof Error ? error.message : error));
    }
  };
  const loadUserBranches = async () => {
    branchEl.replaceChildren(new Option('-- اختر الفرع --', ''));
    save.disabled=true;
    grid.replaceChildren();
    if (!userEl.value) return;
    try {
      const data = await callApi<{ok:boolean;branches:BranchOption[]}>('/user-branches?userId=' + encodeURIComponent(userEl.value));
      data.branches.forEach((b) => branchEl.add(new Option(b.code + ' — ' + b.nameAr, b.branchId)));
      if (!data.branches.length) message('لم يتم إسناد أي فرع لهذا المستخدم. افتح إدارة الفروع أولًا.');
      else message('اختر فرع المستخدم لعرض وتعديل صلاحياته.');
    } catch (error) { message(String(error instanceof Error ? error.message : error)); }
  };
  userEl.addEventListener('change', () => { void loadUserBranches(); });
  branchEl.addEventListener('change', () => { void loadPermissions(); });
  save.addEventListener('click', async () => {
    if (!userEl.value || !branchEl.value) return;
    save.disabled=true;
    try {
      // Preserve permissions that the UI intentionally makes non-editable.
      // Previously every disabled checkbox was submitted as false, silently
      // revoking existing privileges whenever any other permission was saved.
      const rows = ALL_RESOURCES.map((resource:ResourceScreen) => {
        const previous = currentRows.find(row => row.resource === resource);
        const actions = {} as Record<PermissionAction,boolean>;
        ALL_ACTIONS.forEach((action) => {
          actions[action] = previous?.actions?.[action] === true;
        });
        return { resource, actions };
      });
      grid.querySelectorAll<HTMLInputElement>('.bp-allow:not(:disabled)').forEach((cb) => {
        const row = rows.find((r) => r.resource === cb.dataset.resource);
        if (row && cb.dataset.action) row.actions[cb.dataset.action as PermissionAction] = cb.checked;
      });
      await callApi('/user-permissions', {userId:userEl.value,branchId:branchEl.value,rows});
      message('تم حفظ صلاحيات المستخدم لهذا الفرع فقط. يجب إعادة الدخول لتفعيل الصلاحيات الجديدة.');
      await loadPermissions();
    } catch (error) { message(String(error instanceof Error ? error.message : error)); }
    finally { save.disabled=false; }
  });
  try {
    const data = await callApi<{ok:boolean;users:UserOption[]}>('/users');
    userEl.replaceChildren(new Option('-- اختر المستخدم --', ''));
    data.users.forEach((u) => userEl.add(new Option(u.name + ' (' + u.username + ', ' + u.role + ')', u.id)));
    branchEl.replaceChildren(new Option('-- اختر الفرع --', ''));
    save.disabled=true;
    message('اختر المستخدم لتظهر فروعه، ثم اختر الفرع.');
  } catch (error) { message(String(error instanceof Error ? error.message : error)); save.disabled=true; }
}
