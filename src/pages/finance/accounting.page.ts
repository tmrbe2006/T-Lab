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
import type { DailyClosing, Expense, JournalEntry } from '../../types';

export async function renderAccountingPage(
  container: HTMLElement,
  subView: 'accounts' | 'journalEntries' | 'cashbox' | 'expenses' | 'reports'
): Promise<void> {
  const user = authService.getCurrentUser();
  const [accounts, journalEntries, expenses, closings, invoices] = await Promise.all([
    accountingRepository.getAccounts(),
    accountingRepository.getJournalEntries(),
    accountingRepository.getExpenses(),
    accountingRepository.getDailyClosings(),
    invoicesRepository.getAll(),
  ]);

  if (subView === 'accounts') {
    let currentPage = 1;
    const itemsPerPage = 15;
    const renderAccountsView = () => {
      const paged = paginateArray(accounts, currentPage, itemsPerPage);
      const pagState = { currentPage, itemsPerPage, totalItems: accounts.length };
      container.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.accounts}</h1>
              <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('شجرة الحسابات المحاسبية: الأصول، الالتزامات، الإيرادات، والمصروفات', 'Chart of Accounts: Assets, Liabilities, Revenues, and Expenses')}</p>
            </div>
            <button id="acc-print" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
          </div>
          <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                  <th class="py-3 px-3 text-start">${i18n.dict.common.name}</th>
                  <th class="py-3 px-3 text-start">${i18n.bi('النوع المحاسبي', 'Account Type')}</th>
                  <th class="py-3 px-3 text-start">${i18n.bi('الرصيد الحالي', 'Current Balance')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${paged
                  .map(
                    (a) => `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${a.code}</td>
                      <td class="py-2.5 px-3 font-bold text-slate-800">${i18n.bi(a.nameAr, a.nameEn)}</td>
                      <td class="py-2.5 px-3 uppercase font-mono text-slate-600">${a.type}</td>
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-900 tabular-nums">${a.balance.toLocaleString()} EGP</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          ${createPaginationControls(pagState, undefined, 'acc-pag')}
        </div>
      `;
      bindTablePagination(container, pagState, (page) => {
        currentPage = page;
        renderAccountsView();
      }, 'acc-pag');
      document.getElementById('acc-print')?.addEventListener('click', () => {
        printService.printA4(
          i18n.dict.nav.accounts,
          `<table class="print-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Balance</th></tr></thead><tbody>${accounts.map((a) => `<tr><td class="tabular-nums">${a.code}</td><td>${i18n.bi(a.nameAr, a.nameEn)}</td><td>${a.type}</td><td class="tabular-nums">${a.balance.toLocaleString()} EGP</td></tr>`).join('')}</tbody></table>`
        );
      });
    };
    renderAccountsView();
    return;
  }

  if (subView === 'journalEntries') {
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
            <button id="je-print" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
          </div>
        </div>
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
          ],
        }
      );
      vTable.render();
    }

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

    const expenseAccountOptions = [
      { code: '5104', label: '5104 - مصروف المحاليل والمستلزمات الطبية' },
      { code: '5102', label: '5102 - مصروف الرواتب والأجور' },
      { code: '5103', label: '5103 - مصروف الإيجار الشهري' },
      { code: '5105', label: '5105 - مصروف الكهرباء والمياه والمرافق' },
      { code: '5106', label: '5106 - مصروف صيانة ومعايرة الأجهزة' },
      { code: '5107', label: '5107 - مصروفات مطبوعات وإدارية وعمومية' },
    ];

    const presetCategories = [
      'الكهرباء والمياه',
      'الرواتب والأجور',
      'الإيجار الشهري',
      'المحاليل والمستلزمات',
      'صيانة أجهزة التحليل',
      'مستلزمات سحب عينات وأنابيب',
      'مطبوعات وأحبار باركود',
    ];

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.expenses}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('تسجيل مصروفات المعمل وتوليد قيود اليومية التلقائية', 'Record laboratory operational expenses with automatic journal entry creation')}</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="exp-print-btn" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>
            ${canAdd ? `<button id="exp-add-btn" class="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">+ ${i18n.dict.actions.add}</button>` : ''}
          </div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.dict.common.code}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('بند المصروف', 'Category')}</th>
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
                    <td class="py-2.5 px-3 font-mono tabular-nums">${ex.date}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-rose-700 tabular-nums">${ex.amount} EGP</td>
                    <td class="py-2.5 px-3 text-slate-600">${ex.description}</td>
                    <td class="py-2.5 px-3">
                      <div class="flex items-center gap-3">
                        ${
                          canEdit
                            ? `<button type="button" data-edit-exp="${ex.id}" class="exp-edit-btn text-sky-600 hover:text-sky-800 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.edit}</button>`
                            : ''
                        }
                        ${
                          canDelete
                            ? `<button type="button" data-del-exp="${ex.id}" class="exp-del-btn text-rose-600 hover:text-rose-800 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.delete}</button>`
                            : ''
                        }
                        ${!canEdit && !canDelete ? '<span class="text-slate-400">—</span>' : ''}
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

    document.getElementById('exp-print-btn')?.addEventListener('click', () => {
      printService.printA4(
        i18n.dict.nav.expenses,
        `<table class="print-table"><thead><tr><th>Code</th><th>Category</th><th>Date</th><th>Amount</th><th>Description</th></tr></thead><tbody>${expenses.map((ex) => `<tr><td class="tabular-nums">${ex.expenseNumber}</td><td>${ex.category}</td><td class="tabular-nums">${ex.date}</td><td class="tabular-nums">${ex.amount} EGP</td><td>${ex.description}</td></tr>`).join('')}</tbody></table>`
      );
    });

    // Edit Expense Modal Handler
    document.querySelectorAll<HTMLButtonElement>('.exp-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = expenses.find((x) => x.id === btn.getAttribute('data-edit-exp'));
        if (!target) return;

        openCustomModal(
          i18n.bi(`تعديل المصروف (${target.expenseNumber})`, `Edit Expense (${target.expenseNumber})`),
          `
            <form id="exp-edit-form" class="space-y-4 text-xs">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.code}</label>
                  <input type="text" value="${target.expenseNumber}" disabled class="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-mono text-slate-600" />
                </div>
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.date} *</label>
                  <input name="date" type="date" required value="${target.date}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('بند / فئة المصروف', 'Expense Category')} *</label>
                  <input name="category" list="exp-categories-list" required value="${target.category}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <datalist id="exp-categories-list">
                    ${presetCategories.map((c) => `<option value="${c}"></option>`).join('')}
                  </datalist>
                </div>
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('الحساب المحاسبي', 'Account Code')}</label>
                  <select name="accountCode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                    ${expenseAccountOptions
                      .map(
                        (opt) =>
                          `<option value="${opt.code}" ${target.accountCode === opt.code ? 'selected' : ''}>${opt.label}</option>`
                      )
                      .join('')}
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.dict.common.amount} (EGP) *</label>
                  <input name="amount" type="number" step="0.01" min="1" required value="${target.amount}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('طريقة الدفع', 'Payment Method')}</label>
                  <select name="paymentMethod" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                    <option value="cash" ${target.paymentMethod === 'cash' ? 'selected' : ''}>${i18n.bi('نقدًا من الصندوق', 'Cashbox (Cash)')}</option>
                    <option value="bank_transfer" ${target.paymentMethod === 'bank_transfer' ? 'selected' : ''}>${i18n.bi('تحويل بنكي', 'Bank Transfer')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('البيان والتفاصيل', 'Description')} *</label>
                <input name="description" required value="${target.description}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">${i18n.dict.actions.save}</button>
              </div>
            </form>
          `,
          (close) => {
            const form = document.getElementById('exp-edit-form') as HTMLFormElement | null;
            form?.addEventListener('submit', async (e) => {
              e.preventDefault();
              if (!(await enforcePermission('edit', 'expenses'))) return;
              const fd = new FormData(form);
              const updatedExpense: Expense = {
                ...target,
                category: String(fd.get('category') || target.category).trim(),
                accountCode: String(fd.get('accountCode') || target.accountCode),
                date: String(fd.get('date') || target.date),
                amount: Number(fd.get('amount')) || target.amount,
                paymentMethod: (fd.get('paymentMethod') as Expense['paymentMethod']) || target.paymentMethod,
                description: String(fd.get('description') || target.description).trim(),
              };

              await accountingRepository.saveExpense(updatedExpense);

              // Synchronize linked Journal Entry if one exists
              const linkedJe = journalEntries.find(
                (j) => j.referenceType === 'expense' && j.referenceId === target.id
              );
              if (linkedJe) {
                const creditCode = updatedExpense.paymentMethod === 'cash' ? '1101' : '1102';
                const creditNameAr =
                  updatedExpense.paymentMethod === 'cash' ? 'الصندوق النقدي الرئيسي' : 'البنك والحسابات الجارية';
                const creditNameEn =
                  updatedExpense.paymentMethod === 'cash' ? 'Main Cashbox' : 'Bank Account';

                await accountingRepository.saveJournalEntry({
                  ...linkedJe,
                  date: updatedExpense.date,
                  descriptionAr: `سداد مصروف (${updatedExpense.category}): ${updatedExpense.description}`,
                  descriptionEn: `Expense (${updatedExpense.category}): ${updatedExpense.description}`,
                  lines: [
                    {
                      accountCode: updatedExpense.accountCode,
                      accountNameAr: updatedExpense.category,
                      accountNameEn: updatedExpense.category,
                      debit: updatedExpense.amount,
                      credit: 0,
                    },
                    {
                      accountCode: creditCode,
                      accountNameAr: creditNameAr,
                      accountNameEn: creditNameEn,
                      debit: 0,
                      credit: updatedExpense.amount,
                    },
                  ],
                  totalDebit: updatedExpense.amount,
                  totalCredit: updatedExpense.amount,
                });
              }

              await authService.logAudit(
                `تعديل مصروف: ${updatedExpense.expenseNumber}`,
                'expenses',
                updatedExpense.id,
                `${updatedExpense.category} - ${updatedExpense.amount} EGP`
              );
              showToast(i18n.bi('تم حفظ تعديلات المصروف وتحديث القيد بنجاح', 'Expense updated successfully'), 'success');
              close();
              renderAccountingPage(container, 'expenses');
            });
          }
        );
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
      openCustomModal(
        i18n.bi('تسجيل مصروف تشغيلي جديد', 'Record New Expense'),
        `
          <form id="exp-form" class="space-y-4 text-xs">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold mb-1">${i18n.bi('بند / فئة المصروف', 'Expense Category')}</label>
                <input name="category" list="exp-add-categories-list" required value="المحاليل والمستلزمات" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <datalist id="exp-add-categories-list">
                  ${presetCategories.map((c) => `<option value="${c}"></option>`).join('')}
                </datalist>
              </div>
              <div>
                <label class="block font-semibold mb-1">${i18n.bi('الحساب المحاسبي', 'Account Code')}</label>
                <select name="accountCode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  ${expenseAccountOptions.map((opt) => `<option value="${opt.code}">${opt.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold mb-1">${i18n.dict.common.amount} (EGP) *</label>
                <input name="amount" type="number" step="0.01" min="1" required value="500" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label class="block font-semibold mb-1">${i18n.bi('طريقة الدفع', 'Payment Method')}</label>
                <select name="paymentMethod" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="cash">${i18n.bi('نقدًا من الصندوق', 'Cashbox (Cash)')}</option>
                  <option value="bank_transfer">${i18n.bi('تحويل بنكي', 'Bank Transfer')}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block font-semibold mb-1">${i18n.bi('البيان والتفاصيل', 'Description')}</label>
              <input name="description" required value="شراء مستلزمات سحب عينات" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="rounded-lg bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer">${i18n.dict.actions.save}</button>
            </div>
          </form>
        `,
        (close) => {
          const form = document.getElementById('exp-form') as HTMLFormElement | null;
          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!(await enforcePermission('add', 'expenses'))) return;
            const fd = new FormData(form);
            const rec: Expense = {
              id: `exp_${Date.now()}`,
              expenseNumber: `EXP-2026-${String(Date.now()).slice(-4)}`,
              category: String(fd.get('category') || ''),
              accountCode: String(fd.get('accountCode') || '5104'),
              amount: Number(fd.get('amount')) || 0,
              date: new Date().toISOString().slice(0, 10),
              paidBy: user?.username || 'accountant',
              paymentMethod: (fd.get('paymentMethod') as Expense['paymentMethod']) || 'cash',
              description: String(fd.get('description') || ''),
            };
            await accountingRepository.saveExpense(rec);
            await accountingService.recordExpenseJournal(rec, user?.username || 'accountant');
            await authService.logAudit(`تسجيل مصروف: ${rec.expenseNumber}`, 'expenses', rec.id, `${rec.amount} EGP`);
            showToast(i18n.bi('تم تسجيل المصروف وإنشاء قيد اليومية التلقائي', 'Expense & journal entry recorded'), 'success');
            close();
            renderAccountingPage(container, 'expenses');
          });
        }
      );
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
