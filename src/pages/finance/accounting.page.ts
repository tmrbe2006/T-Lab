import { authService } from '../../auth/auth.service';
import {
  bindTablePagination,
  createPaginationControls,
  openCustomModal,
  openDeleteConfirmModal,
  paginateArray,
  showToast,
  VirtualTable,
} from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { accountingRepository, invoicesRepository } from '../../repositories';
import { accountingService } from '../../services/accounting.service';
import { openManualJournalEditor, confirmManualJournalReversal } from './manual-journal-editor';
import type { Account, DailyClosing, Expense, JournalEntry } from '../../types';

const EXPENSE_CATEGORIES_STORAGE_KEY = 'tlab_expense_categories_v1';
const PAYMENT_METHODS_STORAGE_KEY = 'tlab_payment_methods_v1';

export interface CustomPaymentMethodOption {
  id: string;
  labelAr: string;
  labelEn: string;
  accountCode: string;
}

const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'المحاليل والكواشف الطبية (Reagents)',
  'مستلزمات سحب عينات وأنابيب (Vacutainers & Tips)',
  'الرواتب والأجور والمكافآت',
  'الإيجار الشهري للمعمل',
  'الكهرباء والمياه والغاز والمرافق',
  'صيانة ومعايرة أجهزة التحليل',
  'مطبوعات وأحبار باركود وقرطاسية',
  'الإنترنت والاتصالات والبرمجيات',
  'نقل وشحن العينات الخارجية (Lab-to-Lab)',
  'التخلص الآمن من النفايات الطبية',
  'مصروفات الضيافة والنظافة والتعقيم',
  'رسوم تراخيص ونقابة وضرائب',
];

const DEFAULT_PAYMENT_METHODS: CustomPaymentMethodOption[] = [
  { id: 'cash', labelAr: 'نقدًا من الخزينة الرئيسية (Cashbox)', labelEn: 'Cashbox (Cash)', accountCode: '1101' },
  { id: 'bank_transfer', labelAr: 'تحويل بنكي (Bank Transfer)', labelEn: 'Bank Transfer', accountCode: '1102' },
  { id: 'instapay', labelAr: 'إنستا باي (InstaPay)', labelEn: 'InstaPay', accountCode: '1102' },
  { id: 'vodafone_cash', labelAr: 'فودافون كاش / محفظة إلكترونية (E-Wallet)', labelEn: 'Vodafone Cash / E-Wallet', accountCode: '1106' },
  { id: 'visa_pos', labelAr: 'بطاقة بنكية / فيزا (POS Card)', labelEn: 'POS Visa / MasterCard', accountCode: '1102' },
  { id: 'cheque', labelAr: 'شيك بنكي (Bank Cheque)', labelEn: 'Bank Cheque', accountCode: '1102' },
  { id: 'petty_cash', labelAr: 'عهدة المصروفات النثرية (Petty Cash)', labelEn: 'Petty Cash', accountCode: '1107' },
];

