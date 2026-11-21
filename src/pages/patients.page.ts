import { authService } from '../auth/auth.service';
import {
  bindTablePagination,
  createPaginationControls,
  openCustomModal,
  openDeleteConfirmModal,
  paginateArray,
  showToast,
} from '../components/common';
import { can, enforcePermission } from '../guards/permission.guard';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import { patientsRepository, requestsRepository } from '../repositories';
import type { DiscountType, Patient } from '../types';

function calculateAgeFromBirthDate(birthDateStr: string): number | null {
  if (!birthDateStr) return null;
  const dob = new Date(birthDateStr);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, Math.min(130, age));
}

export async function renderPatientsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  // The Windows branch pilot is always MySQL-authoritative. The obsolete
  // localStorage switch only changed labels, not the actual repository source.
  const liveMySQL = window.location.port === '3127';
  let allPatients: Patient[];
  try {
    allPatients = await patientsRepository.getAll();
  } catch (error) {
    // Never present an empty browser list as a successful MySQL query.
    container.replaceChildren();
    const alert = document.createElement('section');
    alert.className = 'rounded-xl border border-rose-300 bg-rose-50 p-6 space-y-3';
    const title = document.createElement('h2');
    title.className = 'font-bold text-rose-900 text-lg';
    title.textContent = i18n.bi('فشل تحميل المرضى من قاعدة MySQL', 'Unable to load patients from MySQL');
    const details = document.createElement('p');
    details.className = 'text-sm font-mono text-rose-800';
    details.textContent = error instanceof Error ? error.message : 'MYSQL_PATIENTS_UNAVAILABLE';
    const hint = document.createElement('p');
    hint.className = 'text-sm text-slate-700';
    hint.textContent = i18n.bi(
      'لم يتم عرض بيانات المتصفح بدل MySQL. تحقق من اختيار الفرع وتسجيل الدخول، ومن تطبيق سكريبت ربط المرضى بالفروع على نسخة اختبار ووجود بيانات المرضى في قاعدة MySQL.',
      'No IndexedDB fallback was used. Verify branch selection, login, patient-branch mapping migration and MySQL patient records.',
    );
    const refresh = document.createElement('button');
    refresh.className = 'px-4 py-2 rounded bg-sky-700 text-white';
    refresh.textContent = i18n.bi('إعادة المحاولة', 'Retry');
    refresh.addEventListener('click', () => { void renderPatientsPage(container); });
    alert.append(title,details,hint,refresh);
    container.append(alert);
    return;
  }
  // Both patients and requests must be fetched from the authenticated branch,
  // never from a browser-local patient history.
  let allRequests: Awaited<ReturnType<typeof requestsRepository.getAllRequests>>;
  try {
    allRequests = await requestsRepository.getAllRequests();
  } catch (error) {
    if (liveMySQL) {
      container.textContent = i18n.bi('فشل تحميل طلبات المرضى من MySQL: ', 'MySQL patient requests unavailable: ') +
        String(error instanceof Error ? error.message : error);
      return;
    }
    throw error;
  }
  let mysqlBranchDiagnostic = '';
  if (liveMySQL && allPatients.length === 0 && ['Developer','Owner'].includes(user?.role || '')) {
    try {
      const response=await fetch('/api/branch-pilot/branch-data-diagnostics',{
        credentials:'same-origin',cache:'no-store',
      });
      const data=await response.json() as {
        ok?:boolean;source?:string;
        stores?:{patients?:{total:number;branch:number;unmapped:number}};
      };
      if(response.ok && data.ok && data.source==='mysql' && data.stores?.patients){
        const {total,branch,unmapped}=data.stores.patients;
        mysqlBranchDiagnostic=total===0
          ? i18n.bi('جدول المرضى في MySQL فارغ بالفعل. استيراد السكريبت لا يستورد سجلات المتصفح القديمة.',
              'The MySQL patients table is empty; schema installation does not import browser records.')
          : branch===0
            ? i18n.bi(`يوجد ${total} مريض في MySQL، لكن لا يوجد مرضى مرتبطون بالفرع الحالي. سجلات بدون ربط: ${unmapped}. لا يتم نقل بيانات الفروع تلقائيًا.`,
                `${total} patients exist in MySQL but none are assigned to this branch. Unmapped: ${unmapped}. Branch data is never moved automatically.`)
            : '';
      }
    }catch{/* show the existing zero-row state without inventing a diagnosis */}
  }
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = (): Patient[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allPatients;
    return allPatients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.nameEn || '').toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.nationalId.includes(q)
    );
  };

  const generateNextPatientCode = (): string => {
    const nums = allPatients.map((p) => {
      const m = p.code.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 1000;
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 1000;
    return `PAT-${maxNum + 1}`;
  };

  const printSinglePatient = (p: Patient) => {
    const reqCount = allRequests.filter((r) => r.patientId === p.id).length;
    const discText =
      p.hasDefaultDiscount && p.defaultDiscountType === 'percentage'
        ? `${p.defaultDiscountValue}% (${i18n.bi('نسبة مئوية', 'Percentage')})`
        : p.hasDefaultDiscount && p.defaultDiscountType === 'fixed'
        ? `${p.defaultDiscountValue} EGP (${i18n.bi('مبلغ ثابت', 'Fixed Amount')})`
        : i18n.bi('بدون خصم افتراضي', 'No Default Discount');

    const html = `
      <div style="border:1px solid #cbd5e1; border-radius:8px; padding:16px; margin-bottom:14px;">
        <h3 style="margin:0 0 12px 0; font-size:15px; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
          ${i18n.bi('بطاقة بيانات المريض المسجل', 'Registered Patient Profile Card')} — ${p.code}
        </h3>
        <table class="print-table">
          <tbody>
            <tr>
              <th style="width:28%;">${i18n.bi('كود المريض', 'Patient Code')}</th>
              <td class="tabular-nums"><strong>${p.code}</strong></td>
              <th style="width:28%;">${i18n.bi('تاريخ التسجيل', 'Registration Date')}</th>
              <td class="tabular-nums">${p.createdAt}</td>
            </tr>
            <tr>
              <th>${i18n.bi('اسم المريض (عربي)', 'Patient Name (Arabic)')}</th>
              <td><strong>${p.name}</strong></td>
              <th>${i18n.bi('اسم المريض (إنجليزي)', 'Patient Name (English)')}</th>
              <td dir="ltr"><strong>${p.nameEn || '-'}</strong></td>
            </tr>
            <tr>
              <th>${i18n.bi('النوع (Gender)', 'Gender')}</th>
              <td>${p.gender === 'male' ? i18n.bi('ذكر (Male)', 'Male') : i18n.bi('أنثى (Female)', 'Female')}</td>
              <th>${i18n.bi('تاريخ الميلاد / العمر', 'Birth Date / Age')}</th>
              <td class="tabular-nums">${p.birthDate || '-'} (${p.age} ${i18n.bi('سنة', 'Years')})</td>
            </tr>
            <tr>
              <th>${i18n.bi('رقم الهاتف', 'Phone Number')}</th>
              <td class="tabular-nums">${p.phone}</td>
              <th>${i18n.bi('الرقم القومي / الطبي', 'National / Medical ID')}</th>
              <td class="tabular-nums">${p.nationalId || '-'}</td>
            </tr>
            <tr>
              <th>${i18n.bi('العنوان', 'Address')}</th>
              <td>${p.address || '-'}</td>
              <th>${i18n.bi('الخصم الافتراضي للمريض', 'Default Discount')}</th>
              <td>${discText}</td>
            </tr>
            <tr>
              <th>${i18n.bi('عدد الطلبات المسجلة', 'Total Lab Requests')}</th>
              <td class="tabular-nums">${reqCount}</td>
              <th>${i18n.dict.common.notes}</th>
              <td>${p.notes || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    printService.printA4(`${i18n.bi('بيانات المريض:', 'Patient Profile:')} ${p.name}`, html);
  };

  const openPatientForm = (existing?: Patient) => {
    const isEdit = Boolean(existing);
    const defaultBirthDate = existing?.birthDate || '1996-01-01';
    const initialCalculatedAge = existing?.age ?? calculateAgeFromBirthDate(defaultBirthDate) ?? 30;
    const title = isEdit
      ? i18n.bi(`تعديل بيانات المريض: ${existing?.name}`, `Edit Patient: ${existing?.name}`)
      : i18n.bi('إضافة مريض جديد', 'Add New Patient');

    openCustomModal(
      title,
      `
        <form id="patient-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم المريض بالكامل (عربي) *', 'Patient Full Name (Arabic) *')}</label>
            <input name="name" required value="${existing?.name || ''}" placeholder="${i18n.bi('أدخل اسم المريض باللغة العربية', 'Arabic Full Name')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم المريض باللغة الإنجليزية (English Name)', 'Patient Full Name (English)')}</label>
            <input name="nameEn" value="${existing?.nameEn || ''}" placeholder="e.g. Mohamed Salah Ahmed" dir="ltr" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('رقم الهاتف *', 'Phone Number *')}</label>
            <input name="phone" required value="${existing?.phone || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('النوع', 'Gender')}</label>
            <select name="gender" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="male" ${existing?.gender === 'male' ? 'selected' : ''}>${i18n.bi('ذكر (Male)', 'Male')}</option>
              <option value="female" ${existing?.gender === 'female' ? 'selected' : ''}>${i18n.bi('أنثى (Female)', 'Female')}</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('تاريخ الميلاد (يحسب العمر تلقائيًا)', 'Birth Date (Auto-calculates Age)')}</label>
            <input id="pat-birthdate-input" name="birthDate" type="date" value="${defaultBirthDate}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('العمر (سنة) - يُحسب أوتوماتيكيًا', 'Age (Years) - Auto-calculated')}</label>
            <input id="pat-age-input" name="age" type="number" min="0" max="130" required value="${initialCalculatedAge}" class="w-full rounded-lg border border-sky-300 bg-sky-50/40 px-3 py-2 text-sm font-mono font-bold text-slate-900" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('الرقم القومي / الطبي', 'National / Medical ID')}</label>
            <input name="nationalId" value="${existing?.nationalId || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('العنوان', 'Address')}</label>
            <input name="address" value="${existing?.address || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('نوع الخصم الافتراضي للمريض', 'Default Discount Type')}</label>
              <select name="defaultDiscountType" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="none" ${!existing?.hasDefaultDiscount || existing?.defaultDiscountType === 'none' ? 'selected' : ''}>${i18n.bi('بدون خصم افتراضي', 'No Default Discount')}</option>
                <option value="percentage" ${existing?.defaultDiscountType === 'percentage' ? 'selected' : ''}>${i18n.bi('نسبة مئوية (%)', 'Percentage (%)')}</option>
                <option value="fixed" ${existing?.defaultDiscountType === 'fixed' ? 'selected' : ''}>${i18n.bi('مبلغ ثابت (EGP)', 'Fixed Amount (EGP)')}</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('قيمة الخصم الافتراضي', 'Default Discount Value')}</label>
              <input name="defaultDiscountValue" type="number" min="0" step="0.5" value="${existing?.defaultDiscountValue ?? 0}" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('الحالة', 'Status')}</label>
              <select name="active" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="true" ${existing?.active !== false ? 'selected' : ''}>${i18n.dict.common.active}</option>
                <option value="false" ${existing?.active === false ? 'selected' : ''}>${i18n.dict.common.inactive}</option>
              </select>
            </div>
          </div>
          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.notes}</label>
            <input name="notes" value="${existing?.notes || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
              ${i18n.dict.actions.save}
            </button>
          </div>
        </form>
      `,
      (close) => {
        const birthInput = document.getElementById('pat-birthdate-input') as HTMLInputElement | null;
        const ageInput = document.getElementById('pat-age-input') as HTMLInputElement | null;

        const syncAgeFromBirthDate = () => {
          if (!birthInput || !ageInput) return;
          const computed = calculateAgeFromBirthDate(birthInput.value);
          if (computed !== null) {
            ageInput.value = String(computed);
          }
        };

        birthInput?.addEventListener('input', syncAgeFromBirthDate);
        birthInput?.addEventListener('change', syncAgeFromBirthDate);

        // Also if user enters age manually, estimate birth year
        ageInput?.addEventListener('change', () => {
          if (!birthInput || !ageInput) return;
          const enteredAge = Number(ageInput.value);
          if (Number.isFinite(enteredAge) && enteredAge >= 0 && enteredAge <= 130) {
            const currentYear = new Date().getFullYear();
            const targetYear = currentYear - Math.floor(enteredAge);
            const parts = (birthInput.value || '1996-01-01').split('-');
            const month = parts[1] || '01';
            const day = parts[2] || '01';
            birthInput.value = `${targetYear}-${month}-${day}`;
          }
        });

        const form = document.getElementById('patient-form') as HTMLFormElement | null;
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const allowed = await enforcePermission(isEdit ? 'edit' : 'add', 'patients');
          if (!allowed) {
            showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
            return;
          }
          const fd = new FormData(form);
          const dType = (fd.get('defaultDiscountType') as DiscountType) || 'none';
          const dVal = Math.max(0, Number(fd.get('defaultDiscountValue')) || 0);
          const bDate = String(fd.get('birthDate') || '1996-01-01');
          const autoAge = calculateAgeFromBirthDate(bDate);
          const finalAge = Number(fd.get('age')) || autoAge || 0;

          const record: Patient = {
            id: existing?.id || `pat_${Date.now()}`,
            code: existing?.code || generateNextPatientCode(),
            name: String(fd.get('name') || '').trim(),
            nameEn: String(fd.get('nameEn') || '').trim(),
            phone: String(fd.get('phone') || '').trim(),
            gender: (fd.get('gender') as 'male' | 'female') || 'male',
            age: finalAge,
            birthDate: bDate,
            nationalId: String(fd.get('nationalId') || '').trim(),
            address: String(fd.get('address') || '').trim(),
            notes: String(fd.get('notes') || '').trim(),
            hasDefaultDiscount: dType !== 'none' && dVal > 0,
            defaultDiscountType: dType,
            defaultDiscountValue: dType === 'none' ? 0 : dVal,
            active: fd.get('active') === 'true',
            createdAt: existing?.createdAt || new Date().toISOString().slice(0, 10),
          };
          try {
            await patientsRepository.save(record);
          } catch (error) {
            showToast(
              i18n.bi('فشل حفظ المريض على MySQL: ', 'MySQL patient save failed: ') +
                String(error instanceof Error ? error.message : error),
              'error',
            );
            return;
          }
          await authService.logAudit(
            isEdit ? `تعديل مريض: ${record.name}` : `إضافة مريض: ${record.name}`,
            'patients',
            record.id,
            `Name EN: ${record.nameEn || '-'} | Age: ${record.age}`
          );
          showToast(i18n.bi('تم حفظ بيانات المريض بنجاح', 'Patient saved successfully'), 'success');
          close();
          allPatients = await patientsRepository.getAll();
          renderTable();
        });
      }
    );
  };

  const renderTable = () => {
    const filteredRows = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const rows = paginateArray(filteredRows, currentPage, itemsPerPage);
    const pagState = { currentPage, itemsPerPage, totalItems: filteredRows.length };
    const canAdd = can(user, 'add', 'patients');
    const canPrint = can(user, 'print', 'patients');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.patients}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة ملفات المرضى (عربي / إنجليزي)، حساب العمر تلقائيًا من تاريخ الميلاد، والخصومات الافتراضية',
                'Manage patient records (Arabic / English), automatic age calculation from birth date, and default discounts'
              )}
            </p>
          </div>
          <div class="flex items-center gap-2">
            ${
              canPrint
                ? `<button id="pat-print-btn" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>`
                : ''
            }
            ${
              canAdd
                ? `<button id="pat-add-btn" type="button" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>`
                : ''
            }
          </div>
        </div>

        ${liveMySQL ? `<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 font-semibold">${i18n.bi('مصدر البيانات: MySQL مباشر، المرضى والطلبات مرتبطون بالفرع المختار. إذا كان العدد صفرًا، افحص عدد السجلات وربطها بهذا الفرع.', 'Source: direct MySQL for branch-scoped patients and requests. If there are zero records, check their branch assignments.')}</div>` : window.location.port === '3127' ? `<div class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 font-semibold">${i18n.bi('وضع الاستعادة: بيانات المرضى والطلبات محفوظة في المتصفح كما في النسخ السابقة، وليست بيانات MySQL أو معزولة بين الفروع. لا تحذف بيانات المتصفح. زر MySQL يختبر الخادم فقط.', 'Recovery mode: patients and requests come from existing browser storage, not MySQL or isolated per branch. Do not clear browser data. The MySQL button checks server connectivity only.')}</div>` : ''}
        ${mysqlBranchDiagnostic ? `<div class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 font-semibold">${mysqlBranchDiagnostic}</div>` : ''}
        <div class="flex flex-wrap items-center justify-between gap-3">
          <input
            id="pat-search-input"
            type="search"
            value="${searchQuery}"
            placeholder="${i18n.dict.actions.search}"
            class="w-full sm:w-80 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs focus:border-sky-600 focus:outline-none"
          />
          <div class="text-xs text-slate-500 font-mono tabular-nums">
            ${filteredRows.length} / ${allPatients.length} ${i18n.bi('مريض', 'Patients')}
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('اسم المريض (عربي / إنجليزي)', 'Patient Name (AR / EN)')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.phone}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النوع / العمر', 'Gender / Age')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('الخصم الافتراضي للمريض', 'Default Discount')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('عدد الطلبات', 'Requests')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows
                .map((p) => {
                  const reqCount = allRequests.filter((r) => r.patientId === p.id).length;
                  const discText =
                    p.hasDefaultDiscount && p.defaultDiscountType === 'percentage'
                      ? `${p.defaultDiscountValue}% (${i18n.bi('نسبة', 'Percent')})`
                      : p.hasDefaultDiscount && p.defaultDiscountType === 'fixed'
                      ? `${p.defaultDiscountValue} EGP (${i18n.bi('مبلغ ثابت', 'Fixed')})`
                      : i18n.bi('لا يوجد', 'None');
                  return `
                    <tr class="hover:bg-slate-50/80">
                      <td class="py-2.5 px-3 font-mono font-semibold text-slate-700 tabular-nums">${p.code}</td>
                      <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        ${p.nameEn ? `<div class="text-[11px] text-slate-500" dir="ltr">${p.nameEn}</div>` : ''}
                      </td>
                      <td class="py-2.5 px-3 font-mono text-slate-600 tabular-nums">${p.phone}</td>
                      <td class="py-2.5 px-3 text-slate-600">${p.gender === 'male' ? i18n.bi('ذكر', 'M') : i18n.bi('أنثى', 'F')} · <span class="tabular-nums font-bold">${p.age}</span></td>
                      <td class="py-2.5 px-3 font-mono font-semibold ${p.hasDefaultDiscount ? 'text-emerald-700' : 'text-slate-400'} tabular-nums">${discText}</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">
                        <button type="button" data-hist-id="${p.id}" class="pat-hist-btn text-sky-700 hover:underline font-semibold cursor-pointer">
${reqCount} ${i18n.bi('طلب', 'Reqs')}
                        </button>
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <button type="button" data-print-id="${p.id}" class="pat-row-print-btn rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                            ${i18n.bi('طباعة', 'Print')}
                          </button>
                          <button type="button" data-edit-id="${p.id}" class="pat-edit-btn rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                            ${i18n.dict.actions.edit}
                          </button>
                          <button type="button" data-del-id="${p.id}" class="pat-del-btn rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                            ${i18n.dict.actions.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
        ${createPaginationControls(pagState, undefined, 'pat-pag')}
      </div>
    `;

    bindTablePagination(
      container,
      pagState,
      (page) => {
        currentPage = page;
        renderTable();
      },
      'pat-pag'
    );

    const searchInput = document.getElementById('pat-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      searchQuery = searchInput.value;
      currentPage = 1;
      renderTable();
      const newInput = document.getElementById('pat-search-input') as HTMLInputElement | null;
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });

    document.getElementById('pat-add-btn')?.addEventListener('click', () => openPatientForm());

    document.getElementById('pat-print-btn')?.addEventListener('click', () => {
      const visible = getFiltered();
      const html = `
        <table class="print-table">
          <thead>
            <tr>
              <th>${i18n.dict.common.code}</th>
              <th>${i18n.bi('الاسم (عربي / إنجليزي)', 'Name (AR / EN)')}</th>
              <th>${i18n.dict.common.phone}</th>
              <th>${i18n.bi('النوع / العمر', 'Gender / Age')}</th>
              <th>${i18n.bi('الخصم الافتراضي', 'Default Discount')}</th>
            </tr>
          </thead>
          <tbody>
            ${visible
              .map(
                (p) => `
                <tr>
                  <td class="tabular-nums">${p.code}</td>
                  <td>${p.name}${p.nameEn ? ` / ${p.nameEn}` : ''}</td>
                  <td class="tabular-nums">${p.phone}</td>
                  <td class="tabular-nums">${p.gender} / ${p.age}</td>
                  <td class="tabular-nums">${
                    p.hasDefaultDiscount ? `${p.defaultDiscountValue} (${p.defaultDiscountType})` : '-'
                  }</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
      printService.printA4(
        i18n.dict.nav.patients,
        html,
        `${i18n.bi('عدد السجلات المطبوعة:', 'Printed Records:')} ${visible.length}`
      );
    });

    document.querySelectorAll<HTMLButtonElement>('.pat-row-print-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-print-id');
        const target = allPatients.find((p) => p.id === id);
        if (target) printSinglePatient(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.pat-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-id');
        const target = allPatients.find((p) => p.id === id);
        if (target) openPatientForm(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.pat-hist-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-hist-id');
        const target = allPatients.find((p) => p.id === id);
        if (!target) return;
        const pReqs = allRequests.filter((r) => r.patientId === target.id);
        openCustomModal(
          `${i18n.bi('سجل طلبات المريض:', 'Patient Request History:')} ${target.name}`,
          `
            <div class="text-xs space-y-3">
              ${
                pReqs.length === 0
                  ? `<p class="text-slate-500">${i18n.bi('لا توجد طلبات مسجلة لهذا المريض.', 'No requests found for this patient.')}</p>`
                  : `<table class="w-full text-start border-collapse">
                      <thead>
                        <tr class="border-b border-slate-200 text-slate-500">
                          <th class="py-2">${i18n.bi('رقم الطلب', 'Request #')}</th>
                          <th class="py-2">${i18n.dict.common.date}</th>
                          <th class="py-2">${i18n.dict.common.status}</th>
                          <th class="py-2">${i18n.dict.common.net}</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        ${pReqs
                          .map(
                            (r) => `
                            <tr>
                              <td class="py-2 font-mono font-semibold tabular-nums">${r.requestNumber}</td>
                              <td class="py-2 font-mono tabular-nums">${r.createdAt}</td>
                              <td class="py-2">${i18n.dict.statuses[r.status] || r.status}</td>
                              <td class="py-2 font-mono font-bold tabular-nums">${r.netTotal} EGP</td>
                            </tr>
                          `
                          )
                          .join('')}
                      </tbody>
                    </table>`
              }
            </div>
          `
        );
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.pat-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-id');
        const target = allPatients.find((p) => p.id === id);
        if (!target) return;

        openDeleteConfirmModal({
          recordLabel: `${i18n.bi('المريض:', 'Patient:')} ${target.name} (${target.code})`,
          onConfirm: async (reason) => {
            const allowed = await enforcePermission('delete', 'patients');
            if (!allowed) {
              showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
              return;
            }
            try {
              await patientsRepository.delete(target.id);
            } catch (error) {
              showToast(
                i18n.bi('تعذر تعطيل المريض في MySQL: ', 'MySQL patient archive failed: ') +
                  String(error instanceof Error ? error.message : error),
                'error',
              );
              return;
            }
            await authService.logAudit(
              `حذف مريض: ${target.name}`,
              'patients',
              target.id,
              reason || 'Confirmed by user'
            );
            showToast(i18n.bi(`تم حذف المريض ${target.name} بنجاح`, `Deleted patient ${target.name}`), 'success');
            allPatients = await patientsRepository.getAll();
            renderTable();
          },
        });
      });
    });
  };

  renderTable();
}
