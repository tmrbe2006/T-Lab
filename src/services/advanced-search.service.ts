import { exportToCsv, openCustomModal } from '../components/common';
import { db } from '../db/database';
import { i18n } from '../i18n';
import { printService } from '../print/print.service';
import { router, type RouteId } from '../router';

export type MatchOperator = 'contains' | 'exact' | 'starts_with' | 'not_contains';

export interface AdvancedFilterCriteria {
  keyword: string;
  columnIndex: number; // -1 means all columns
  operator: MatchOperator;
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
}

export interface GlobalSearchResultItem {
  moduleLabelAr: string;
  moduleLabelEn: string;
  route: RouteId;
  code: string;
  title: string;
  subtitle: string;
  date?: string;
  amount?: number;
}

export class AdvancedSearchService {
  private isPanelExpanded = false;

  /**
   * Evaluates whether a table row's cells match the given AdvancedFilterCriteria.
   */
  public matchesRow(cellsText: string[], criteria: AdvancedFilterCriteria): boolean {
    const fullRowText = cellsText.join(' ').toLowerCase();

    // 1. Keyword & Column + Operator filter
    const q = criteria.keyword.trim().toLowerCase();
    if (q) {
      const targetText =
        criteria.columnIndex >= 0 && criteria.columnIndex < cellsText.length
          ? (cellsText[criteria.columnIndex] || '').toLowerCase()
          : fullRowText;

      if (criteria.operator === 'exact') {
        if (targetText.trim() !== q && !cellsText.some((c) => c.trim().toLowerCase() === q)) {
          return false;
        }
      } else if (criteria.operator === 'starts_with') {
        if (
          !targetText.trim().startsWith(q) &&
          !cellsText.some((c) => c.trim().toLowerCase().startsWith(q))
        ) {
          return false;
        }
      } else if (criteria.operator === 'not_contains') {
        if (targetText.includes(q)) {
          return false;
        }
      } else {
        // 'contains' supports space-separated multi-terms
        const terms = q.split(/\s+/).filter(Boolean);
        for (const term of terms) {
          if (!targetText.includes(term)) {
            return false;
          }
        }
      }
    }

    // 2. Date range filter (matches YYYY-MM-DD inside row)
    if (criteria.dateFrom || criteria.dateTo) {
      const dateMatch = fullRowText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
      if (!dateMatch) return false;
      const rowDate = dateMatch[1];
      if (criteria.dateFrom && rowDate < criteria.dateFrom) return false;
      if (criteria.dateTo && rowDate > criteria.dateTo) return false;
    }

    // 3. Numeric / Amount range filter
    const minVal = criteria.minAmount !== '' ? Number(criteria.minAmount) : null;
    const maxVal = criteria.maxAmount !== '' ? Number(criteria.maxAmount) : null;
    if ((minVal !== null && !Number.isNaN(minVal)) || (maxVal !== null && !Number.isNaN(maxVal))) {
      // Extract numeric values from cells (excluding dates like 2026-11-09 and codes like REQ-2026-1001)
      const cleanedForNumbers = fullRowText
        .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
        .replace(/[a-z]+-\d+(?:-\d+)?/gi, ' ')
        .replace(/,/g, '');
      const nums = (cleanedForNumbers.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);
      if (nums.length === 0) return false;

      const matchesAnyNumber = nums.some((n) => {
        if (minVal !== null && !Number.isNaN(minVal) && n < minVal) return false;
        if (maxVal !== null && !Number.isNaN(maxVal) && n > maxVal) return false;
        return true;
      });
      if (!matchesAnyNumber) return false;
    }

    return true;
  }

