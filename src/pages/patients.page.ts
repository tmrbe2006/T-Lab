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

export async function renderPatientsPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let allPatients = await patientsRepository.getAll();
  const allRequests = await requestsRepository.getAllRequests();
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 15;

  const getFiltered = (): Patient[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allPatients;
    return allPatients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.nationalId.includes(q)
    );
  };

  const openPatientForm = (existing?: Patient) => {
    const isEdit = Boolean(existing);
    const title = isEdit
      ? i18n.bi(`تعديل بيانات المريض: ${existing?.name}`, `Edit Patient: ${existing?.name}`)
      : i18n.bi('إضافة مريض جديد', 'Add New Patient');

    openCustomModal(
      title,
      `
        <form id="patient-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('اسم المريض بالكامل *', 'Full Name *')}</label>
            <input name="name" required value="${existing?.name || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
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
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('العمر (سنة)', 'Age (Years)')}</label>
            <input name="age" type="number" min="0" max="120" required value="${existing?.age ?? 30}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('تاريخ الميلاد', 'Birth Date')}</label>
            <input name="birthDate" type="date" value="${existing?.birthDate || '1996-01-01'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('الرقم القومي / الطبي', 'National / Medical ID')}</label>
            <input name="nationalId" value="${existing?.nationalId || ''}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="sm:col-span-2">
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
          const record: Patient = {
            id: existing?.id || `pat_${Date.now()}`,
            code: existing?.code || `PAT-${String(allPatients.length + 1001)}`,
            name: String(fd.get('name') || '').trim(),
            phone: String(fd.get('phone') || '').trim(),
            gender: (fd.get('gender') as 'male' | 'female') || 'male',
            age: Number(fd.get('age')) || 30,
            birthDate: String(fd.get('birthDate') || '1996-01-01'),
            nationalId: String(fd.get('nationalId') || '').trim(),
            address: String(fd.get('address') || '').trim(),
            notes: String(fd.get('notes') || '').trim(),
            hasDefaultDiscount: dType !== 'none' && dVal > 0,
            defaultDiscountType: dType,
            defaultDiscountValue: dType === 'none' ? 0 : dVal,
            active: fd.get('active') === 'true',
            createdAt: existing?.createdAt || new Date().toISOString().slice(0, 10),
          };
          await patientsRepository.save(record);
          await authService.logAudit(
            isEdit ? `تعديل مريض: ${record.name}` : `إضافة مريض: ${record.name}`,
            'patients',
            record.id,
            `Discount: ${record.defaultDiscountType} (${record.defaultDiscountValue})`
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
    const canEdit = can(user, 'edit', 'patients');
    const canDelete = can(user, 'delete', 'patients');
    const canPrint = can(user, 'print', 'patients');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.patients}</h1>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'إدارة ملفات المرضى والخصومات الافتراضية (نسبة مئوية أو مبلغ ثابت يُطبق تلقائيًا في الطلبات والفواتير)',
                'Manage patient records and default discounts (percentage or fixed amount automatically applied to requests & invoices)'
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
                <th class="py-3 px-3 text-start">${i18n.dict.common.name}</th>
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
                      <td class="py-2.5 px-3 font-bold text-slate-900">${p.name}</td>
                      <td class="py-2.5 px-3 font-mono text-slate-600 tabular-nums">${p.phone}</td>
                      <td class="py-2.5 px-3 text-slate-600">${p.gender === 'male' ? i18n.bi('ذكر', 'M') : i18n.bi('أنثى', 'F')} · <span class="tabular-nums">${p.age}</span></td>
                      <td class="py-2.5 px-3 font-mono font-semibold ${p.hasDefaultDiscount ? 'text-emerald-700' : 'text-slate-400'} tabular-nums">${discText}</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">
                        <button type="button" data-hist-id="${p.id}" class="pat-hist-btn text-sky-700 hover:underline font-semibold cursor-pointer">
                          ${reqCount} ${i18n.bi('طلب', 'Reqs')}
                        </button>
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex items-center gap-2">
                          ${
                            canEdit
                              ? `<button type="button" data-edit-id="${p.id}" class="pat-edit-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>`
                              : ''
                          }
                          ${
                            canDelete
                              ? `<button type="button" data-del-id="${p.id}" class="pat-del-btn text-rose-600 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>`
                              : ''
                          }
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

    bindTablePagination(container, pagState, (page) => {
      currentPage = page;
      renderTable();
    }, 'pat-pag');

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
              <th>${i18n.dict.common.name}</th>
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
                  <td>${p.name}</td>
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
            await patientsRepository.delete(target.id);
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
