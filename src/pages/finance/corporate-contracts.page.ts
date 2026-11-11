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
import { invoicesRepository, patientsRepository } from '../../repositories';
import { ensureEnterpriseSeedData } from '../../services/enterprise-lab.service';
import type { CorporateContract } from '../../types';
import { exportToCsv, formatCurrency, formatDate, generateId } from '../../utils/format';

export async function renderCorporateContractsPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();

  let selectedContractForClaim = 'ALL';

  const render = async () => {
    const [contracts, invoices, patients] = await Promise.all([
      db.corporateContracts.toArray(),
      invoicesRepository.getAll(),
      patientsRepository.getAll(),
    ]);

    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const contractedInvoices = invoices.filter((inv) => Boolean(inv.contractId));
    const filteredClaims =
      selectedContractForClaim === 'ALL'
        ? contractedInvoices
        : contractedInvoices.filter((inv) => inv.contractId === selectedContractForClaim);

    const totalClaimAmount = filteredClaims.reduce(
      (sum, inv) => sum + (inv.companyShareAmount ?? inv.netTotal),
      0
    );

    container.innerHTML = `
      ${renderPageHeader(
        i18n.bi(
          '🏢 إدارة التعاقدات والنقابات وشركات التأمين والمطالبات الشهرية (B2B & Insurance Claims)',
          '🏢 Corporate, Syndicate & Insurance Contracts, Co-Payment & Monthly Claims'
        ),
        i18n.bi(
          'قوائم أسعار التعاقدات (نقدي، نقابة الأطباء، نقابة المهندسين، شركات التأمين، ومعامل Lab-to-Lab)، حساب نسبة تحمل المريض تلقائياً، وإصدار المطالبة المالية الشهرية المجمعة',
          'Manage B2B pricelists, automated Patient Co-Pay % vs Company Coverage %, credit limits, and consolidated monthly insurance claims'
        ),
        `
          <button id="cc-new-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
            + ${i18n.bi('إضافة جهة تعاقد / تأمين جديدة', 'Add Corporate / Insurance Contract')}
          </button>
        `
      )}

      <!-- Contracts Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        ${contracts
          .map((c) => {
            const catLabel =
              c.category === 'syndicate'
                ? i18n.bi('نقابة مهنية', 'Professional Syndicate')
                : c.category === 'insurance'
                ? i18n.bi('شركة تأمين طبي', 'Medical Insurance')
                : c.category === 'lab_to_lab'
                ? i18n.bi('تعاقد معامل (Lab-to-Lab)', 'Lab-to-Lab Referral')
                : i18n.bi('شركة / مؤسسة متعاقدة', 'Corporate Account');
            return `
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between gap-3">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <span class="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-slate-900 text-white">${escapeHtml(c.code)}</span>
                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800">${escapeHtml(catLabel)}</span>
                  </div>
                  <h4 class="text-sm font-extrabold text-slate-900">${escapeHtml(i18n.bi(c.nameAr, c.nameEn))}</h4>
                  <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(c.notes)}</p>
                </div>

                <div class="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-center text-xs">
                  <div>
                    <div class="text-[10px] text-slate-500">${i18n.bi('خصم التعاقد', 'Discount')}</div>
                    <div class="font-mono font-extrabold text-emerald-700">${c.discountPercent}%</div>
                  </div>
                  <div>
                    <div class="text-[10px] text-slate-500">${i18n.bi('تحمل المريض', 'Patient Co-Pay')}</div>
                    <div class="font-mono font-extrabold text-sky-700">${c.patientCoPayPercent}%</div>
                  </div>
                  <div>
                    <div class="text-[10px] text-slate-500">${i18n.bi('تحمل الجهة', 'Company Share')}</div>
                    <div class="font-mono font-extrabold text-indigo-700">${c.companyCoveragePercent}%</div>
                  </div>
                </div>

                <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span class="text-slate-500">${i18n.bi('الحد الائتماني:', 'Credit Limit:')} <strong class="font-mono text-slate-800">${formatCurrency(c.creditLimit)}</strong></span>
                  <button data-claim-filter="${c.id}" class="text-xs font-bold text-sky-700 hover:underline cursor-pointer">
                    📄 ${i18n.bi('عرض المطالبة الشهرية', 'View Claim Statement')}
                  </button>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <!-- Monthly Consolidated Claim Statement Section -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 class="text-base font-extrabold text-slate-900">
              📑 ${i18n.bi('كشف المطالبة المالية الشهرية المجمعة للشركات والتأمين (Monthly Consolidated Claim Statement)', 'Monthly Consolidated B2B & Insurance Claim Statement')}
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              ${i18n.bi(
                'يجمع تلقائياً كافة الفواتير المسجلة على التعاقد مع فصل حصة المريض المحصلة نقداً عن حصة الشركة/النقابة الآجلة.',
                'Automatically consolidates contracted patient invoices showing Patient Co-Payment vs Company/Insurance Receivable.'
              )}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select id="claim-contract-select" class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">
              <option value="ALL">${i18n.bi('جميع جهات التعاقد والتأمين', 'All Corporate Contracts')}</option>
              ${contracts
                .map(
                  (c) => `
                <option value="${c.id}" ${selectedContractForClaim === c.id ? 'selected' : ''}>
                  ${escapeHtml(i18n.bi(c.nameAr, c.nameEn))}
                </option>
              `
                )
                .join('')}
            </select>
            <button id="print-claim-btn" class="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">
              🖨️ ${i18n.bi('طباعة المطالبة الرسمية A4', 'Print A4 Claim')}
            </button>
            <button id="export-claim-csv-btn" class="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              📥 ${i18n.bi('تصدير Excel / CSV', 'Export CSV')}
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-100 text-slate-700">
              <tr>
                <th class="px-3 py-2.5 text-start">${i18n.bi('رقم الفاتورة', 'Invoice #')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('التاريخ', 'Date')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('اسم المريض المنتفع', 'Beneficiary Patient')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('جهة التعاقد', 'Contract')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('صافي الفاتورة بعد الخصم', 'Net Invoice')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('تحمل المريض (Co-Pay)', 'Patient Co-Pay')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('المطلوب من الجهة (Company Claim)', 'Company Claim')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${
                filteredClaims.length === 0
                  ? `<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400">${i18n.bi('لا توجد فواتير تعاقدات مسجلة حالياً على هذا الفلتر. يمكنك اختيار جهة التعاقد أثناء إنشاء طلب تحليل جديد.', 'No contracted invoices yet for this filter. Select a Corporate Contract when creating a new Lab Request.')}</td></tr>`
                  : filteredClaims
                      .map((inv) => {
                        const pat = patientMap.get(inv.patientId);
                        const pShare = inv.patientShareAmount ?? 0;
                        const cShare = inv.companyShareAmount ?? inv.netTotal - pShare;
                        return `
                          <tr class="hover:bg-slate-50">
                            <td class="px-3 py-2 font-mono font-bold text-sky-700">${escapeHtml(inv.invoiceNumber)}</td>
                            <td class="px-3 py-2 font-mono text-slate-600">${escapeHtml(formatDate(inv.date))}</td>
                            <td class="px-3 py-2 font-bold text-slate-900">${escapeHtml(pat?.name || '-')}</td>
                            <td class="px-3 py-2 font-semibold text-indigo-700">${escapeHtml(inv.contractName || '-')}</td>
                            <td class="px-3 py-2 font-mono font-bold">${formatCurrency(inv.netTotal)}</td>
                            <td class="px-3 py-2 font-mono text-emerald-700">${formatCurrency(pShare)}</td>
                            <td class="px-3 py-2 font-mono font-extrabold text-rose-700">${formatCurrency(cShare)}</td>
                          </tr>
                        `;
                      })
                      .join('')
              }
            </tbody>
            <tfoot class="bg-slate-900 text-white font-bold">
              <tr>
                <td colspan="6" class="px-4 py-2.5 text-end">${i18n.bi('إجمالي المطالبة المستحقة على جهة التعاقد:', 'Total Consolidated Company Receivable:')}</td>
                <td class="px-3 py-2.5 font-mono text-sm text-amber-300">${formatCurrency(totalClaimAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    document.getElementById('claim-contract-select')?.addEventListener('change', (e) => {
      selectedContractForClaim = (e.target as HTMLSelectElement).value;
      render();
    });

    container.querySelectorAll('[data-claim-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedContractForClaim = btn.getAttribute('data-claim-filter') || 'ALL';
        render();
      });
    });

    document.getElementById('cc-new-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('add', 'corporateContracts'))) return;
      openNewContractModal(render);
    });

    document.getElementById('print-claim-btn')?.addEventListener('click', async () => {
      const selectedContract = contracts.find((c) => c.id === selectedContractForClaim);
      await printService.printA4(
        i18n.bi(
          `مطالبة مالية شهرية مجمعة — ${selectedContract ? selectedContract.nameAr : 'جميع التعاقدات'}`,
          `Monthly Consolidated Claim Statement — ${selectedContract ? selectedContract.nameEn : 'All Contracts'}`
        ),
        container.querySelector('table')?.outerHTML || ''
      );
    });

    document.getElementById('export-claim-csv-btn')?.addEventListener('click', () => {
      exportToCsv(
        'corporate_claim_statement.csv',
        ['Invoice #', 'Date', 'Patient', 'Contract', 'Net Total', 'Patient Share', 'Company Claim'],
        filteredClaims.map((inv) => {
          const pat = patientMap.get(inv.patientId);
          const pShare = inv.patientShareAmount ?? 0;
          const cShare = inv.companyShareAmount ?? inv.netTotal - pShare;
          return [
            inv.invoiceNumber,
            inv.date.slice(0, 10),
            pat?.name || '-',
            inv.contractName || '-',
            inv.netTotal,
            pShare,
            cShare,
          ];
        })
      );
    });
  };

  await render();
}

