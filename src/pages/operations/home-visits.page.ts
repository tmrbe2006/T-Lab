import { authService } from '../../auth/auth.service';
import {
  closeModal,
  escapeHtml,
  openModal,
  renderPageHeader,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { patientsRepository } from '../../repositories';
import {
  ensureEnterpriseSeedData,
  openWhatsAppDispatchModal,
} from '../../services/enterprise-lab.service';
import type { HomeVisitRecord, HomeVisitStatus } from '../../types';
import { formatCurrency, generateId } from '../../utils/format';

const STATUS_LABELS: Record<
  HomeVisitStatus,
  { ar: string; en: string; badgeCls: string; next?: HomeVisitStatus; nextLabelAr?: string; nextLabelEn?: string }
> = {
  scheduled: {
    ar: 'مجدولة بانتظار التحرك',
    en: 'Scheduled',
    badgeCls: 'bg-slate-100 text-slate-800',
    next: 'dispatched',
    nextLabelAr: 'تحريك المندوب الآن 🚐',
    nextLabelEn: 'Dispatch Phlebotomist 🚐',
  },
  dispatched: {
    ar: 'المندوب في الطريق للمريض',
    en: 'Phlebotomist Dispatched',
    badgeCls: 'bg-amber-100 text-amber-800',
    next: 'sample_collected',
    nextLabelAr: 'تأكيد سحب العينة 💉',
    nextLabelEn: 'Confirm Sample Collected 💉',
  },
  sample_collected: {
    ar: 'تم سحب العينة بالمنزل',
    en: 'Sample Collected',
    badgeCls: 'bg-sky-100 text-sky-800',
    next: 'delivered_to_lab',
    nextLabelAr: 'تسليم العينة للمعمل ✅',
    nextLabelEn: 'Deliver to Lab Reception ✅',
  },
  delivered_to_lab: {
    ar: 'وصلت المعمل وتم الاستلام',
    en: 'Delivered to Lab',
    badgeCls: 'bg-emerald-100 text-emerald-800',
  },
  cancelled: {
    ar: 'ملغاة',
    en: 'Cancelled',
    badgeCls: 'bg-rose-100 text-rose-800',
  },
};

export async function renderHomeVisitsPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();

  let statusFilter = 'all';

  const render = async () => {
    const [visits, patients, employees] = await Promise.all([
      db.homeVisits.toArray(),
      patientsRepository.getAll(),
      db.employees.toArray(),
    ]);

    const sorted = visits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const filtered = sorted.filter((v) =>
      statusFilter === 'all' ? true : v.status === statusFilter
    );

    container.innerHTML = `
      ${renderPageHeader(
        i18n.bi(
          '🚐 وحدة السحب المنزلي وتتبع المندوبين (Home Visits & Phlebotomist Dispatch)',
          '🚐 Home Phlebotomy Visits & Live Field Dispatch Tracker'
        ),
        i18n.bi(
          'جدولة زيارات السحب المنزلي، تعيين فني السحب، تتبع حالة العينة من منزل المريض حتى وصولها للمعمل، وإرسال موقع المريض للمندوب عبر واتساب',
          'Schedule home phlebotomy appointments, assign field phlebotomists, track live sample chain-of-custody, and dispatch via WhatsApp'
        ),
        `
          <button id="hv-new-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
            + ${i18n.bi('حجز زيارة سحب منزلي جديدة', 'Schedule Home Visit')}
          </button>
        `
      )}

      <!-- Pipeline KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div class="text-xs font-semibold text-slate-500">${i18n.bi('زيارات مجدولة اليوم', 'Scheduled Visits')}</div>
          <div class="text-2xl font-extrabold text-slate-900 mt-1">
            ${sorted.filter((v) => v.status === 'scheduled').length}
          </div>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-amber-800">${i18n.bi('مندوبون في الطريق حالياً', 'En Route / Dispatched')}</div>
          <div class="text-2xl font-extrabold text-amber-700 mt-1">
            ${sorted.filter((v) => v.status === 'dispatched').length}
          </div>
        </div>
        <div class="rounded-xl border border-sky-200 bg-sky-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-sky-800">${i18n.bi('تم سحب العينة بالمنزل', 'Samples Collected in Field')}</div>
          <div class="text-2xl font-extrabold text-sky-700 mt-1">
            ${sorted.filter((v) => v.status === 'sample_collected').length}
          </div>
        </div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-emerald-800">${i18n.bi('وصلت المعمل وتم الاستلام', 'Delivered to Lab')}</div>
          <div class="text-2xl font-extrabold text-emerald-700 mt-1">
            ${sorted.filter((v) => v.status === 'delivered_to_lab').length}
          </div>
        </div>
      </div>

      <!-- Status Filter Bar -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 mb-4 flex flex-wrap items-center gap-2">
        <button data-hv-filter="all" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}">
          ${i18n.bi('الكل', 'All')} (${sorted.length})
        </button>
        ${(['scheduled', 'dispatched', 'sample_collected', 'delivered_to_lab'] as HomeVisitStatus[])
          .map(
            (st) => `
          <button data-hv-filter="${st}" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              statusFilter === st ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
            }">
            ${escapeHtml(i18n.bi(STATUS_LABELS[st].ar, STATUS_LABELS[st].en))}
          </button>
        `
          )
          .join('')}
      </div>

      <!-- Visits Cards Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${filtered
          .map((v) => {
            const stInfo = STATUS_LABELS[v.status];
            return `
              <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between gap-4">
                <div class="space-y-2.5">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs font-extrabold px-2.5 py-1 rounded bg-slate-900 text-white">${escapeHtml(v.visitNumber)}</span>
                      <span class="text-xs font-bold text-slate-600">📅 ${escapeHtml(v.scheduledDate)} | ⏰ ${escapeHtml(v.scheduledTimeSlot)}</span>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-extrabold ${stInfo.badgeCls}">
                      ${escapeHtml(i18n.bi(stInfo.ar, stInfo.en))}
                    </span>
                  </div>

                  <div>
                    <h4 class="text-base font-extrabold text-slate-900">${escapeHtml(v.patientName)}</h4>
                    <div class="text-xs text-slate-600 mt-0.5">
                      📍 <strong>${i18n.bi('العنوان:', 'Address:')}</strong> ${escapeHtml(v.address)}
                      ${v.landmark ? ` — (${escapeHtml(v.landmark)})` : ''}
                    </div>
                    <div class="text-xs text-slate-500 mt-0.5 font-mono">
                      📞 ${escapeHtml(v.patientPhone)}
                      ${v.fastingRequired ? ` · <span class="text-rose-600 font-bold">⚠️ يشترط الصيام (Fasting Required)</span>` : ''}
                    </div>
                  </div>

                  <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                    <div>🧪 <strong>${i18n.bi('التحاليل المطلوبة:', 'Requested Tests:')}</strong> ${escapeHtml(v.requestedTestsSummary)}</div>
                    <div class="flex flex-wrap items-center justify-between pt-1 text-slate-700">
                      <span>👨‍⚕️ <strong>${i18n.bi('مندوب السحب:', 'Phlebotomist:')}</strong> ${escapeHtml(v.phlebotomistName)} (${escapeHtml(v.phlebotomistPhone)})</span>
                      <span class="font-mono font-bold text-emerald-700">
                        ${i18n.bi('رسوم الزيارة:', 'Visit Fee:')} ${formatCurrency(v.visitFee)} | ${i18n.bi('الإجمالي التقديري:', 'Est. Total:')} ${formatCurrency(v.visitFee + v.estimatedTestsTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
                  <div class="flex flex-wrap gap-1.5">
                    <button data-wa-phleb="${v.id}" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 cursor-pointer">
                      💬 ${i18n.bi('واتساب للمندوب', 'WhatsApp Phlebotomist')}
                    </button>
                    <button data-wa-patient="${v.id}" class="rounded-lg border border-emerald-600 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                      💬 ${i18n.bi('تأكيد للمريض', 'Notify Patient')}
                    </button>
                    <button data-print-hv="${v.id}" class="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
                      🖨️ ${i18n.bi('أمر تحرك 80mm', 'Dispatch Slip')}
                    </button>
                  </div>

                  ${
                    stInfo.next
                      ? `
                    <button data-advance-hv="${v.id}" class="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-sky-500 cursor-pointer">
                      ${escapeHtml(i18n.bi(stInfo.nextLabelAr || '', stInfo.nextLabelEn || ''))}
                    </button>
                  `
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('[data-hv-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        statusFilter = btn.getAttribute('data-hv-filter') || 'all';
        render();
      });
    });

    container.querySelectorAll('[data-advance-hv]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-advance-hv')!;
        const rec = sorted.find((v) => v.id === id);
        if (!rec) return;
        const nextSt = STATUS_LABELS[rec.status].next;
        if (!nextSt) return;
        rec.status = nextSt;
        if (nextSt === 'sample_collected') rec.collectedAt = new Date().toISOString();
        if (nextSt === 'delivered_to_lab') rec.deliveredAt = new Date().toISOString();
        await db.homeVisits.put(rec);
        showToast(
          i18n.bi(
            `تم تحديث حالة الزيارة المنزلية إلى: ${STATUS_LABELS[nextSt].ar}`,
            `Visit status updated to: ${STATUS_LABELS[nextSt].en}`
          ),
          'success'
        );
        render();
      });
    });

    container.querySelectorAll('[data-wa-phleb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-wa-phleb')!;
        const v = sorted.find((x) => x.id === id);
        if (!v) return;
        const msg = [
          `🚐 *أمر تحرك سحب منزلي — ${v.visitNumber}*`,
          `👤 *المريض:* ${v.patientName}`,
          `📞 *هاتف المريض:* ${v.patientPhone}`,
          `📍 *العنوان بالتفصيل:* ${v.address} (${v.landmark})`,
          `⏰ *الموعد:* ${v.scheduledDate} — ${v.scheduledTimeSlot}`,
          `🧪 *التحاليل المطلوبة:* ${v.requestedTestsSummary}`,
          `💰 *المطلوب تحصيله:* ${formatCurrency(v.visitFee + v.estimatedTestsTotal)} (شامل رسوم الزيارة ${formatCurrency(v.visitFee)})`,
          `📝 *ملاحظات:* ${v.notes}`,
        ].join('\n');
        openWhatsAppDispatchModal({
          recipientName: v.phlebotomistName,
          phone: v.phlebotomistPhone,
          titleAr: 'إرسال أمر التحرك والعنوان لمندوب السحب',
          titleEn: 'Dispatch Order to Phlebotomist via WhatsApp',
          messageBody: msg,
          referenceId: v.id,
        });
      });
    });

    container.querySelectorAll('[data-wa-patient]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-wa-patient')!;
        const v = sorted.find((x) => x.id === id);
        if (!v) return;
        const msg = [
          `🏥 *${i18n.dict.appTitle} — تأكيد موعد زيارة السحب المنزلي*`,
          `مرحباً أ/ ${v.patientName}،`,
          `تم تأكيد حجز زيارة السحب المنزلي رقم *${v.visitNumber}*`,
          `📅 *التاريخ والموعد:* ${v.scheduledDate} (${v.scheduledTimeSlot})`,
          `👨‍⚕️ *مسؤول السحب:* ${v.phlebotomistName} (${v.phlebotomistPhone})`,
          `🧪 *التحاليل:* ${v.requestedTestsSummary}`,
          `مع تمنياتنا لكم بدوام الصحة والعافية.`,
        ].join('\n');
        openWhatsAppDispatchModal({
          recipientName: v.patientName,
          phone: v.patientPhone,
          titleAr: 'إرسال رسالة تأكيد الموعد للمريض',
          titleEn: 'Send Appointment Confirmation to Patient',
          messageBody: msg,
          referenceId: v.id,
        });
      });
    });

    container.querySelectorAll('[data-print-hv]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-print-hv')!;
        const v = sorted.find((x) => x.id === id);
        if (!v) return;
        await printService.printThermal80mm(
          i18n.bi('أمر تحرك سحب منزلي', 'Home Visit Dispatch Slip'),
          `
            <div style="font-size:11px;line-height:1.5;">
              <div><strong>رقم الزيارة:</strong> ${escapeHtml(v.visitNumber)}</div>
              <div><strong>المريض:</strong> ${escapeHtml(v.patientName)}</div>
              <div><strong>الهاتف:</strong> ${escapeHtml(v.patientPhone)}</div>
              <div><strong>العنوان:</strong> ${escapeHtml(v.address)} (${escapeHtml(v.landmark)})</div>
              <div><strong>الموعد:</strong> ${escapeHtml(v.scheduledDate)} | ${escapeHtml(v.scheduledTimeSlot)}</div>
              <div><strong>المندوب:</strong> ${escapeHtml(v.phlebotomistName)}</div>
              <hr style="margin:6px 0;border-top:1px dashed #000;" />
              <div><strong>التحاليل:</strong> ${escapeHtml(v.requestedTestsSummary)}</div>
              <div><strong>إجمالي التحصيل:</strong> ${formatCurrency(v.visitFee + v.estimatedTestsTotal)}</div>
            </div>
          `,
          v.visitNumber
        );
      });
    });

    document.getElementById('hv-new-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('add', 'homeVisits'))) return;
      openNewHomeVisitModal(patients, employees, render);
    });
  };

  await render();
}

