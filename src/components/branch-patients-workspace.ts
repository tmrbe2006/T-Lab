import type { User } from '../types';
import { escapeHtml } from './common';
import { renderBranchLabWorkspace } from './branch-lab-workspace';

type Branch = { id: string; code: string; nameAr: string };
type Patient = { id: string; name: string; phone: string; gender: string; version: number };
export async function renderBranchPatientsWorkspace(
  root: HTMLElement, user: User, branches: Branch[],
): Promise<void> {
  root.innerHTML = '<section dir="rtl" class="min-h-screen bg-slate-100 p-5 space-y-4">' +
    '<header class="bg-slate-900 text-white rounded p-4">' +
    '<h1 class="text-xl font-bold">T-Lab — ملف المرضى متعدد الفروع (تجريبي)</h1>' +
    '<p class="text-xs">المستخدم: ' + escapeHtml(user.username) + ' — الفروع الأخرى غير متاحة دون تصريح</p>' +
    '<p class="text-xs text-amber-200">النتائج المعتمدة والفواتير الرسمية والمخزون متعدد الفروع غير مفعلة لحماية البيانات.</p></header>' +
    '<div class="bg-white rounded border p-4 space-y-3">' +
    '<label>الفرع<select id="branch-patients-select" class="block border rounded p-2"></select></label>' +
    '<div id="branch-patients-list" class="overflow-x-auto text-sm"></div>' +
    '<button type="button" id="branch-patients-refresh" class="border rounded p-2">تحديث سجلات الفرع</button>' +
    '</div>' +
    '<form id="branch-patient-create" class="bg-white rounded border p-4 space-y-2">' +
    '<h2 class="font-semibold">تسجيل مريض وهمي في الفرع المختار</h2>' +
    '<input required name="name" maxlength="191" placeholder="الاسم" class="border rounded p-2 block">' +
    '<input name="phone" maxlength="32" placeholder="الهاتف" class="border rounded p-2 block">' +
    '<select name="gender" class="border rounded p-2 block"><option value="male">ذكر</option><option value="female">أنثى</option></select>' +
    '<button type="submit" class="border rounded p-2">إضافة المريض إلى الفرع المحدد</button></form>' +
    '<div id="branch-lab-branch-panel"></div>' +
    '<p id="branch-patient-status" role="status"></p>' +
    '<button type="button" id="branch-patients-logout" class="border rounded p-2">تسجيل خروج</button>' +
    '</section>';
  const select = root.querySelector<HTMLSelectElement>('#branch-patients-select');
  const status = root.querySelector<HTMLElement>('#branch-patient-status');
  const table = root.querySelector<HTMLElement>('#branch-patients-list');
  const say = (message: string) => { if (status) status.textContent = message; };
  if (select) {
    select.replaceChildren(new Option('اختر فرعًا مصرحًا لك', ''));
    for (const branch of branches) select.add(new Option(branch.nameAr + ' (' + branch.code + ')', branch.id));
  }
  const load = async () => {
    const branch = select?.value || '';
    if (table) table.replaceChildren();
    if (!branch) { say('اختر الفرع أولًا'); return; }
    try {
      const response = await fetch('/api/v3/branches/' + encodeURIComponent(branch) + '/patients?limit=50', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('الفرع غير مسموح أو قاعدة البيانات غير جاهزة (' + response.status + ')');
      const data = await response.json() as {items:Patient[];nextCursor:string|null};
      if (table) {
        table.innerHTML = '<table class="w-full"><thead><tr>' +
          '<th class="border p-2">اسم المريض</th><th class="border p-2">الهاتف</th>' +
          '<th class="border p-2">نسخة السجل</th></tr></thead><tbody>' +
          data.items.map(item => '<tr><td class="border p-2">' + escapeHtml(item.name) +
            '</td><td class="border p-2">' + escapeHtml(item.phone) +
            '</td><td class="border p-2">' + String(item.version) + '</td></tr>').join('') +
          '</tbody></table>';
      }
      const labHost = root.querySelector<HTMLElement>('#branch-lab-branch-panel');
      if (labHost) await renderBranchLabWorkspace(labHost,user,branch,data.items);
      say(data.nextCursor ? 'تُعرض أول 50 سجلاً فقط، لا يتم تحميل بقية الصفحات تلقائيًا.' :
        'تم تحميل سجلات الفرع المختار فقط.');
    } catch (error) { say(error instanceof Error ? error.message : 'تعذر تحميل المرضى'); }
  };
  select?.addEventListener('change', () => { void load(); });
  root.querySelector('#branch-patients-refresh')?.addEventListener('click', () => { void load(); });
  const form = root.querySelector<HTMLFormElement>('#branch-patient-create');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const branch = select?.value;
    if (!branch) { say('اختر فرعًا مسموحًا لك أولاً'); return; }
    const values = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/v3/branches/' + encodeURIComponent(branch) + '/patients', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:values.get('name'),phone:values.get('phone'),gender:values.get('gender')}),
      });
      if (!response.ok) throw new Error('العملية مرفوضة أو غير مسموح لهذا الفرع (' + response.status + ')');
      say('حُفظ المريض في الفرع المختار فقط، دون إنشاء تحليل أو فاتورة.');
      form.reset();
      await load();
    } catch (error) { say(error instanceof Error ? error.message : 'لم يتم حفظ المريض'); }
    finally { if (button) button.disabled = false; }
  });
  root.querySelector('#branch-patients-logout')?.addEventListener('click', async () => {
    const { authService } = await import('../auth/auth.service');
    await authService.logout();
    window.location.reload();
  });
}
