import { renderStaffReviewQueue } from '../components/staff-review-queue';
import { renderStockQuarantinePanel } from '../components/stock-quarantine-pilot';
import { renderStockQcReviewPanel } from '../components/stock-qc-review-pilot';
import { renderPreliminaryEntry } from '../components/preliminary-result-entry';
import { renderStaffLabPilot } from '../components/staff-lab-pilot';
import { authService } from '../auth/auth.service';
import { escapeHtml } from '../components/common';
import { router } from '../router';
import type { User } from '../types';

type Patient = { id: string; code?: string; name: string; phone?: string; gender?: string; active?: boolean };
type Versioned = { record: Patient; version: number };
type PageResult = { ok: boolean; items: Versioned[]; nextCursor: string | null };

export async function renderStaffPatientPilot(root: HTMLElement, user: User): Promise<void> {
  // Dedicated, deliberately limited UI. NO IndexedDB, no cached patient data,
  // no legacy module navigation or raw MySQL bulk sync.
  const editable = user.role === 'Receptionist' || user.role === 'Owner';
  root.innerHTML = `
    <div class="min-h-screen bg-slate-100 text-slate-900 p-5" dir="rtl">
      <header class="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-3 bg-slate-900 text-white rounded-xl p-4 mb-5">
        <div><h1 class="text-lg font-bold">T-Lab — ملف المرضى المؤمّن (تجريبي)</h1>
          <p class="text-xs text-slate-300">حساب: ${escapeHtml(user.username)} / ${escapeHtml(user.role)} — لا تتوفر باقي الشاشات للموظفين حتى اكتمال الحماية.</p>
        </div>
        <button id="staff-pilot-logout" type="button" class="rounded bg-rose-600 px-4 py-2 text-sm font-semibold">تسجيل الخروج</button>
      </header>
      <main class="max-w-6xl mx-auto space-y-4">
        <div id="staff-pilot-status" role="status" class="bg-white border rounded p-3 text-sm"></div>
        ${editable ? `
        <form id="staff-pilot-create" class="bg-white border rounded p-4 flex flex-wrap gap-3 items-end">
          <label class="text-sm">اسم المريض
            <input required name="name" maxlength="191" class="block rounded border p-2" />
          </label>
          <label class="text-sm">رقم الهاتف
            <input name="phone" maxlength="64" class="block rounded border p-2" />
          </label>
          <label class="text-sm">النوع
            <select name="gender" class="block rounded border p-2"><option value="male">ذكر</option><option value="female">أنثى</option></select>
          </label>
          <button class="rounded bg-indigo-700 text-white px-4 py-2" type="submit">إضافة مريض إلى MySQL</button>
        </form>` : ''}
        <div class="bg-white border rounded p-4 space-y-3">
          <div class="flex justify-between items-center gap-2">
            <h2 class="font-bold">سجلات المرضى</h2>
            <button id="staff-pilot-refresh" class="rounded border px-3 py-2 text-xs">تحديث</button>
          </div>
          <div id="staff-pilot-list" class="overflow-x-auto"></div>
          <div class="flex gap-2">
            <button id="staff-pilot-next" class="rounded border px-3 py-1 text-xs" disabled>الصفحة التالية</button>
          </div>
        </div>
        <div id="staff-lab-pilot-panel"></div>
        <div id="staff-review-queue-panel"></div>
        <div id="staff-stock-quarantine-panel"></div>
        <div id="staff-qc-review-panel"></div>
        <div id="staff-preliminary-entry-panel"></div>
      </main>
    </div>`;
  const status = root.querySelector<HTMLElement>('#staff-pilot-status');
  const table = root.querySelector<HTMLElement>('#staff-pilot-list');
  const nextButton = root.querySelector<HTMLButtonElement>('#staff-pilot-next');
  const say = (message: string) => { if (status) status.textContent = message; };
  let cursor = '';
  let nextCursor: string | null = null;
  const jsonRequest = async <T>(url: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await res.json() as T & { error?: string };
    if (!res.ok) {
      if (res.status === 401) {
        await authService.logout();
        router.navigate('login');
      }
      throw new Error(res.status === 409 ? 'تم تعديل السجل من جهاز آخر. حدث القائمة وأعد المحاولة.' :
        data.error || `Server rejected the operation (${res.status})`);
    }
    return data;
  };
  const load = async () => {
    say('جارٍ قراءة السجلات المصرح بها من MySQL...');
    try {
      const data = await jsonRequest<PageResult>('/api/v2/patients?limit=50&cursor=' + encodeURIComponent(cursor));
      nextCursor = data.nextCursor;
      if (nextButton) nextButton.disabled = !nextCursor;
      if (!table) return;
      const rows = data.items;
      table.innerHTML = rows.length ? `
        <table class="min-w-full text-xs border-collapse">
          <thead><tr><th class="border p-2">الكود</th><th class="border p-2">اسم المريض</th><th class="border p-2">الهاتف</th><th class="border p-2">الإصدار</th><th class="border p-2">العمليات</th></tr></thead>
          <tbody>${rows.map((item, index) => `
            <tr><td class="border p-2">${escapeHtml(item.record.code || '')}</td>
              <td class="border p-2">${escapeHtml(item.record.name)}</td>
              <td class="border p-2">${escapeHtml(item.record.phone || '')}</td>
              <td class="border p-2">${item.version}</td>
              <td class="border p-2">
                ${editable ? `<button class="rounded border px-2 py-1" data-patient-index="${index}" data-patient-action="select">اختيار لطلب</button>` : ''}
                <button class="rounded border px-2 py-1" data-patient-index="${index}" data-patient-action="view">تفاصيل</button>
                ${editable ? `<button class="rounded border px-2 py-1" data-patient-index="${index}" data-patient-action="edit">تعديل</button>` : ''}
                ${user.role === 'Owner' ? `<button class="rounded border px-2 py-1 text-rose-700" data-patient-index="${index}" data-patient-action="delete">تعطيل</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="text-sm text-slate-500">لا توجد سجلات مرضى في هذه الصفحة.</div>';

      table.querySelectorAll<HTMLButtonElement>('button[data-patient-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const item = rows[Number(btn.dataset.patientIndex)];
          if (!item) return;
          const action = btn.dataset.patientAction;
          if (action === 'select') {
            const input = root.querySelector<HTMLInputElement>('#lab-pilot-request input[name="patientId"]');
            if (input) {
              input.value = item.record.id;
              say('تم اختيار المريض ' + item.record.name + ' لطلب التحاليل.');
            }
            return;
          }
          if (action === 'view') {
            say(`المريض: ${item.record.name} — الكود: ${item.record.code} — إصدار: ${item.version}`);
            return;
          }
          if (action === 'delete') {
            if (!window.confirm('تعطيل هذا السجل مع الاحتفاظ به في MySQL وسجل التدقيق؟')) return;
            try {
              await jsonRequest('/api/v2/patients/' + encodeURIComponent(item.record.id), {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: item.version }),
              });
              say('تم تعطيل السجل دون حذفه نهائيًا.');
              await load();
            } catch (error) { say(error instanceof Error ? error.message : String(error)); }
            return;
          }
          const name = window.prompt('اسم المريض بعد التعديل', item.record.name);
          if (name === null) return;
          try {
            await jsonRequest('/api/v2/patients/' + encodeURIComponent(item.record.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ version: item.version, changes: { name } }),
            });
            say('حُفظ التعديل على MySQL بنجاح.');
            await load();
          } catch (error) { say(error instanceof Error ? error.message : String(error)); }
        });
      });
      say('تم تحميل ' + rows.length + ' سجلًا من سيرفر MySQL.');
    } catch (error) { say(error instanceof Error ? error.message : String(error)); }
  };

  root.querySelector('#staff-pilot-logout')?.addEventListener('click', async () => {
    await authService.logout();
    router.navigate('login');
  });
  root.querySelector('#staff-pilot-refresh')?.addEventListener('click', () => { void load(); });
  nextButton?.addEventListener('click', () => {
    if (nextCursor) { cursor = nextCursor; void load(); }
  });
  root.querySelector<HTMLFormElement>('#staff-pilot-create')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    try {
      await jsonRequest('/api/v2/patients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: values.get('name'), phone: values.get('phone'), gender: values.get('gender') }),
      });
      form.reset(); cursor = '';
      await load();
      say('تم إضافة المريض إلى MySQL بنجاح.');
    } catch (error) { say(error instanceof Error ? error.message : String(error)); }
  });
  await load();
  const labPanel = root.querySelector<HTMLElement>('#staff-lab-pilot-panel');
  if (labPanel && ['Owner', 'Receptionist', 'Doctor', 'Chemist', 'Technician'].includes(user.role)) {
    await renderStaffLabPilot(labPanel, user);
  }
  const reviewPanel = root.querySelector<HTMLElement>('#staff-review-queue-panel');
  if (reviewPanel) await renderStaffReviewQueue(reviewPanel, user);
  const quarantinePanel = root.querySelector<HTMLElement>('#staff-stock-quarantine-panel');
  if (quarantinePanel) await renderStockQuarantinePanel(quarantinePanel, user);
  const qcPanel = root.querySelector<HTMLElement>('#staff-qc-review-panel');
  if (qcPanel) await renderStockQcReviewPanel(qcPanel, user);
  const entryPanel = root.querySelector<HTMLElement>('#staff-preliminary-entry-panel');
  if (entryPanel) await renderPreliminaryEntry(entryPanel, user);
}