function openNewContractModal(onSaved: () => void): void {
  openModal({
    title: i18n.bi('🏢 إضافة جهة تعاقد / نقابة / شركة تأمين جديدة', '🏢 New Corporate / Insurance Contract'),
    size: 'md',
    content: `
      <form id="new-cc-form" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('كود التعاقد *', 'Contract Code *')}</label>
            <input id="ncc-code" type="text" required value="CORP-${Math.floor(10 + Math.random() * 89)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('التصنيف *', 'Category *')}</label>
            <select id="ncc-cat" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="syndicate">نقابة مهنية (Syndicate)</option>
              <option value="insurance">شركة تأمين طبي (Medical Insurance)</option>
              <option value="corporate">شركة / هيئة متعاقدة (Corporate)</option>
              <option value="lab_to_lab">معمل متعاقد (Lab-to-Lab)</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('اسم الجهة بالعربية *', 'Contract Name (Arabic) *')}</label>
          <input id="ncc-ar" type="text" required placeholder="مثال: نقابة الصيادلة / شركة ميدنت للتأمين" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('اسم الجهة بالإنجليزية *', 'Contract Name (English) *')}</label>
          <input id="ncc-en" type="text" required placeholder="e.g., MedNet Healthcare Insurance" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('خصم التعاقد %', 'Discount %')}</label>
            <input id="ncc-disc" type="number" min="0" max="90" value="20" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('تحمل المريض %', 'Patient Co-Pay %')}</label>
            <input id="ncc-copay" type="number" min="0" max="100" value="20" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('تحمل الجهة %', 'Company Share %')}</label>
            <input id="ncc-comp" type="number" min="0" max="100" value="80" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الحد الائتماني', 'Credit Limit')}</label>
            <input id="ncc-limit" type="number" value="200000" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('هاتف مسؤول التعاقد', 'Contact Phone')}</label>
            <input id="ncc-phone" type="text" value="01000000000" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="ncc-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
            💾 ${i18n.bi('حفظ التعاقد', 'Save Contract')}
          </button>
        </div>
      </form>
    `,
  });

  const copayEl = document.getElementById('ncc-copay') as HTMLInputElement | null;
  const compEl = document.getElementById('ncc-comp') as HTMLInputElement | null;
  copayEl?.addEventListener('input', () => {
    const v = Math.min(100, Math.max(0, parseFloat(copayEl.value) || 0));
    if (compEl) compEl.value = String(100 - v);
  });

  document.getElementById('ncc-cancel')?.addEventListener('click', closeModal);
  document.getElementById('new-cc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const copay = parseFloat((document.getElementById('ncc-copay') as HTMLInputElement).value) || 0;
    const rec: CorporateContract = {
      id: generateId('CNT'),
      code: (document.getElementById('ncc-code') as HTMLInputElement).value.trim(),
      nameAr: (document.getElementById('ncc-ar') as HTMLInputElement).value.trim(),
      nameEn: (document.getElementById('ncc-en') as HTMLInputElement).value.trim(),
      category: (document.getElementById('ncc-cat') as HTMLSelectElement).value as CorporateContract['category'],
      discountPercent: parseFloat((document.getElementById('ncc-disc') as HTMLInputElement).value) || 0,
      patientCoPayPercent: copay,
      companyCoveragePercent: 100 - copay,
      creditLimit: parseFloat((document.getElementById('ncc-limit') as HTMLInputElement).value) || 100000,
      currentBalance: 0,
      contactPerson: 'إدارة التعاقدات',
      phone: (document.getElementById('ncc-phone') as HTMLInputElement).value.trim(),
      active: true,
      notes: 'تعاقد نشط',
    };
    await db.corporateContracts.put(rec);
    closeModal();
    showToast(i18n.bi('تم إضافة جهة التعاقد بنجاح', 'Corporate contract added'), 'success');
    onSaved();
  });
}
