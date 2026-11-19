type Branch = { id: string; code: string; nameAr: string; active: boolean };
type Account = { id: string; username: string; role: string; active: boolean };

export async function renderBranchAdminPanel(root: HTMLElement): Promise<void> {
  root.innerHTML =
    '<section dir="rtl" class="rounded-xl border bg-white p-5 space-y-3">' +
    '<h2 class="font-bold">إعداد الفروع وصلاحيات الموظفين — مرحلة تأسيسية</h2>' +
    '<p class="text-sm text-rose-800">تحذير: إضافة الفروع والصلاحيات لا تعني أن بيانات المرضى أو النتائج مفصولة بعد. ' +
    'عند تفعيل وضع الفروع المتعددة يوقف السيرفر العمليات الطبية والمحاسبية غير المعزولة حتى إتمام الترحيل الآمن.</p>' +
    '<form id="branch-create" class="flex flex-wrap gap-2">' +
    '<input name="code" required pattern="[A-Za-z][A-Za-z0-9_-]{2,39}" placeholder="رمز الفرع" class="border rounded p-2">' +
    '<input name="name" required minlength="2" maxlength="120" placeholder="اسم الفرع بالعربية" class="border rounded p-2">' +
    '<button type="submit" class="border rounded p-2">إضافة فرع</button></form>' +
    '<div id="branch-admin-list" class="text-sm space-y-1"></div>' +
    '<form id="branch-grant" class="flex flex-wrap gap-2">' +
    '<select required name="branchId" class="border rounded p-2"><option value="">اختر الفرع</option></select>' +
    '<select required name="userId" class="border rounded p-2"><option value="">اختر الموظف</option></select>' +
    '<button type="submit" class="border rounded p-2">منح الموظف صلاحية الفرع</button></form>' +
    '<p id="branch-admin-status" role="status" class="text-xs"></p></section>';
  const status = root.querySelector<HTMLElement>('#branch-admin-status');
  const say = (message: string) => { if (status) status.textContent = message; };
  const api = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    if (!response.ok) throw new Error('رفض السيرفر العملية (' + response.status + ')');
    return response.json() as Promise<T>;
  };
  const refresh = async () => {
    const [branchData, staffData] = await Promise.all([
      api<{branches: Branch[]}>('/api/v2/branches'),
      api<{users: Account[]}>('/api/auth/staff'),
    ]);
    const listing = root.querySelector<HTMLElement>('#branch-admin-list');
    if (listing) {
      listing.replaceChildren();
      for (const branch of branchData.branches) {
        const p = document.createElement('p');
        p.textContent = branch.code + ' — ' + branch.nameAr +
          (branch.active ? ' (فعال في سجل الفروع فقط)' : ' (غير فعال)');
        listing.append(p);
      }
    }
    const branchSelect = root.querySelector<HTMLSelectElement>('#branch-grant [name="branchId"]');
    const userSelect = root.querySelector<HTMLSelectElement>('#branch-grant [name="userId"]');
    for (const select of [branchSelect, userSelect]) select?.replaceChildren(new Option('اختر', ''));
    for (const branch of branchData.branches.filter(b => b.active)) {
      branchSelect?.add(new Option(branch.nameAr + ' (' + branch.code + ')', branch.id));
    }
    for (const user of staffData.users.filter(u => u.active)) {
      userSelect?.add(new Option(user.username + ' (' + user.role + ')', user.id));
    }
    say('عدد الفروع المسجلة: ' + branchData.branches.length + '. لم يتم تفعيل عزل البيانات الطبية.');
  };
  const create = root.querySelector<HTMLFormElement>('#branch-create');
  create?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(create);
    try {
      await api('/api/v2/branches', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({code: data.get('code'), name: data.get('name')}),
      });
      create.reset();
      await refresh();
    } catch (error) { say(error instanceof Error ? error.message : 'فشل إنشاء الفرع'); }
  });
  const grant = root.querySelector<HTMLFormElement>('#branch-grant');
  grant?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(grant);
    try {
      await api('/api/v2/branches/' + encodeURIComponent(String(data.get('branchId'))) + '/grants', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({userId: data.get('userId')}),
      });
      say('تم ربط الموظف بالفرع في سجل الصلاحيات. لم يتم بعد فتح عمليات المرضى متعددة الفروع.');
    } catch (error) { say(error instanceof Error ? error.message : 'فشل منح الصلاحية'); }
  });
  try { await refresh(); } catch { say('تعذر تحميل الفروع أو الموظفين. تحقق من تهيئة قاعدة البيانات.'); }
}