  /**
   * Injects the Universal In-Screen Advanced Search Bar into any screen viewport
   * that contains one or more data tables.
   */
  public mountInScreenAdvancedSearch(viewport: HTMLElement, route: RouteId): void {
    if (route === 'login' || route === '403') return;

    const attachBar = () => {
      const tables = Array.from(viewport.querySelectorAll<HTMLTableElement>('table'));
      if (tables.length === 0) return;

      // Avoid duplicate mount if already present
      if (viewport.querySelector('#universal-adv-search-box')) return;

      const primaryTable = tables[0];
      const headers = Array.from(primaryTable.querySelectorAll('thead th')).map((th) =>
        (th.textContent || '').trim()
      );

      const wrapper = document.createElement('div');
      wrapper.id = 'universal-adv-search-box';
      wrapper.className =
        'mb-4 rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50/70 via-white to-sky-50/40 p-3.5 shadow-2xs no-print';

      const renderBarHtml = () => `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <span class="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-white">
              🔍 ${i18n.bi('بحث متقدم ذكي', 'Advanced Search')}
            </span>
            <input
              id="u-adv-keyword"
              type="search"
              placeholder="${i18n.bi('ابحث بأي كلمة، كود، اسم، تاريخ، أو مبلغ داخل الجدول...', 'Instant multi-criteria search across this screen...')}"
              class="w-full sm:w-72 md:w-80 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-sky-600 focus:outline-none"
            />
            <select id="u-adv-col" class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
              <option value="-1">${i18n.bi('كل الأعمدة', 'All Columns')}</option>
              ${headers
                .map((h, idx) => (h ? `<option value="${idx}">${h}</option>` : ''))
                .join('')}
            </select>
            <button
              id="u-adv-toggle-btn"
              type="button"
              class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 cursor-pointer"
            >
              ⚙️ ${i18n.bi('فلاتر متقدمة (تاريخ / مبلغ / شرط)', 'More Filters (Date / Amount / Rule)')}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <span id="u-adv-count-badge" class="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-mono font-semibold text-slate-700"></span>
            <button
              id="u-adv-export-btn"
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="${i18n.bi('تصدير النتائج المفلترة CSV', 'Export filtered rows to CSV')}"
            >
              ⬇ CSV
            </button>
            <button
              id="u-adv-print-btn"
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="${i18n.bi('طباعة النتائج المفلترة A4', 'Print filtered rows A4')}"
            >
              🖨 A4
            </button>
            <button
              id="u-adv-reset-btn"
              type="button"
              class="rounded-lg bg-slate-200/80 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 cursor-pointer"
            >
              ${i18n.bi('إعادة ضبط', 'Reset')}
            </button>
          </div>
        </div>

        <div id="u-adv-drawer" class="${
          this.isPanelExpanded ? 'grid' : 'hidden'
        } grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 mt-3 pt-3 border-t border-sky-200/70 text-xs">
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">${i18n.bi('شرط المطابقة النصية', 'Match Rule')}</label>
            <select id="u-adv-operator" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
              <option value="contains">${i18n.bi('يحتوي على (Contains)', 'Contains')}</option>
              <option value="exact">${i18n.bi('يطابق تمامًا (Exact Match)', 'Exact Match')}</option>
              <option value="starts_with">${i18n.bi('يبدأ بـ (Starts With)', 'Starts With')}</option>
              <option value="not_contains">${i18n.bi('لا يحتوي على (Exclude)', 'Does Not Contain')}</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">${i18n.bi('من تاريخ (Date From)', 'Date From')}</label>
            <input id="u-adv-date-from" type="date" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">${i18n.bi('إلى تاريخ (Date To)', 'Date To')}</label>
            <input id="u-adv-date-to" type="date" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">${i18n.bi('الحد الأدنى للمبلغ / الرقم', 'Min Amount / Value')}</label>
            <input id="u-adv-min-amt" type="number" step="any" placeholder="0" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">${i18n.bi('الحد الأقصى للمبلغ / الرقم', 'Max Amount / Value')}</label>
            <input id="u-adv-max-amt" type="number" step="any" placeholder="999999" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
          </div>
        </div>
      `;

      wrapper.innerHTML = renderBarHtml();

      // Insert right before the first table's container or at the top of viewport
      const firstTableWrapper = primaryTable.closest('.overflow-x-auto') || primaryTable;
      firstTableWrapper.parentElement?.insertBefore(wrapper, firstTableWrapper);

      const getCriteria = (): AdvancedFilterCriteria => ({
        keyword: (wrapper.querySelector('#u-adv-keyword') as HTMLInputElement | null)?.value || '',
        columnIndex: Number(
          (wrapper.querySelector('#u-adv-col') as HTMLSelectElement | null)?.value ?? -1
        ),
        operator: ((wrapper.querySelector('#u-adv-operator') as HTMLSelectElement | null)?.value ||
          'contains') as MatchOperator,
        dateFrom:
          (wrapper.querySelector('#u-adv-date-from') as HTMLInputElement | null)?.value || '',
        dateTo: (wrapper.querySelector('#u-adv-date-to') as HTMLInputElement | null)?.value || '',
        minAmount:
          (wrapper.querySelector('#u-adv-min-amt') as HTMLInputElement | null)?.value || '',
        maxAmount:
          (wrapper.querySelector('#u-adv-max-amt') as HTMLInputElement | null)?.value || '',
      });

      const applyTableFilter = () => {
        const criteria = getCriteria();
        const allTables = Array.from(viewport.querySelectorAll<HTMLTableElement>('table'));
        let totalRows = 0;
        let visibleRows = 0;

        for (const tbl of allTables) {
          const rows = Array.from(tbl.querySelectorAll<HTMLTableRowElement>('tbody tr'));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td')).map((td) =>
              (td.textContent || '').trim()
            );
            if (cells.length <= 1) continue;
            totalRows++;
            const ok = this.matchesRow(cells, criteria);
            row.style.display = ok ? '' : 'none';
            if (ok) visibleRows++;
          }
        }

        const badge = wrapper.querySelector('#u-adv-count-badge');
        if (badge) {
          badge.textContent = `${visibleRows} / ${totalRows}`;
        }
      };