function getSavedExpenseCategories(): string[] {
  try {
    const raw = localStorage.getItem(EXPENSE_CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_EXPENSE_CATEGORIES];
}

function saveExpenseCategories(list: string[]): void {
  localStorage.setItem(EXPENSE_CATEGORIES_STORAGE_KEY, JSON.stringify(list));
}

function getSavedPaymentMethods(): CustomPaymentMethodOption[] {
  try {
    const raw = localStorage.getItem(PAYMENT_METHODS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_PAYMENT_METHODS];
}

function savePaymentMethods(list: CustomPaymentMethodOption[]): void {
  localStorage.setItem(PAYMENT_METHODS_STORAGE_KEY, JSON.stringify(list));
}

export async function renderAccountingPage(
  container: HTMLElement,
  subView: 'accounts' | 'journalEntries' | 'cashbox' | 'expenses' | 'reports'
): Promise<void> {
  const user = authService.getCurrentUser();
  const [initialAccounts, journalEntries, expenses, closings, invoices] = await Promise.all([
    accountingRepository.getAccounts(),
    accountingRepository.getJournalEntries(),
    accountingRepository.getExpenses(),
    accountingRepository.getDailyClosings(),
    invoicesRepository.getAll(),
  ]);
  let accounts = initialAccounts;

  if (subView === 'accounts') {
    let currentPage = 1;
    const itemsPerPage = 25;
    let searchTerm = '';
    let filterType = 'all';

    const typeLabels: Record<Account['type'], string> = {
      asset: i18n.bi('أصول (Assets)', 'Assets'),
      liability: i18n.bi('التزامات / خصوم (Liabilities)', 'Liabilities'),
      equity: i18n.bi('حقوق الملكية (Equity)', 'Equity'),
      revenue: i18n.bi('إيرادات (Revenues)', 'Revenues'),
      expense: i18n.bi('مصروفات وتكاليف (Expenses)', 'Expenses'),
    };

    const typeBadges: Record<Account['type'], string> = {
      asset: 'bg-sky-50 text-sky-800 border-sky-200',
      liability: 'bg-amber-50 text-amber-800 border-amber-200',
      equity: 'bg-purple-50 text-purple-800 border-purple-200',
      revenue: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      expense: 'bg-rose-50 text-rose-800 border-rose-200',
    };

    const openAccountModal = (existing?: Account) => {
      const isEdit = Boolean(existing);
      const groupAccounts = accounts.filter((a) => a.isGroup && a.id !== existing?.id);
      const initialType: Account['type'] =
        existing?.type ||
        (filterType !== 'all' ? (filterType as Account['type']) : 'asset');
      const initialIsGroup = existing ? Boolean(existing.isGroup) : false;
      const initialParentCode = existing
        ? existing.parentCode || ''
        : accountingRepository.getDefaultParentCode(accounts, initialType, initialIsGroup);
      const initialCode = existing
        ? existing.code
        : accountingRepository.generateNextAccountCode(
            accounts,
            initialType,
            initialIsGroup,
            initialParentCode
          );

      openCustomModal(
        isEdit
          ? i18n.bi(`تعديل الحساب المحاسبي (${existing!.code})`, `Edit Account (${existing!.code})`)
          : i18n.bi('إضافة حساب رئيسي أو فرعي جديد (الدليل المحاسبي المصري)', 'Add Main or Sub-Account'),
        `
          <form id="acc-crud-form" autocomplete="off" class="space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block font-bold text-slate-700">${i18n.bi('كود الحساب (يتولد تلقائياً تبعا للحساب) *', 'Account Code (Auto-generated) *')}</label>
                  <button type="button" id="acc-regen-code-btn" class="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                    🔄 ${i18n.bi('توليد تلقائي', 'Auto Code')}
                  </button>
                </div>
                <input id="acc-code-input" name="code" autocomplete="off" required value="${initialCode}" placeholder="يتولد تلقائياً حسب الحساب..." class="w-full rounded-lg border border-sky-300 bg-sky-50/40 px-3 py-2 text-sm font-mono font-bold text-sky-950" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('التصنيف المحاسبي *', 'Account Type *')}</label>
                <select id="acc-type-select" name="type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="asset" ${initialType === 'asset' ? 'selected' : ''}>1 - أصول (Assets)</option>
                  <option value="liability" ${initialType === 'liability' ? 'selected' : ''}>2 - التزامات / خصوم (Liabilities)</option>
                  <option value="equity" ${initialType === 'equity' ? 'selected' : ''}>3 - حقوق الملكية (Equity)</option>
                  <option value="revenue" ${initialType === 'revenue' ? 'selected' : ''}>4 - إيرادات (Revenues)</option>
                  <option value="expense" ${initialType === 'expense' ? 'selected' : ''}>5 - مصروفات وتكاليف (Expenses)</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم الحساب بالعربي *', 'Arabic Account Name *')}</label>
                <input name="nameAr" autocomplete="off" required value="${existing?.nameAr || ''}" placeholder="مثال: بنك مصر - حساب جاري" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم الحساب بالإنجليزي *', 'English Account Name *')}</label>
                <input name="nameEn" autocomplete="off" required value="${existing?.nameEn || ''}" placeholder="e.g., Banque Misr - Current Account" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('نوع الحساب في الشجرة', 'Hierarchy Kind')}</label>
                <select id="acc-isgroup-select" name="isGroup" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="false" ${!initialIsGroup ? 'selected' : ''}>📄 حساب فرعي يقبل القيود (Sub-Account)</option>
                  <option value="true" ${initialIsGroup ? 'selected' : ''}>📂 حساب رئيسي تجميعي (Main Group)</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الحساب الرئيسي التابع له', 'Parent Account')}</label>
                <select id="acc-parent-select" name="parentCode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">— حساب جذري رئيسي (Level 1) —</option>
                  ${groupAccounts
                    .map(
                      (g) =>
                        `<option value="${g.code}" data-acc-type="${g.type}" ${initialParentCode === g.code ? 'selected' : ''}>${g.code} - ${g.nameAr}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الرصيد الافتتاحي / الحالي (EGP)', 'Current Balance (EGP)')}</label>
                <input name="balance" autocomplete="off" type="number" step="0.01" value="${existing?.balance ?? 0}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold" />
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                💾 ${i18n.dict.actions.save}
              </button>
            </div>
          </form>
        `,
        (close) => {
          const form = document.getElementById('acc-crud-form') as HTMLFormElement | null;
          const codeInput = document.getElementById('acc-code-input') as HTMLInputElement | null;
          const typeSelect = document.getElementById('acc-type-select') as HTMLSelectElement | null;
          const isGroupSelect = document.getElementById('acc-isgroup-select') as HTMLSelectElement | null;
          const parentSelect = document.getElementById('acc-parent-select') as HTMLSelectElement | null;
          const regenBtn = document.getElementById('acc-regen-code-btn') as HTMLButtonElement | null;

          const recomputeAccountCode = () => {
            if (!codeInput || !typeSelect || !isGroupSelect || !parentSelect) return;
            const curType = (typeSelect.value as Account['type']) || 'asset';
            const curIsGroup = isGroupSelect.value === 'true';
            const curParent = parentSelect.value.trim() || undefined;
            const pool = existing ? accounts.filter((a) => a.id !== existing.id) : accounts;
            codeInput.value = accountingRepository.generateNextAccountCode(
              pool,
              curType,
              curIsGroup,
              curParent
            );
          };

          typeSelect?.addEventListener('change', () => {
            const curType = (typeSelect.value as Account['type']) || 'asset';
            const curIsGroup = isGroupSelect?.value === 'true';
            if (parentSelect) {
              const selectedParent = groupAccounts.find((g) => g.code === parentSelect.value);
              if (!selectedParent || selectedParent.type !== curType) {
                parentSelect.value = accountingRepository.getDefaultParentCode(
                  accounts,
                  curType,
                  curIsGroup
                );
              }
            }
            recomputeAccountCode();
          });

          isGroupSelect?.addEventListener('change', () => {
            const curType = (typeSelect?.value as Account['type']) || 'asset';
            const curIsGroup = isGroupSelect.value === 'true';
            if (parentSelect) {
              parentSelect.value = accountingRepository.getDefaultParentCode(
                accounts,
                curType,
                curIsGroup
              );
            }
            recomputeAccountCode();
          });

          parentSelect?.addEventListener('change', () => {
            const chosenParent = groupAccounts.find((g) => g.code === parentSelect.value);
            if (chosenParent && typeSelect && typeSelect.value !== chosenParent.type) {
              typeSelect.value = chosenParent.type;
            }
            recomputeAccountCode();
          });

          regenBtn?.addEventListener('click', () => {
            recomputeAccountCode();
          });

          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const code = String(fd.get('code') || '').trim();
            const nameAr = String(fd.get('nameAr') || '').trim();
            const nameEn = String(fd.get('nameEn') || nameAr).trim();
            const type = (fd.get('type') as Account['type']) || 'asset';
            const isGroup = String(fd.get('isGroup')) === 'true';
            const parentCode = String(fd.get('parentCode') || '').trim() || undefined;
            const balance = Number(fd.get('balance')) || 0;

            if (!code || !nameAr) {
              showToast('يرجى إدخال كود واسم الحساب', 'warning');
              return;
            }
            const duplicate = accounts.find((a) => a.code === code && a.id !== existing?.id);
            if (duplicate) {
              showToast(`كود الحساب (${code}) مستخدم بالفعل لحساب (${duplicate.nameAr})`, 'warning');
              return;
            }

            const parentAcc = parentCode ? accounts.find((a) => a.code === parentCode) : undefined;
            const level: 1 | 2 | 3 | 4 = !parentCode
              ? 1
              : parentAcc?.level === 1
                ? 2
                : 3;

            const savedAcc: Account = {
              id: existing?.id || `acc_${code}_${Date.now()}`,
              code,
              nameAr,
              nameEn,
              type,
              level,
              parentCode,
              isGroup,
              balance,
            };

            await accountingRepository.saveAccount(savedAcc);
            await authService.logAudit(
              isEdit ? `تعديل حساب محاسبي: ${code} - ${nameAr}` : `إضافة حساب محاسبي: ${code} - ${nameAr}`,
              'accounts',
              savedAcc.id
            );
            accounts = await accountingRepository.getAccounts();
            showToast(
              isEdit
                ? `تم تحديث الحساب (${code} - ${nameAr}) بنجاح`
                : `تم إضافة الحساب (${code} - ${nameAr}) إلى شجرة الحسابات`,
              'success'
            );
            close();
            renderAccountsView();
          });
        }
      );
    };

    const renderAccountsView = () => {
      const filtered = accounts.filter((a) => {
        if (filterType !== 'all' && a.type !== filterType) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.trim().toLowerCase();
        return (
          a.code.toLowerCase().includes(q) ||
          a.nameAr.toLowerCase().includes(q) ||
          a.nameEn.toLowerCase().includes(q)
        );
      });

      const paged = paginateArray(filtered, currentPage, itemsPerPage);
      const pagState = { currentPage, itemsPerPage, totalItems: filtered.length };
      const mainCount = accounts.filter((a) => a.isGroup).length;
      const subCount = accounts.filter((a) => !a.isGroup).length;

      container.innerHTML = `
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.accounts} (الدليل المحاسبي المصري الموحد)</h1>
              <p class="text-xs text-slate-500 mt-0.5">${i18n.bi(
                `شجرة الحسابات المصرية القياسية شاملة الحسابات الرئيسية (${mainCount}) والحسابات الفرعية (${subCount}) مع الإضافة والتعديل والحذف`,
                `Standard Egyptian Chart of Accounts (${mainCount} Main Groups, ${subCount} Sub-Accounts) with full Add, Edit & Delete`
              )}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button id="acc-seed-egypt-btn" class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer">
                🇪🇬 ${i18n.bi('تحديث / استكمال الحسابات المصرية القياسية', 'Sync Standard Egyptian Accounts')}
              </button>
              <button id="acc-print" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                🖨️ ${i18n.dict.actions.print}
              </button>
              <button id="acc-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                + ${i18n.bi('إضافة حساب رئيسي / فرعي', 'Add Main / Sub Account')}
              </button>
            </div>
          </div>

          <!-- Search & Type Filter Bar -->
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 p-3">
            <div class="flex flex-wrap items-center gap-1.5">
              ${[
                { id: 'all', label: `الكل (${accounts.length})` },
                { id: 'asset', label: '1 - الأصول' },
                { id: 'liability', label: '2 - الخصوم والالتزامات' },
                { id: 'equity', label: '3 - حقوق الملكية' },
                { id: 'revenue', label: '4 - الإيرادات' },
                { id: 'expense', label: '5 - المصروفات والتكاليف' },
              ]
                .map(
                  (t) => `
                  <button type="button" data-acc-type-filter="${t.id}" class="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                    filterType === t.id
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }">${t.label}</button>
                `
                )
                .join('')}
            </div>
            <div class="w-full sm:w-72">
              <input id="acc-search-input" type="search" value="${searchTerm}" placeholder="🔍 ابحث بكود أو اسم الحساب..." class="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />
            </div>
          </div>

          <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                  <th class="py-3 px-3 text-start">${i18n.bi('اسم الحساب (رئيسي / فرعي)', 'Account Name')}</th>
                  <th class="py-3 px-3 text-start">${i18n.bi('المستوى والتبعية', 'Level & Parent')}</th>
                  <th class="py-3 px-3 text-start">${i18n.bi('النوع المحاسبي', 'Account Type')}</th>
                  <th class="py-3 px-3 text-start">${i18n.bi('الرصيد الحالي', 'Current Balance')}</th>
                  <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${paged
                  .map((a) => {
                    const lvl = a.level || (a.isGroup ? 1 : 3);
                    const indentPx = (lvl - 1) * 16;
                    return `
                      <tr class="${a.isGroup ? 'bg-slate-50/90 font-bold' : 'hover:bg-slate-50'}">
                        <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${a.code}</td>
                        <td class="py-2.5 px-3" style="padding-inline-start: ${12 + indentPx}px;">
                          <div class="flex items-center gap-1.5">
                            <span>${a.isGroup ? '📂' : '📄'}</span>
                            <span class="${a.isGroup ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}">${a.nameAr}</span>
                            <span class="text-[11px] text-slate-400">(${a.nameEn})</span>
                          </div>
                        </td>
                        <td class="py-2.5 px-3">
                          <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${
                            a.isGroup ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600'
                          }">
                            ${a.isGroup ? 'حساب رئيسي' : 'حساب فرعي'} (L${lvl})
                          </span>
                          ${a.parentCode ? `<span class="text-[10px] font-mono text-slate-400 ms-1">← ${a.parentCode}</span>` : ''}
                        </td>
                        <td class="py-2.5 px-3">
                          <span class="inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${typeBadges[a.type] || 'bg-slate-100 text-slate-700'}">
                            ${typeLabels[a.type] || a.type}
                          </span>
                        </td>
                        <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${a.balance.toLocaleString()} EGP</td>
                        <td class="py-2.5 px-3">
                          <div class="flex items-center gap-2">
                            <button type="button" data-edit-acc="${a.id}" class="acc-edit-btn rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                              ✏️ ${i18n.dict.actions.edit}
                            </button>
                            <button type="button" data-del-acc="${a.id}" class="acc-del-btn rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                              🗑️ ${i18n.dict.actions.delete}
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
          ${createPaginationControls(pagState, undefined, 'acc-pag')}
        </div>
      `;

      bindTablePagination(
        container,
        pagState,
        (page) => {
          currentPage = page;
          renderAccountsView();
        },
        'acc-pag'
      );

      document.querySelectorAll<HTMLButtonElement>('[data-acc-type-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          filterType = btn.dataset.accTypeFilter || 'all';
          currentPage = 1;
          renderAccountsView();
        });
      });

      const searchInput = document.getElementById('acc-search-input') as HTMLInputElement | null;
      searchInput?.addEventListener('input', () => {
        searchTerm = searchInput.value;
        currentPage = 1;
        renderAccountsView();
      });

      document.getElementById('acc-add-btn')?.addEventListener('click', () => openAccountModal());

      document.getElementById('acc-seed-egypt-btn')?.addEventListener('click', async () => {
        await accountingRepository.ensureEgyptianChartOfAccounts();
        accounts = await accountingRepository.getAccounts();
        showToast('تم تحديث واستكمال شجرة الحسابات المصرية القياسية بنجاح', 'success');
        renderAccountsView();
      });

      document.querySelectorAll<HTMLButtonElement>('.acc-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = accounts.find((x) => x.id === btn.dataset.editAcc);
          if (target) openAccountModal(target);
        });
      });

      document.querySelectorAll<HTMLButtonElement>('.acc-del-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = accounts.find((x) => x.id === btn.dataset.delAcc);
          if (!target) return;
          const children = accounts.filter((x) => x.parentCode === target.code);

          openDeleteConfirmModal({
            recordLabel: `${target.code} - ${target.nameAr}${
              children.length > 0 ? ` (تنبيه: يتبعه ${children.length} حساب فرعي)` : ''
            }`,
            onConfirm: async (reason) => {
              await accountingRepository.deleteAccount(target.id);
              await authService.logAudit(
                `حذف حساب محاسبي: ${target.code} - ${target.nameAr}`,
                'accounts',
                target.id,
                reason || ''
              );
              accounts = await accountingRepository.getAccounts();
              showToast(`تم حذف الحساب (${target.code} - ${target.nameAr}) بنجاح`, 'success');
              renderAccountsView();
            },
          });
        });
      });

      document.getElementById('acc-print')?.addEventListener('click', () => {
        printService.printA4(
          i18n.dict.nav.accounts,
          `<table class="print-table"><thead><tr><th>Code</th><th>Account (AR / EN)</th><th>Hierarchy</th><th>Type</th><th>Balance</th></tr></thead><tbody>${filtered
            .map(
              (a) =>
                `<tr><td class="tabular-nums">${a.code}</td><td>${a.nameAr} (${a.nameEn})</td><td>${
                  a.isGroup ? 'Main Group' : `Sub (${a.parentCode || '-'})`
                }</td><td>${a.type}</td><td class="tabular-nums">${a.balance.toLocaleString()} EGP</td></tr>`
            )
            .join('')}</tbody></table>`
        );
      });
    };
    renderAccountsView();
    return;
  }

  if (subView === 'journalEntries') {
    const legacyAccountMismatches = journalEntries.filter(entry => {
      const codes=new Set(entry.lines.map(line=>line.accountCode));
      if(entry.referenceType==='invoice')return codes.has('1103')||codes.has('2101');
      if(entry.referenceType==='payment'||entry.referenceType==='expense')return codes.has('1101')||codes.has('1102')||codes.has('1103');
      if(entry.referenceType==='commission_payout')return codes.has('1101');
      return false;
    });
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.journalEntries}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('دفتر القيود اليومية التلقائية المزود بـ Virtual Scrolling للتعامل مع آلاف القيود بسلاسة', 'Automatic double-entry journal entries powered by Virtual Scrolling')}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-mono font-bold text-emerald-800 tabular-nums">
              ⚡ Virtual Scroll (${journalEntries.length} ${i18n.bi('قيد', 'entries')})
            </span>
            ${can(user,'add','journalEntries') ? `<button id="je-add" class="rounded-lg bg-sky-700 text-white px-3.5 py-2 text-xs font-bold">${i18n.bi('إضافة قيد يومية', 'New Journal Entry')}</button>` : ''}
            <button id="je-print" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
          </div>
        </div>
        ${legacyAccountMismatches.length>0 ? `<div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          ${i18n.bi('تنبيه مراجعة محاسبية: يوجد ','Accounting review: ')}<strong>${legacyAccountMismatches.length}</strong>
          ${i18n.bi(' قيدًا قديمًا بأكواد قد لا تطابق شجرة الحسابات الحالية. لم تُعدّل هذه القيود تلقائيًا؛ تُراجع وتُصحح بقيود تسوية معتمدة.', ' historical journals may reference outdated account codes. No original entries were rewritten; review and reconcile with approved adjustment journals.')}
          </div>` : ''}
        <div id="je-virtual-table-host"></div>
      </div>
    `;

    const jeHost = document.getElementById('je-virtual-table-host');
    if (jeHost) {
      const vTable = new VirtualTable<JournalEntry>(
        jeHost,
        journalEntries,
        (je) => `
          <tr class="hover:bg-slate-50 align-top" style="height: 56px;">
            <td class="py-2 px-3 font-mono font-bold text-sky-700 tabular-nums">${je.entryNumber}</td>
            <td class="py-2 px-3 font-mono text-slate-500 tabular-nums">${je.date}</td>
            <td class="py-2 px-3 font-bold text-slate-900">${i18n.bi(je.descriptionAr, je.descriptionEn)}</td>
            <td class="py-2 px-3 font-mono text-[11px] text-slate-600">
              ${je.lines.map((l) => `${l.accountCode}: ${l.debit > 0 ? `D ${l.debit}` : `C ${l.credit}`}`).join(' | ')}
            </td>
            <td class="py-2 px-3 font-mono font-bold text-emerald-700 tabular-nums">${je.totalDebit.toFixed(2)}</td>
            <td class="py-2 px-3 font-mono font-bold text-emerald-700 tabular-nums">${je.totalCredit.toFixed(2)}</td>
            <td class="py-2 px-3 text-xs">
              ${je.entryType === 'manual' && je.referenceType === 'manual' && !je.reversalEntryId ? `
                ${can(user,'edit','journalEntries') ? `<button type="button" data-je-edit="${je.id}" class="rounded border border-sky-300 px-2 py-1 text-sky-700">${i18n.bi('تعديل','Edit')}</button>` : ''}
                ${can(user,'delete','journalEntries') ? `<button type="button" data-je-reverse="${je.id}" class="rounded border border-rose-300 px-2 py-1 text-rose-700">${i18n.bi('حذف/إلغاء','Reverse')}</button>` : ''}
              ` : je.reversalEntryId ? `<span class="text-rose-700">${i18n.bi('ملغى بقيد عكسي','Reversed')}</span>` : ''}
            </td>
          </tr>
        `,
        {
          rowHeight: 56,
          visibleRows: 15,
          headers: [
            i18n.bi('رقم القيد', 'Entry #'),
            i18n.dict.common.date,
            i18n.bi('البيان', 'Description'),
            i18n.bi('تفاصيل الأسطر (حساب: مدين/دائن)', 'Lines Breakdown'),
            i18n.bi('إجمالي مدين', 'Total Debit'),
            i18n.bi('إجمالي دائن', 'Total Credit'),
            i18n.bi('الإجراءات', 'Actions'),
          ],
        }
      );
      vTable.render();
    }

    document.getElementById('je-add')?.addEventListener('click', () => {
      void openManualJournalEditor(() => { void renderAccountingPage(container,'journalEntries'); });
    });
    jeHost?.addEventListener('click', event => {
      const target=event.target as HTMLElement;
      const edit=target.closest<HTMLButtonElement>('[data-je-edit]');
      const reverse=target.closest<HTMLButtonElement>('[data-je-reverse]');
      const entry=journalEntries.find(j=>j.id===(edit?.dataset.jeEdit||reverse?.dataset.jeReverse));
      if(!entry)return;
      if(edit)void openManualJournalEditor(()=>{void renderAccountingPage(container,'journalEntries');},entry);
      if(reverse)void confirmManualJournalReversal(entry,()=>{void renderAccountingPage(container,'journalEntries');});
    });

    document.getElementById('je-print')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.journalEntries,
        `<table class="print-table"><thead><tr><th>Entry #</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${journalEntries.slice(0, 50).map((j) => `<tr><td class="tabular-nums">${j.entryNumber}</td><td class="tabular-nums">${j.date}</td><td>${i18n.bi(j.descriptionAr, j.descriptionEn)}</td><td class="tabular-nums">${j.totalDebit}</td><td class="tabular-nums">${j.totalCredit}</td></tr>`).join('')}</tbody></table>`
      );
    });
    return;
  }

  if (subView === 'expenses') {
    const canAdd = can(user, 'add', 'expenses');
    const canEdit = can(user, 'edit', 'expenses');
    const canDelete = can(user, 'delete', 'expenses');

    let customCategories = getSavedExpenseCategories();
    let customPaymentMethods = getSavedPaymentMethods();

    const expenseAccounts = accounts
      .filter((a) => a.type === 'expense' && !a.isGroup)
      .sort((a, b) => a.code.localeCompare(b.code));

    const expenseAccountOptions =
      expenseAccounts.length > 0
        ? expenseAccounts.map((a) => ({ code: a.code, label: `${a.code} - ${a.nameAr}` }))
        : [
            { code: '5104', label: '5104 - مصروف المحاليل والمستلزمات الطبية' },
            { code: '5102', label: '5102 - مصروف الرواتب والأجور' },
            { code: '5103', label: '5103 - مصروف الإيجار الشهري' },
            { code: '5105', label: '5105 - مصروف الكهرباء والمياه والمرافق' },
            { code: '5106', label: '5106 - مصروف صيانة ومعايرة الأجهزة' },
            { code: '5107', label: '5107 - مصروفات مطبوعات وإدارية وعمومية' },
          ];

    const getPaymentMethodLabel = (pmId: string): string => {
      const found = customPaymentMethods.find((m) => m.id === pmId);
      if (found) return found.labelAr;
      if (pmId === 'cash') return 'نقدًا من الخزينة';
      if (pmId === 'bank_transfer') return 'تحويل بنكي';
      return pmId;
    };

    // Modal to Add or Edit a single Expense Category
    const openSingleCategoryModal = (
      existingCategory?: string,
      onDone?: (selectedCategory: string) => void
    ) => {
      const isEdit = Boolean(existingCategory);
      openCustomModal(
        isEdit
          ? i18n.bi('تعديل بند المصروف', 'Edit Expense Category')
          : i18n.bi('إضافة بند مصروف جديد', 'Add Expense Category'),
        `
          <form id="cat-single-form" class="space-y-4 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم بند / فئة المصروف *', 'Expense Category Name *')}</label>
              <input name="catName" required value="${existingCategory || ''}" placeholder="مثال: مصروفات صيانة أجهزة الكيمياء" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                💾 ${i18n.dict.actions.save}
              </button>
            </div>
          </form>
        `,
        (close) => {
          const form = document.getElementById('cat-single-form') as HTMLFormElement | null;
          form?.addEventListener('submit', (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const val = String(fd.get('catName') || '').trim();
            if (!val) return;
            customCategories = getSavedExpenseCategories();
            if (isEdit && existingCategory) {
              const idx = customCategories.indexOf(existingCategory);
              if (idx >= 0) customCategories[idx] = val;
              else customCategories.unshift(val);
            } else if (!customCategories.includes(val)) {
              customCategories.unshift(val);
            }
            saveExpenseCategories(customCategories);
            showToast(
              isEdit ? `تم تعديل بند المصروف إلى (${val})` : `تم إضافة بند المصروف (${val}) بنجاح`,
              'success'
            );
            close();
            if (onDone) onDone(val);
            else renderAccountingPage(container, 'expenses');
          });
        }
      );
    };

    // Modal to Add or Edit a single Payment Method
    const openSinglePaymentMethodModal = (
      existingPm?: CustomPaymentMethodOption,
      onDone?: (selectedPmId: string) => void
    ) => {
      const isEdit = Boolean(existingPm);
      const cashAndBankAccounts = accounts.filter(
        (a) => a.type === 'asset' && !a.isGroup && a.code.startsWith('11')
      );

      openCustomModal(
        isEdit
          ? i18n.bi(`تعديل طريقة الدفع (${existingPm!.labelAr})`, 'Edit Payment Method')
          : i18n.bi('إضافة طريقة دفع جديدة', 'Add Payment Method'),
        `
          <form id="pm-single-form" class="space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم طريقة الدفع بالعربي *', 'Arabic Name *')}</label>
                <input name="labelAr" required value="${existingPm?.labelAr || ''}" placeholder="مثال: إنستا باي - بنك CIB" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اسم طريقة الدفع بالإنجليزي', 'English Name')}</label>
                <input name="labelEn" value="${existingPm?.labelEn || ''}" placeholder="e.g., InstaPay CIB" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">${i18n.bi('حساب الخزينة / البنك المرتبط بالقيد', 'Linked Cash/Bank Account')}</label>
              <select name="accountCode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                ${(cashAndBankAccounts.length > 0
                  ? cashAndBankAccounts
                  : [
                      { code: '1101', nameAr: 'الخزينة النقدية الرئيسية' },
                      { code: '1102', nameAr: 'البنوك والحسابات الجارية' },
                    ]
                )
                  .map(
                    (a) =>
                      `<option value="${a.code}" ${existingPm?.accountCode === a.code ? 'selected' : ''}>${a.code} - ${a.nameAr}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                💾 ${i18n.dict.actions.save}
              </button>
            </div>
          </form>
        `,
        (close) => {
          const form = document.getElementById('pm-single-form') as HTMLFormElement | null;
          form?.addEventListener('submit', (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const labelAr = String(fd.get('labelAr') || '').trim();
            const labelEn = String(fd.get('labelEn') || labelAr).trim();
            const accountCode = String(fd.get('accountCode') || '1101');
            if (!labelAr) return;

            customPaymentMethods = getSavedPaymentMethods();
            const pmId = existingPm?.id || `pm_${Date.now()}`;
            const updatedItem: CustomPaymentMethodOption = {
              id: pmId,
              labelAr,
              labelEn,
              accountCode,
            };

            if (isEdit && existingPm) {
              const idx = customPaymentMethods.findIndex((m) => m.id === existingPm.id);
              if (idx >= 0) customPaymentMethods[idx] = updatedItem;
              else customPaymentMethods.push(updatedItem);
            } else {
              customPaymentMethods.push(updatedItem);
            }
            savePaymentMethods(customPaymentMethods);
            showToast(
              isEdit
                ? `تم تعديل طريقة الدفع (${labelAr}) بنجاح`
                : `تم إضافة طريقة الدفع (${labelAr}) بنجاح`,
              'success'
            );
            close();
            if (onDone) onDone(pmId);
            else renderAccountingPage(container, 'expenses');
          });
        }
      );
    };

    // Build shared Expense Form Modal (used for both Add & Edit Expense, with inline Add/Edit/Delete for Category & Payment Method)
    const openExpenseFormModal = (existingExpense?: Expense) => {
      const isEdit = Boolean(existingExpense);
      customCategories = getSavedExpenseCategories();
      customPaymentMethods = getSavedPaymentMethods();

      if (existingExpense?.category && !customCategories.includes(existingExpense.category)) {
        customCategories.unshift(existingExpense.category);
      }

      const selectedCat = existingExpense?.category || customCategories[0] || 'المحاليل والمستلزمات';
      const selectedPm = existingExpense?.paymentMethod || customPaymentMethods[0]?.id || 'cash';

      openCustomModal(
        isEdit
          ? i18n.bi(`تعديل المصروف (${existingExpense!.expenseNumber})`, `Edit Expense (${existingExpense!.expenseNumber})`)
          : i18n.bi('تسجيل مصروف تشغيلي جديد', 'Record New Expense'),
        `
          <form id="exp-unified-form" class="space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.code}</label>
                <input type="text" value="${existingExpense?.expenseNumber || `EXP-2026-${String(Date.now()).slice(-4)}`}" disabled class="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-mono text-slate-600" />
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.date} *</label>
                <input name="date" type="date" required value="${existingExpense?.date || new Date().toISOString().slice(0, 10)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              </div>
            </div>

            <!-- Expense Category with inline Add / Edit / Delete -->
            <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="font-bold text-slate-800">${i18n.bi('بند / فئة المصروف *', 'Expense Category *')}</label>
                <div class="flex items-center gap-1.5">
                  <button type="button" id="inline-cat-add" class="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer">
                    + إضافة بند
                  </button>
                  <button type="button" id="inline-cat-edit" class="rounded border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                    ✏️ تعديل البند
                  </button>
                  <button type="button" id="inline-cat-del" class="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                    🗑️ حذف البند
                  </button>
                </div>
              </div>
              <select id="exp-category-select" name="category" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white font-semibold">
                ${customCategories
                  .map((c) => `<option value="${c}" ${c === selectedCat ? 'selected' : ''}>${c}</option>`)
                  .join('')}
              </select>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('الحساب المحاسبي للمصروف', 'Expense Account Code')}</label>
                <select name="accountCode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  ${expenseAccountOptions
                    .map(
                      (opt) =>
                        `<option value="${opt.code}" ${existingExpense?.accountCode === opt.code ? 'selected' : ''}>${opt.label}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.amount} (EGP) *</label>
                <input name="amount" type="number" step="0.01" min="1" required value="${existingExpense?.amount ?? 500}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold" />
              </div>
            </div>

            <!-- Payment Method with inline Add / Edit / Delete -->
            <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="font-bold text-slate-800">${i18n.bi('طريقة الدفع *', 'Payment Method *')}</label>
                <div class="flex items-center gap-1.5">
                  <button type="button" id="inline-pm-add" class="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer">
                    + إضافة طريقة دفع
                  </button>
                  <button type="button" id="inline-pm-edit" class="rounded border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                    ✏️ تعديل الطريقة
                  </button>
                  <button type="button" id="inline-pm-del" class="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                    🗑️ حذف الطريقة
                  </button>
                </div>
              </div>
              <select id="exp-pm-select" name="paymentMethod" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white font-semibold">
                ${customPaymentMethods
                  .map(
                    (pm) =>
                      `<option value="${pm.id}" ${pm.id === selectedPm ? 'selected' : ''}>${pm.labelAr} (${pm.labelEn})</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div>
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('البيان والتفاصيل', 'Description')} *</label>
              <input name="description" required value="${existingExpense?.description || 'شراء مستلزمات ومحاليل تشغيل للمعمل'}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">
                💾 ${i18n.dict.actions.save}
              </button>
            </div>
          </form>
        `,
        (close) => {
          const catSelect = document.getElementById('exp-category-select') as HTMLSelectElement | null;
          const pmSelect = document.getElementById('exp-pm-select') as HTMLSelectElement | null;

          // Inline Category Add / Edit / Delete
          document.getElementById('inline-cat-add')?.addEventListener('click', () => {
            openSingleCategoryModal(undefined, (newCat) => {
              openExpenseFormModal({
                ...(existingExpense || {
                  id: '',
                  expenseNumber: `EXP-2026-${String(Date.now()).slice(-4)}`,
                  accountCode: '5104',
                  amount: 500,
                  date: new Date().toISOString().slice(0, 10),
                  paidBy: user?.username || 'accountant',
                  paymentMethod: pmSelect?.value || 'cash',
                  description: 'شراء مستلزمات ومحاليل تشغيل للمعمل',
                }),
                category: newCat,
              } as Expense);
            });
          });

          document.getElementById('inline-cat-edit')?.addEventListener('click', () => {
            const currentCat = catSelect?.value;
            if (!currentCat) return;
            openSingleCategoryModal(currentCat, (editedCat) => {
              openExpenseFormModal({
                ...(existingExpense || {
                  id: '',
                  expenseNumber: `EXP-2026-${String(Date.now()).slice(-4)}`,
                  accountCode: '5104',
                  amount: 500,
                  date: new Date().toISOString().slice(0, 10),
                  paidBy: user?.username || 'accountant',
                  paymentMethod: pmSelect?.value || 'cash',
                  description: 'شراء مستلزمات ومحاليل تشغيل للمعمل',
                }),
                category: editedCat,
              } as Expense);
            });
          });

          document.getElementById('inline-cat-del')?.addEventListener('click', () => {
            const currentCat = catSelect?.value;
            if (!currentCat) return;
            openDeleteConfirmModal({
              recordLabel: `بند المصروف: ${currentCat}`,
              onConfirm: async () => {
                customCategories = getSavedExpenseCategories().filter((c) => c !== currentCat);
                if (customCategories.length === 0) {
                  customCategories = ['مصروفات عامة'];
                }
                saveExpenseCategories(customCategories);
                showToast(`تم حذف بند المصروف (${currentCat}) بنجاح`, 'success');
                openExpenseFormModal(existingExpense);
              },
            });
          });

          // Inline Payment Method Add / Edit / Delete
          document.getElementById('inline-pm-add')?.addEventListener('click', () => {
            openSinglePaymentMethodModal(undefined, (newPmId) => {
              openExpenseFormModal({
                ...(existingExpense || {
                  id: '',
                  expenseNumber: `EXP-2026-${String(Date.now()).slice(-4)}`,
                  category: catSelect?.value || customCategories[0],
                  accountCode: '5104',
                  amount: 500,
                  date: new Date().toISOString().slice(0, 10),
                  paidBy: user?.username || 'accountant',
                  description: 'شراء مستلزمات ومحاليل تشغيل للمعمل',
                }),
                paymentMethod: newPmId,
              } as Expense);
            });
          });

          document.getElementById('inline-pm-edit')?.addEventListener('click', () => {
            const currentPmId = pmSelect?.value;
            const foundPm = getSavedPaymentMethods().find((m) => m.id === currentPmId);
            if (!foundPm) return;
            openSinglePaymentMethodModal(foundPm, (editedPmId) => {
              openExpenseFormModal({
                ...(existingExpense || {
                  id: '',
                  expenseNumber: `EXP-2026-${String(Date.now()).slice(-4)}`,
                  category: catSelect?.value || customCategories[0],
                  accountCode: '5104',
                  amount: 500,
                  date: new Date().toISOString().slice(0, 10),
                  paidBy: user?.username || 'accountant',
                  description: 'شراء مستلزمات ومحاليل تشغيل للمعمل',
                }),
                paymentMethod: editedPmId,
              } as Expense);
            });
          });

          document.getElementById('inline-pm-del')?.addEventListener('click', () => {
            const currentPmId = pmSelect?.value;
            const foundPm = getSavedPaymentMethods().find((m) => m.id === currentPmId);
            if (!foundPm) return;
            openDeleteConfirmModal({
              recordLabel: `طريقة الدفع: ${foundPm.labelAr}`,
              onConfirm: async () => {
                customPaymentMethods = getSavedPaymentMethods().filter((m) => m.id !== foundPm.id);
                if (customPaymentMethods.length === 0) {
                  customPaymentMethods = [...DEFAULT_PAYMENT_METHODS.slice(0, 1)];
                }
                savePaymentMethods(customPaymentMethods);
                showToast(`تم حذف طريقة الدفع (${foundPm.labelAr}) بنجاح`, 'success');
                openExpenseFormModal(existingExpense);
              },
            });
          });

          const form = document.getElementById('exp-unified-form') as HTMLFormElement | null;
          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!(await enforcePermission(isEdit ? 'edit' : 'add', 'expenses'))) return;
            const fd = new FormData(form);
            const hasExistingId = Boolean(existingExpense && existingExpense.id);

            const rec: Expense = {
              id: hasExistingId ? existingExpense!.id : `exp_${Date.now()}`,
              expenseNumber: hasExistingId
                ? existingExpense!.expenseNumber
                : `EXP-2026-${String(Date.now()).slice(-4)}`,
              category: String(fd.get('category') || '').trim(),
              accountCode: String(fd.get('accountCode') || '5104'),
              amount: Number(fd.get('amount')) || 0,
              date: String(fd.get('date') || new Date().toISOString().slice(0, 10)),
              paidBy: existingExpense?.paidBy || user?.username || 'accountant',
              paymentMethod: String(fd.get('paymentMethod') || 'cash'),
              description: String(fd.get('description') || '').trim(),
            };

            await accountingRepository.saveExpense(rec);

            const pmObj = getSavedPaymentMethods().find((m) => m.id === rec.paymentMethod);
            const creditCode = pmObj?.accountCode || (rec.paymentMethod === 'cash' ? '1101' : '1102');
            const creditNameAr = pmObj?.labelAr || (rec.paymentMethod === 'cash' ? 'الصندوق النقدي الرئيسي' : 'البنك والحسابات الجارية');
            const creditNameEn = pmObj?.labelEn || (rec.paymentMethod === 'cash' ? 'Main Cashbox' : 'Bank Account');

            if (hasExistingId) {
              const linkedJe = journalEntries.find(
                (j) => j.referenceType === 'expense' && j.referenceId === rec.id
              );
              if (linkedJe) {
                await accountingRepository.saveJournalEntry({
                  ...linkedJe,
                  date: rec.date,
                  descriptionAr: `سداد مصروف (${rec.category}): ${rec.description}`,
                  descriptionEn: `Expense (${rec.category}): ${rec.description}`,
                  lines: [
                    {
                      accountCode: rec.accountCode,
                      accountNameAr: rec.category,
                      accountNameEn: rec.category,
                      debit: rec.amount,
                      credit: 0,
                    },
                    {
                      accountCode: creditCode,
                      accountNameAr: creditNameAr,
                      accountNameEn: creditNameEn,
                      debit: 0,
                      credit: rec.amount,
                    },
                  ],
                  totalDebit: rec.amount,
                  totalCredit: rec.amount,
                });
              }
              await authService.logAudit(
                `تعديل مصروف: ${rec.expenseNumber}`,
                'expenses',
                rec.id,
                `${rec.category} - ${rec.amount} EGP`
              );
              showToast(i18n.bi('تم حفظ تعديلات المصروف وتحديث القيد بنجاح', 'Expense updated successfully'), 'success');
            } else {
              await accountingService.recordExpenseJournal(rec, user?.username || 'accountant');
              await authService.logAudit(`تسجيل مصروف: ${rec.expenseNumber}`, 'expenses', rec.id, `${rec.amount} EGP`);
              showToast(i18n.bi('تم تسجيل المصروف وإنشاء قيد اليومية التلقائي', 'Expense & journal entry recorded'), 'success');
            }

            close();
            renderAccountingPage(container, 'expenses');
          });
        }
      );
    };

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.expenses}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('تسجيل مصروفات المعمل وإدارة بنود المصروفات وطرق الدفع مع توليد قيود اليومية التلقائية', 'Record laboratory expenses & manage expense categories and payment methods')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button id="exp-add-cat-top-btn" class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer">
              + ${i18n.bi('إضافة بند مصروف', 'Add Category')}
            </button>
            <button id="exp-add-pm-top-btn" class="rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-800 hover:bg-purple-100 cursor-pointer">
              + ${i18n.bi('إضافة طريقة دفع', 'Add Payment Method')}
            </button>
            <button id="exp-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              🖨️ ${i18n.dict.actions.print}
            </button>
            ${canAdd ? `<button id="exp-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.bi('تسجيل مصروف جديد', 'New Expense')}</button>` : ''}
          </div>
        </div>

        <!-- Interactive Management Panels for Expense Categories & Payment Methods -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Expense Categories Card -->
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="flex items-center justify-between mb-2.5">
              <h2 class="text-xs font-bold text-slate-900">🗂️ ${i18n.bi('بنود وفئات المصروفات المتاحة', 'Expense Categories')} (${customCategories.length})</h2>
              <button type="button" id="cat-card-add-btn" class="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer">+ إضافة بند جديد</button>
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              ${customCategories
                .map(
                  (c, idx) => `
                  <div class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]">
                    <span class="font-semibold text-slate-800">${c}</span>
                    <button type="button" data-edit-cat-idx="${idx}" class="text-sky-600 hover:text-sky-800 font-bold px-1 cursor-pointer" title="تعديل البند">✏️</button>
                    <button type="button" data-del-cat-idx="${idx}" class="text-rose-600 hover:text-rose-800 font-bold px-0.5 cursor-pointer" title="حذف البند">🗑️</button>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>

          <!-- Payment Methods Card -->
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="flex items-center justify-between mb-2.5">
              <h2 class="text-xs font-bold text-slate-900">💳 ${i18n.bi('طرق الدفع المتاحة للمصروفات', 'Payment Methods')} (${customPaymentMethods.length})</h2>
              <button type="button" id="pm-card-add-btn" class="rounded bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-purple-700 cursor-pointer">+ إضافة طريقة دفع</button>
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              ${customPaymentMethods
                .map(
                  (pm) => `
                  <div class="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50/40 px-2.5 py-1 text-[11px]">
                    <span class="font-semibold text-slate-800">${pm.labelAr}</span>
                    <span class="text-[10px] font-mono text-slate-400">[${pm.accountCode}]</span>
                    <button type="button" data-edit-pm-id="${pm.id}" class="text-sky-600 hover:text-sky-800 font-bold px-1 cursor-pointer" title="تعديل طريقة الدفع">✏️</button>
                    <button type="button" data-del-pm-id="${pm.id}" class="text-rose-600 hover:text-rose-800 font-bold px-0.5 cursor-pointer" title="حذف طريقة الدفع">🗑️</button>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('بند المصروف', 'Category')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('طريقة الدفع', 'Payment Method')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.date}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.amount}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('البيان', 'Description')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${expenses
                .map(
                  (ex) => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-mono font-bold tabular-nums">${ex.expenseNumber}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-900">${ex.category}</td>
                    <td class="py-2.5 px-3">
                      <span class="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        ${getPaymentMethodLabel(ex.paymentMethod)}
                      </span>
                    </td>
                    <td class="py-2.5 px-3 font-mono tabular-nums">${ex.date}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-rose-700 tabular-nums">${ex.amount.toLocaleString()} EGP</td>
                    <td class="py-2.5 px-3 text-slate-600">${ex.description}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-2">
                        ${
                          canEdit
                            ? `<button type="button" data-edit-exp="${ex.id}" class="exp-edit-btn rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">✏️ ${i18n.dict.actions.edit}</button>`
                            : ''
                        }
                        ${
                          canDelete
                            ? `<button type="button" data-del-exp="${ex.id}" class="exp-del-btn rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">🗑️ ${i18n.dict.actions.delete}</button>`
                            : ''
                        }
                      </div>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Category Card Add / Edit / Delete
    document.getElementById('exp-add-cat-top-btn')?.addEventListener('click', () => openSingleCategoryModal());
    document.getElementById('cat-card-add-btn')?.addEventListener('click', () => openSingleCategoryModal());

    document.querySelectorAll<HTMLButtonElement>('[data-edit-cat-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.editCatIdx);
        const cat = customCategories[idx];
        if (cat) openSingleCategoryModal(cat);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-del-cat-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.delCatIdx);
        const cat = customCategories[idx];
        if (!cat) return;
        openDeleteConfirmModal({
          recordLabel: `بند المصروف: ${cat}`,
          onConfirm: async () => {
            customCategories = customCategories.filter((_, i) => i !== idx);
            if (customCategories.length === 0) customCategories = ['مصروفات عامة'];
            saveExpenseCategories(customCategories);
            showToast(`تم حذف بند المصروف (${cat}) بنجاح`, 'success');
            renderAccountingPage(container, 'expenses');
          },
        });
      });
    });

    // Payment Method Card Add / Edit / Delete
    document.getElementById('exp-add-pm-top-btn')?.addEventListener('click', () => openSinglePaymentMethodModal());
    document.getElementById('pm-card-add-btn')?.addEventListener('click', () => openSinglePaymentMethodModal());

    document.querySelectorAll<HTMLButtonElement>('[data-edit-pm-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pm = customPaymentMethods.find((m) => m.id === btn.dataset.editPmId);
        if (pm) openSinglePaymentMethodModal(pm);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-del-pm-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pm = customPaymentMethods.find((m) => m.id === btn.dataset.delPmId);
        if (!pm) return;
        openDeleteConfirmModal({
          recordLabel: `طريقة الدفع: ${pm.labelAr}`,
          onConfirm: async () => {
            customPaymentMethods = customPaymentMethods.filter((m) => m.id !== pm.id);
            if (customPaymentMethods.length === 0) {
              customPaymentMethods = [...DEFAULT_PAYMENT_METHODS.slice(0, 1)];
            }
            savePaymentMethods(customPaymentMethods);
            showToast(`تم حذف طريقة الدفع (${pm.labelAr}) بنجاح`, 'success');
            renderAccountingPage(container, 'expenses');
          },
        });
      });
    });

    document.getElementById('exp-print-btn')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.expenses,
        `<table class="print-table"><thead><tr><th>Code</th><th>Category</th><th>Payment Method</th><th>Date</th><th>Amount</th><th>Description</th></tr></thead><tbody>${expenses.map((ex) => `<tr><td class="tabular-nums">${ex.expenseNumber}</td><td>${ex.category}</td><td>${getPaymentMethodLabel(ex.paymentMethod)}</td><td class="tabular-nums">${ex.date}</td><td class="tabular-nums">${ex.amount} EGP</td><td>${ex.description}</td></tr>`).join('')}</tbody></table>`
      );
    });

    document.querySelectorAll<HTMLButtonElement>('.exp-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = expenses.find((x) => x.id === btn.getAttribute('data-edit-exp'));
        if (target) openExpenseFormModal(target);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.exp-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = expenses.find((x) => x.id === btn.getAttribute('data-del-exp'));
        if (!target) return;
        openDeleteConfirmModal({
          recordLabel: `${target.expenseNumber} (${target.category} - ${target.amount} EGP)`,
          onConfirm: async (reason) => {
            if (!(await enforcePermission('delete', 'expenses'))) return;
            await accountingRepository.deleteExpense(target.id);
            await authService.logAudit(`حذف مصروف: ${target.expenseNumber}`, 'expenses', target.id, reason || '');
            showToast(i18n.bi('تم حذف المصروف بنجاح', 'Expense deleted'), 'success');
            renderAccountingPage(container, 'expenses');
          },
        });
      });
    });

    document.getElementById('exp-add-btn')?.addEventListener('click', () => {
      openExpenseFormModal();
    });
    return;
  }

  if (subView === 'cashbox') {
    const canClose = can(user, 'closeDay', 'cashbox');
    const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
    const netCash = totalCollected - totalExp;

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.cashbox}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('مراقبة حركة النقدية بالصندوق وإغلاق اليومية المحاسبية', 'Cashbox session monitoring and daily financial closing')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="cb-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
            ${canClose ? `<button id="cb-close-btn" class="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">${i18n.dict.actions.closeDay}</button>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي المقبوضات المحصلة', 'Total Collected Inflows')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-emerald-700 tabular-nums">${totalCollected.toLocaleString()} EGP</div>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي المصروفات', 'Total Outflows / Expenses')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-rose-700 tabular-nums">${totalExp.toLocaleString()} EGP</div>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 p-4">
            <div class="text-xs text-slate-500">${i18n.bi('صافي النقدية والأرصدة', 'Net Cash Position')}</div>
            <div class="mt-1 text-xl font-mono font-bold text-slate-900 tabular-nums">${netCash.toLocaleString()} EGP</div>
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 p-5">
          <h2 class="text-sm font-bold text-slate-900 mb-3">${i18n.bi('سجل إغلاقات اليومية السابقة', 'Daily Closings Log')}</h2>
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 text-slate-500">
                <th class="py-2">${i18n.dict.common.date}</th>
                <th class="py-2">${i18n.bi('المبيعات', 'Invoices')}</th>
                <th class="py-2">${i18n.bi('النقدي المحصل', 'Cash Collected')}</th>
                <th class="py-2">${i18n.bi('المصروفات', 'Expenses')}</th>
                <th class="py-2">${i18n.bi('الصافي بالصندوق', 'Net Cash')}</th>
                <th class="py-2">${i18n.bi('أغلق بواسطة', 'Closed By')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${closings
                .map(
                  (c) => `
                  <tr>
                    <td class="py-2 font-mono tabular-nums">${c.date}</td>
                    <td class="py-2 font-mono tabular-nums">${c.totalInvoices}</td>
                    <td class="py-2 font-mono tabular-nums">${c.totalCollectedCash}</td>
                    <td class="py-2 font-mono tabular-nums">${c.totalExpenses}</td>
                    <td class="py-2 font-mono font-bold tabular-nums">${c.netCashInBox} EGP</td>
                    <td class="py-2">${c.closedBy} (${c.closedAt})</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('cb-print-btn')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.cashbox,
        `<table class="print-table"><thead><tr><th>Date</th><th>Total Invoices</th><th>Cash Collected</th><th>Expenses</th><th>Net Cash</th><th>Closed By</th></tr></thead><tbody>${closings.map((c) => `<tr><td class="tabular-nums">${c.date}</td><td class="tabular-nums">${c.totalInvoices}</td><td class="tabular-nums">${c.totalCollectedCash}</td><td class="tabular-nums">${c.totalExpenses}</td><td class="tabular-nums">${c.netCashInBox} EGP</td><td>${c.closedBy}</td></tr>`).join('')}</tbody></table>`
      );
    });

    document.getElementById('cb-close-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('closeDay', 'cashbox'))) return;
      const newClose: DailyClosing = {
        id: `dc_${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        totalInvoices: Math.round(invoices.reduce((s, i) => s + i.netTotal, 0)),
        totalCollectedCash: Math.round(totalCollected),
        totalCollectedCard: 0,
        totalCollectedBank: 0,
        totalExpenses: Math.round(totalExp),
        netCashInBox: Math.round(netCash),
        closedBy: user?.username || 'accountant',
        closedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
        notes: 'إغلاق يومية معتمد من الشاشة',
      };
      await accountingRepository.saveDailyClosing(newClose);
      await authService.logAudit('إغلاق اليومية المحاسبية', 'cashbox', newClose.id, `Net: ${newClose.netCashInBox} EGP`);
      showToast(i18n.bi('تم إغلاق اليومية وترحيل الأرصدة بنجاح', 'Daily closing completed'), 'success');
      renderAccountingPage(container, 'cashbox');
    });
    return;
  }

  // subView === 'reports' (Simplified Profit & Loss Statement)
  const totalInvoicedNet = invoices.reduce((s, i) => s + i.netTotal, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalCollected - totalExpenses;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.reports}</h1>
          <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('تقرير الأرباح والخسائر المبسط وتقارير الإيرادات والمصروفات', 'Simplified Profit & Loss (P&L), Revenue, and Expense Reports')}</p>
        </div>
        <button id="rep-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('إجمالي صافي الفواتير الصادرة', 'Total Invoiced Net')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-slate-900 tabular-nums">${totalInvoicedNet.toFixed(2)} EGP</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('الإيرادات المحصلة فعليًا', 'Collected Revenue')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-emerald-700 tabular-nums">${totalCollected.toFixed(2)} EGP</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('إجمالي المصروفات التشغيلية', 'Total Operating Expenses')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-rose-700 tabular-nums">${totalExpenses.toFixed(2)} EGP</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 p-4">
          <div class="text-xs text-slate-500">${i18n.bi('صافي الربح التشغيلي', 'Net Operating Profit')}</div>
          <div class="mt-1 text-xl font-mono font-bold text-sky-700 tabular-nums">${netProfit.toFixed(2)} EGP</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('rep-print-btn')?.addEventListener('click', () => {
    printService.printA4(
      i18n.dict.nav.reports,
      `
        <table class="print-table">
          <thead><tr><th>Statement Line</th><th>Amount (EGP)</th></tr></thead>
          <tbody>
            <tr><td>Total Invoiced Net</td><td class="tabular-nums">${totalInvoicedNet.toFixed(2)}</td></tr>
            <tr><td>Total Collected Revenue</td><td class="tabular-nums">${totalCollected.toFixed(2)}</td></tr>
            <tr><td>Total Operating Expenses</td><td class="tabular-nums">-${totalExpenses.toFixed(2)}</td></tr>
            <tr><td><strong>Net Operating Profit</strong></td><td class="tabular-nums"><strong>${netProfit.toFixed(2)} EGP</strong></td></tr>
          </tbody>
        </table>
      `
    );
  });
}