function openNewHomeVisitModal(
  patients: Array<{ id: string; name: string; phone: string; address: string }>,
  employees: Array<{ id: string; nameAr: string; phone: string }>,
  onSaved: () => void
): void {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: i18n.bi('🚐 حجز زيارة سحب منزلي جديدة', '🚐 Schedule New Home Phlebotomy Visit'),
    size: 'lg',
    content: `
      <form id="new-hv-form" class="space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المريض *', 'Patient *')}</label>
            <select id="nhv-patient" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${patients.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.phone)})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('مندوب السحب المكلف *', 'Assigned Phlebotomist *')}</label>
            <select id="nhv-phleb" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="EMP-PHLEB-1|فني سحب/ مصطفى عبد الحميد|01099887766">فني سحب/ مصطفى عبد الحميد (01099887766)</option>
              <option value="EMP-PHLEB-2|أخصائية سحب/ آية الرحمن طارق|01288776655">أخصائية سحب/ آية الرحمن طارق (01288776655)</option>
              ${employees.map((e) => `<option value="${e.id}|${escapeHtml(e.nameAr)}|${escapeHtml(e.phone)}">${escapeHtml(e.nameAr)} (${escapeHtml(e.phone)})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('تاريخ الزيارة *', 'Visit Date *')}</label>
            <input id="nhv-date" type="date" value="${today}" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الفترة الزمنية *', 'Time Slot *')}</label>
            <input id="nhv-slot" type="text" value="10:00 AM - 11:30 AM" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('العنوان التفصيلي *', 'Detailed Address *')}</label>
            <input id="nhv-address" type="text" required value="${escapeHtml(patients[0]?.address || 'شارع التحرير - الدقي')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('علامة مميزة (Landmark)', 'Landmark')}</label>
            <input id="nhv-landmark" type="text" value="بجوار صيدلية العزبي" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('بيان التحاليل المطلوبة *', 'Requested Tests Summary *')}</label>
          <input id="nhv-tests" type="text" required value="صورة دم كاملة CBC + وظائف كبد وكلى + سكر تراكمي HbA1c" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('رسوم الانتقال المنزلي', 'Home Visit Fee')}</label>
            <input id="nhv-fee" type="number" value="100" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('قيمة التحاليل التقديرية', 'Est. Tests Amount')}</label>
            <input id="nhv-total" type="number" value="650" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="flex items-end pb-2">
            <label class="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input id="nhv-fasting" type="checkbox" checked class="w-4 h-4 accent-sky-600" />
              ${i18n.bi('يشترط صيام المريض', 'Fasting Required')}
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="nhv-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
            ✅ ${i18n.bi('تأكيد حجز الزيارة المنزلية', 'Confirm Home Visit')}
          </button>
        </div>
      </form>
    `,
  });

  document.getElementById('nhv-cancel')?.addEventListener('click', closeModal);
  document.getElementById('new-hv-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = (document.getElementById('nhv-patient') as HTMLSelectElement).value;
    const pat = patients.find((p) => p.id === patientId) || patients[0];
    const [phlebId, phlebName, phlebPhone] = (
      document.getElementById('nhv-phleb') as HTMLSelectElement
    ).value.split('|');

    const user = authService.getCurrentUser();
    const rec: HomeVisitRecord = {
      id: generateId('HV'),
      visitNumber: `HV-2025-${Math.floor(100 + Math.random() * 899)}`,
      patientId: pat?.id || 'PAT-1',
      patientName: pat?.name || '-',
      patientPhone: pat?.phone || '01000000000',
      address: (document.getElementById('nhv-address') as HTMLInputElement).value.trim(),
      landmark: (document.getElementById('nhv-landmark') as HTMLInputElement).value.trim(),
      scheduledDate: (document.getElementById('nhv-date') as HTMLInputElement).value,
      scheduledTimeSlot: (document.getElementById('nhv-slot') as HTMLInputElement).value.trim(),
      phlebotomistId: phlebId,
      phlebotomistName: phlebName,
      phlebotomistPhone: phlebPhone,
      requestedTestsSummary: (document.getElementById('nhv-tests') as HTMLInputElement).value.trim(),
      visitFee: parseFloat((document.getElementById('nhv-fee') as HTMLInputElement).value) || 100,
      estimatedTestsTotal: parseFloat((document.getElementById('nhv-total') as HTMLInputElement).value) || 0,
      fastingRequired: (document.getElementById('nhv-fasting') as HTMLInputElement).checked,
      status: 'scheduled',
      notes: 'تم الحجز عبر نظام السحب المنزلي',
      createdBy: user?.fullNameAr || 'Reception',
      createdAt: new Date().toISOString(),
    };

    await db.homeVisits.put(rec);
    closeModal();
    showToast(i18n.bi('تم تسجيل زيارة السحب المنزلي بنجاح', 'Home visit scheduled'), 'success');
    onSaved();
  });
}