      applyTableFilter();

      wrapper.querySelector('#u-adv-toggle-btn')?.addEventListener('click', () => {
        this.isPanelExpanded = !this.isPanelExpanded;
        const drawer = wrapper.querySelector('#u-adv-drawer');
        if (drawer) {
          drawer.classList.toggle('hidden', !this.isPanelExpanded);
          drawer.classList.toggle('grid', this.isPanelExpanded);
        }
      });

      const inputs = wrapper.querySelectorAll('input, select');
      inputs.forEach((el) => {
        el.addEventListener('input', applyTableFilter);
        el.addEventListener('change', applyTableFilter);
      });

      wrapper.querySelector('#u-adv-reset-btn')?.addEventListener('click', () => {
        wrapper.querySelectorAll<HTMLInputElement>('input').forEach((inp) => {
          inp.value = '';
        });
        const colSel = wrapper.querySelector('#u-adv-col') as HTMLSelectElement | null;
        if (colSel) colSel.value = '-1';
        const opSel = wrapper.querySelector('#u-adv-operator') as HTMLSelectElement | null;
        if (opSel) opSel.value = 'contains';
        applyTableFilter();
      });

      wrapper.querySelector('#u-adv-export-btn')?.addEventListener('click', () => {
        const visibleTrs = Array.from(
          primaryTable.querySelectorAll<HTMLTableRowElement>('tbody tr')
        ).filter((tr) => tr.style.display !== 'none');
        const rowsData = visibleTrs.map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim())
        );
        exportToCsv(`${route}-advanced-search.csv`, headers, rowsData);
      });

      wrapper.querySelector('#u-adv-print-btn')?.addEventListener('click', () => {
        const visibleTrs = Array.from(
          primaryTable.querySelectorAll<HTMLTableRowElement>('tbody tr')
        ).filter((tr) => tr.style.display !== 'none');
        const rowsHtml = visibleTrs
          .map(
            (tr) =>
              `<tr>${Array.from(tr.querySelectorAll('td'))
                .slice(0, -1)
                .map((td) => `<td>${(td.textContent || '').trim()}</td>`)
                .join('')}</tr>`
          )
          .join('');
        const printHeaders = headers
          .slice(0, -1)
          .map((h) => `<th>${h}</th>`)
          .join('');
        printService.printA4(
          i18n.bi(`نتائج البحث المتقدم (${route})`, `Advanced Search Results (${route})`),
          `<table class="print-table"><thead><tr>${printHeaders}</tr></thead><tbody>${rowsHtml}</tbody></table>`
        );
      });
    };

    attachBar();

    // Observe sub-tab switches inside viewport so the advanced search bar re-attaches when a sub-tab redraws
    const observer = new MutationObserver(() => {
      if (!viewport.querySelector('#universal-adv-search-box')) {
        attachBar();
      }
    });
    observer.observe(viewport, { childList: true, subtree: false });
  }

  /**
   * Executes a Cross-System Global Search across all major database stores.
   */
  public async searchAllModules(
    query: string,
    moduleFilter = 'all',
    dateFrom = '',
    dateTo = ''
  ): Promise<GlobalSearchResultItem[]> {
    const q = query.trim().toLowerCase();
    const results: GlobalSearchResultItem[] = [];

    const [
      patients,
      requests,
      invoices,
      expenses,
      inventoryItems,
      inventoryLots,
      suppliers,
      doctors,
      journalEntries,
    ] = await Promise.all([
      db.patients.toArray(),
      db.requests.toArray(),
      db.invoices.toArray(),
      db.expenses.toArray(),
      db.inventoryItems.toArray(),
      db.inventoryLots.toArray(),
      db.suppliers.toArray(),
      db.doctors.toArray(),
      db.journalEntries.toArray(),
    ]);

    const matchDate = (d?: string) => {
      if (!dateFrom && !dateTo) return true;
      if (!d) return false;
      const day = d.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    };

    const matchText = (...fields: Array<string | number | undefined>) => {
      if (!q) return true;
      const combined = fields.map((f) => String(f ?? '').toLowerCase()).join(' ');
      return q.split(/\s+/).every((term) => combined.includes(term));
    };

    if (moduleFilter === 'all' || moduleFilter === 'patients') {
      for (const p of patients) {
        if (matchDate(p.createdAt) && matchText(p.code, p.name, p.phone, p.nationalId, p.address)) {
          results.push({
            moduleLabelAr: 'المرضى',
            moduleLabelEn: 'Patients',
            route: 'patients',
            code: p.code,
            title: p.name,
            subtitle: `هاتف: ${p.phone} | الرقم القومي: ${p.nationalId}`,
            date: p.createdAt,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'requests') {
      for (const r of requests) {
        if (matchDate(r.createdAt) && matchText(r.requestNumber, r.barcode, r.status, r.notes)) {
          results.push({
            moduleLabelAr: 'طلبات التحاليل',
            moduleLabelEn: 'Lab Requests',
            route: 'requests',
            code: r.requestNumber,
            title: `باركود: ${r.barcode} (${r.status})`,
            subtitle: r.notes,
            date: r.createdAt,
            amount: r.netTotal,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'invoices') {
      for (const inv of invoices) {
        if (matchDate(inv.date) && matchText(inv.invoiceNumber, inv.status, inv.paymentMethod)) {
          results.push({
            moduleLabelAr: 'الفواتير',
            moduleLabelEn: 'Invoices',
            route: 'invoices',
            code: inv.invoiceNumber,
            title: `فاتورة تحاليل (${inv.status})`,
            subtitle: `المدفوع: ${inv.paidAmount} | المتبقي: ${inv.remainingAmount} EGP`,
            date: inv.date,
            amount: inv.netTotal,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'expenses') {
      for (const ex of expenses) {
        if (matchDate(ex.date) && matchText(ex.expenseNumber, ex.category, ex.description)) {
          results.push({
            moduleLabelAr: 'المصروفات',
            moduleLabelEn: 'Expenses',
            route: 'expenses',
            code: ex.expenseNumber,
            title: ex.category,
            subtitle: ex.description,
            date: ex.date,
            amount: ex.amount,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'inventory') {
      for (const itm of inventoryItems) {
        if (matchText(itm.code, itm.barcode, itm.nameAr, itm.nameEn, itm.subCategory)) {
          results.push({
            moduleLabelAr: 'المخزون والكواشف',
            moduleLabelEn: 'Inventory',
            route: 'inventory',
            code: itm.code,
            title: `${itm.nameAr} (${itm.nameEn})`,
            subtitle: `الرصيد: ${itm.currentStock} ${itm.unit} | باركود: ${itm.barcode}`,
            amount: Math.round(itm.currentStock * itm.unitCost),
          });
        }
      }
      for (const lot of inventoryLots) {
        if (matchDate(lot.expiryDate) && matchText(lot.lotNumber, lot.itemNameAr, lot.itemCode)) {
          results.push({
            moduleLabelAr: 'دفعات المخزون (Lots)',
            moduleLabelEn: 'Inventory Lots',
            route: 'inventory',
            code: lot.lotNumber,
            title: lot.itemNameAr,
            subtitle: `انتهاء الصلاحية: ${lot.expiryDate} | المتبقي: ${lot.remainingQty}`,
            date: lot.expiryDate,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'suppliers') {
      for (const sup of suppliers) {
        if (matchText(sup.code, sup.nameAr, sup.nameEn, sup.phone, sup.taxNumber)) {
          results.push({
            moduleLabelAr: 'الموردون',
            moduleLabelEn: 'Suppliers',
            route: 'purchases',
            code: sup.code,
            title: sup.nameAr,
            subtitle: `هاتف: ${sup.phone} | ضريبي: ${sup.taxNumber}`,
            amount: sup.currentBalance,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'doctors') {
      for (const doc of doctors) {
        if (matchText(doc.code, doc.nameAr, doc.nameEn, doc.specialty, doc.phone)) {
          results.push({
            moduleLabelAr: 'الأطباء المحولون',
            moduleLabelEn: 'Doctors',
            route: 'doctors',
            code: doc.code,
            title: doc.nameAr,
            subtitle: `${doc.specialty} | عمولة: ${doc.commissionRate}%`,
          });
        }
      }
    }

    if (moduleFilter === 'all' || moduleFilter === 'journal') {
      for (const je of journalEntries) {
        if (matchDate(je.date) && matchText(je.entryNumber, je.descriptionAr, je.descriptionEn)) {
          results.push({
            moduleLabelAr: 'القيود المحاسبية',
            moduleLabelEn: 'Journal Entries',
            route: 'erpAccounting',
            code: je.entryNumber,
            title: je.descriptionAr,
            subtitle: je.descriptionEn,
            date: je.date,
            amount: je.totalDebit,
          });
        }
      }
    }

    return results.slice(0, 60);
  }

  /**
   * Opens the Global Cross-System Advanced Search Modal (accessible from header or Ctrl+K).
   */
  public openGlobalSearchModal(): void {
    openCustomModal(
      i18n.bi(
        '🔍 محرك البحث المتقدم الشامل عبر جميع شاشات النظام (Omni Advanced Search)',
        '🔍 Omni Cross-System Advanced Search'
      ),
      `
        <div class="space-y-4 text-xs">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <div class="md:col-span-2">
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('كلمات البحث (الاسم، الكود، الباركود، الهاتف، الدفعة...)', 'Search Keywords')}</label>
              <input
                id="global-adv-query"
                type="search"
                placeholder="${i18n.bi('اكتب للبحث الفوري في كل شاشات النظام...', 'Type to search across all modules...')}"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('القسم / الشاشة', 'Module')}</label>
              <select id="global-adv-module" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
                <option value="all">${i18n.bi('جميع الشاشات والأقسام', 'All Modules')}</option>
                <option value="patients">${i18n.bi('المرضى', 'Patients')}</option>
                <option value="requests">${i18n.bi('طلبات التحاليل والباركود', 'Lab Requests')}</option>
                <option value="invoices">${i18n.bi('الفواتير', 'Invoices')}</option>
                <option value="expenses">${i18n.bi('المصروفات', 'Expenses')}</option>
                <option value="inventory">${i18n.bi('المخازن والكواشف والدفعات', 'Inventory & Lots')}</option>
                <option value="suppliers">${i18n.bi('الموردون والمشتريات', 'Suppliers')}</option>
                <option value="doctors">${i18n.bi('الأطباء المحولون', 'Doctors')}</option>
                <option value="journal">${i18n.bi('القيود المحاسبية', 'Journal Entries')}</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('التاريخ (اختياري)', 'Date Filter')}</label>
              <input id="global-adv-date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono" />
            </div>
          </div>

          <div id="global-adv-results" class="max-h-96 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 p-2"></div>
        </div>
      `,
      (close) => {
        const qInput = document.getElementById('global-adv-query') as HTMLInputElement | null;
        const modSel = document.getElementById('global-adv-module') as HTMLSelectElement | null;
        const dateInp = document.getElementById('global-adv-date') as HTMLInputElement | null;
        const resBox = document.getElementById('global-adv-results');

        const runSearch = async () => {
          if (!resBox) return;
          const items = await this.searchAllModules(
            qInput?.value || '',
            modSel?.value || 'all',
            dateInp?.value || '',
            dateInp?.value || ''
          );

          if (items.length === 0) {
            resBox.innerHTML = `<div class="p-6 text-center text-slate-400">${i18n.bi('لا توجد نتائج مطابقة للبحث الحالي', 'No matching records found')}</div>`;
            return;
          }

          resBox.innerHTML = items
            .map(
              (item) => `
              <div class="flex items-center justify-between gap-3 p-2.5 bg-white hover:bg-sky-50/60 rounded-lg transition-colors">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">${i18n.bi(item.moduleLabelAr, item.moduleLabelEn)}</span>
                    <span class="font-mono font-bold text-slate-900">${item.code}</span>
                    <span class="font-bold text-slate-800">${item.title}</span>
                  </div>
                  <div class="text-[11px] text-slate-500 mt-0.5">${item.subtitle}</div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  ${
                    item.amount !== undefined
                      ? `<span class="font-mono font-bold text-emerald-700">${item.amount.toLocaleString()} EGP</span>`
                      : ''
                  }
                  <button
                    type="button"
                    data-goto-route="${item.route}"
                    class="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500 cursor-pointer"
                  >
                    ${i18n.bi('فتح الشاشة ←', 'Open Screen →')}
                  </button>
                </div>
              </div>
            `
            )
            .join('');

          resBox.querySelectorAll<HTMLButtonElement>('[data-goto-route]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const targetRoute = btn.dataset.gotoRoute as RouteId;
              close();
              router.navigate(targetRoute);
            });
          });
        };

        qInput?.focus();
        runSearch();
        qInput?.addEventListener('input', runSearch);
        modSel?.addEventListener('change', runSearch);
        dateInp?.addEventListener('change', runSearch);
      }
    );
  }
}

export const advancedSearchService = new AdvancedSearchService();
