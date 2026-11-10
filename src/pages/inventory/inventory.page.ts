import { authService } from '../../auth/auth.service';
import {
  closeModal,
  createPaginationControls,
  emptyState,
  exportToCsv,
  formatCurrency,
  openModal,
  pageHeader,
  paginateArray,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { i18n } from '../../i18n';
import { inventoryService } from '../../services/inventory.service';
import { printService } from '../../print/print.service';
import type { InventoryCategory } from '../../types';

type InventoryTab =
  | 'catalog'
  | 'lots'
  | 'movements'
  | 'receipt'
  | 'bom'
  | 'stockTaking'
  | 'alerts'
  | 'reports';

export async function renderInventoryPage(container: HTMLElement): Promise<void> {
  let activeTab: InventoryTab = 'catalog';
  let searchQuery = '';
  let categoryFilter = 'all';
  let movementTypeFilter = 'all';
  let currentPage = 1;
  const itemsPerPage = 15;

  async function draw(): Promise<void> {
    const user = authService.getCurrentUser()!;
    const [items, lots, movements, boms, sessions, suppliers, alerts] = await Promise.all([
      db.inventoryItems.toArray(),
      db.inventoryLots.toArray(),
      db.stockMovements.toArray(),
      db.testBOMs.toArray(),
      db.stockTakingSessions.toArray(),
      db.suppliers.toArray(),
      inventoryService.getInventoryAlertsSummary(),
    ]);

    const totalStockValue = items.reduce(
      (sum, itm) => sum + Math.round(itm.currentStock * itm.unitCost),
      0
    );

    const tabs: Array<{ id: InventoryTab; labelAr: string; labelEn: string; badge?: number }> = [
      { id: 'catalog', labelAr: 'كتالوج الأصناف', labelEn: 'Items Catalog', badge: items.length },
      { id: 'lots', labelAr: 'الدفعات والصلاحية (FEFO)', labelEn: 'Lots & Expiry', badge: lots.length },
      { id: 'movements', labelAr: 'حركات المخزون (8 أنواع)', labelEn: 'Stock Movements', badge: movements.length },
      { id: 'receipt', labelAr: 'إذن استلام وتوريد', labelEn: 'Goods Receipt' },
      { id: 'bom', labelAr: 'قوائم المواد والصرف للتحاليل (BOM)', labelEn: 'Test BOM & Issue', badge: boms.length },
      { id: 'stockTaking', labelAr: 'الجرد الفعلي والتسويات', labelEn: 'Stock Taking', badge: sessions.length },
      {
        id: 'alerts',
        labelAr: 'لوحة التنبيهات الحرجة',
        labelEn: 'Alerts Center',
        badge:
          alerts.expiredLots.length +
          alerts.expiring30Days.length +
          alerts.belowMinStock.length,
      },
      { id: 'reports', labelAr: 'تقارير وتقييم المخزون', labelEn: 'Valuation & Reports' },
    ];

    container.innerHTML = `
      ${pageHeader(
        i18n.bi('إدارة مخازن المختبر والكواشف الطبية (ERP Inventory)', 'Medical Lab Inventory & Reagent Management'),
        i18n.bi(
          'تتبع الدفعات وتواريخ الصلاحية (FEFO/FIFO)، الصرف الآلي للتحاليل عبر قوائم المواد (BOM)، والربط المحاسبي المباشر',
          'Batch/Lot expiry tracking (FEFO/FIFO), automated BOM test consumption, and real-time accounting entries'
        ),
        `
          <button id="btn-add-inv-item" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer">
            + ${i18n.bi('إضافة صنف مخزني', 'Add Inventory Item')}
          </button>
          <button id="btn-print-inv-report" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
            ${i18n.bi('طباعة تقرير المخزون A4', 'Print Inventory A4')}
          </button>
          <button id="btn-export-inv-csv" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer">
            CSV
          </button>
        `
      )}

      <!-- KPI Summary Strip -->
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">${i18n.bi('إجمالي الأصناف النشطة', 'Active Items')}</div>
          <div class="text-xl font-bold text-slate-900 mt-1">${items.length}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${lots.length} ${i18n.bi('دفعة مسجلة', 'Tracked Lots')}</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3.5">
          <div class="text-xs text-slate-500">${i18n.bi('إجمالي قيمة المخزون الدفترية', 'Total Stock Valuation')}</div>
          <div class="text-xl font-bold text-sky-700 mt-1">${formatCurrency(totalStockValue)}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">FIFO / Weighted Avg</div>
        </div>
        <div class="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
          <div class="text-xs text-rose-700 font-semibold">🔴 ${i18n.bi('دفعات منتهية الصلاحية', 'Expired Lots')}</div>
          <div class="text-xl font-bold text-rose-700 mt-1">${alerts.expiredLots.length}</div>
          <div class="text-[11px] text-rose-600 mt-0.5">${i18n.bi('محظور صرفها للتحاليل آليًا', 'Auto-blocked from issue')}</div>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
          <div class="text-xs text-amber-800 font-semibold">🟠 ${i18n.bi('تنتهي خلال 30 يومًا', 'Expiring <= 30 Days')}</div>
          <div class="text-xl font-bold text-amber-700 mt-1">${alerts.expiring30Days.length}</div>
          <div class="text-[11px] text-amber-700 mt-0.5">🟡 ${alerts.expiring90Days.length} ${i18n.bi('خلال 90 يومًا', '<= 90 Days')}</div>
        </div>
        <div class="rounded-xl border border-rose-200 bg-white p-3.5">
          <div class="text-xs text-slate-600 font-semibold">⚠️ ${i18n.bi('أصناف دون الحد الأدنى', 'Below Min Stock')}</div>
          <div class="text-xl font-bold text-rose-600 mt-1">${alerts.belowMinStock.length}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${alerts.atReorderPoint.length} ${i18n.bi('عند نقطة إعادة الطلب', 'at Reorder Point')}</div>
        </div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
          <div class="text-xs text-emerald-800 font-semibold">${i18n.bi('قوائم مواد التحاليل (BOM)', 'Active Test BOMs')}</div>
          <div class="text-xl font-bold text-emerald-700 mt-1">${boms.length}</div>
          <div class="text-[11px] text-emerald-700 mt-0.5">${movements.length} ${i18n.bi('حركة مخزنية موثقة', 'Stock Movements')}</div>
        </div>
      </div>

      <!-- Navigation Sub-Tabs -->
      <div class="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 mb-5">
        ${tabs
          .map(
            (t) => `
            <button
              type="button"
              data-inv-tab="${t.id}"
              class="px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === t.id
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }"
            >
              <span>${i18n.bi(t.labelAr, t.labelEn)}</span>
              ${
                t.badge !== undefined
                  ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                    }">${t.badge}</span>`
                  : ''
              }
            </button>
          `
          )
          .join('')}
      </div>

      <!-- Active Tab Content -->
      <div id="inventory-tab-body"></div>
    `;

    const tabBody = document.getElementById('inventory-tab-body')!;

    // Render active tab
    if (activeTab === 'catalog') {
      const filtered = items.filter((itm) => {
        const matchesCat = categoryFilter === 'all' || itm.category === categoryFilter;
        const q = searchQuery.trim().toLowerCase();
        const matchesQ =
          !q ||
          itm.code.toLowerCase().includes(q) ||
          itm.nameAr.toLowerCase().includes(q) ||
          itm.nameEn.toLowerCase().includes(q) ||
          itm.barcode.includes(q);
        return matchesCat && matchesQ;
      });

      const paged = paginateArray(filtered, currentPage, itemsPerPage);
      const supMap = new Map(suppliers.map((s) => [s.id, s.nameAr]));

      tabBody.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <input
              id="inv-search-input"
              type="search"
              value="${searchQuery}"
              placeholder="${i18n.bi('ابحث بالكود، الاسم العربي/الإنجليزي، أو الباركود...', 'Search by code, name, or barcode...')}"
              class="w-full md:w-80 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select id="inv-cat-filter" class="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white">
              <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>${i18n.bi('جميع الفئات (50 صنف)', 'All Categories')}</option>
              <option value="chemical" ${categoryFilter === 'chemical' ? 'selected' : ''}>🧪 ${i18n.bi('الكواشف والمحاليل الكيميائية', 'Chemical Reagents')}</option>
              <option value="consumable" ${categoryFilter === 'consumable' ? 'selected' : ''}>💉 ${i18n.bi('المستهلكات والأنابيب الطبية', 'Consumables & Tubes')}</option>
              <option value="equipment" ${categoryFilter === 'equipment' ? 'selected' : ''}>🔬 ${i18n.bi('الأجهزة وقطع الغيار', 'Equipment & Parts')}</option>
              <option value="packaging" ${categoryFilter === 'packaging' ? 'selected' : ''}>📦 ${i18n.bi('مواد التعبئة والباركود', 'Packaging & Labels')}</option>
            </select>
          </div>
          <div class="text-xs text-slate-500">
            ${i18n.bi(`إجمالي السجلات المطابقة: ${filtered.length}`, `Matching items: ${filtered.length}`)}
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2.5 text-start">${i18n.bi('الكود / الباركود', 'Code / Barcode')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('اسم الصنف', 'Item Name')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('الفئة والتخزين', 'Category & Temp')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('الرصيد الحالي / المتاح', 'Current / Available')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('الحد الأدنى / إعادة الطلب', 'Min / Reorder')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('تكلفة الوحدة والقيمة', 'Unit Cost & Total')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('المورد الرئيسي', 'Supplier')}</th>
                <th class="px-3 py-2.5 text-start">${i18n.bi('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${
                paged.length === 0
                  ? `<tr><td colspan="8" class="p-6">${emptyState('لا توجد أصناف مطابقة للبحث')}</td></tr>`
                  : paged
                      .map((itm) => {
                        const isLow = itm.currentStock <= itm.minStock;
                        const isReorder = !isLow && itm.currentStock <= itm.reorderPoint;
                        const stockBadge = isLow
                          ? `<span class="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-semibold">🔴 دون الحد الأدنى (${itm.currentStock} ${itm.unit})</span>`
                          : isReorder
                          ? `<span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">🟠 نقطة إعادة الطلب (${itm.currentStock} ${itm.unit})</span>`
                          : `<span class="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">🟢 متوفر (${itm.currentStock} ${itm.unit})</span>`;

                        return `
                          <tr class="hover:bg-slate-50">
                            <td class="px-3 py-2.5 font-mono font-semibold text-slate-800">
                              <div>${itm.code}</div>
                              <div class="text-[10px] text-slate-400">${itm.barcode}</div>
                            </td>
                            <td class="px-3 py-2.5">
                              <div class="font-semibold text-slate-900">${itm.nameAr}</div>
                              <div class="text-[11px] text-slate-500">${itm.nameEn}</div>
                            </td>
                            <td class="px-3 py-2.5">
                              <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">${itm.subCategory}</span>
                              <div class="text-[11px] text-sky-700 font-medium mt-0.5">🌡️ ${itm.storageTemp}</div>
                            </td>
                            <td class="px-3 py-2.5">
                              ${stockBadge}
                              <div class="text-[11px] text-slate-500 mt-0.5">متاح: ${itm.availableStock} | محجوز: ${itm.reservedStock}</div>
                            </td>
                            <td class="px-3 py-2.5 text-slate-600">
                              <div>أدنى: <strong>${itm.minStock}</strong></div>
                              <div>طلب: <strong>${itm.reorderPoint}</strong></div>
                            </td>
                            <td class="px-3 py-2.5">
                              <div class="font-semibold text-slate-900">${formatCurrency(itm.unitCost)} <span class="text-[10px] text-slate-500">(${itm.costMethod})</span></div>
                              <div class="text-[11px] text-emerald-700 font-medium">${formatCurrency(itm.currentStock * itm.unitCost)}</div>
                            </td>
                            <td class="px-3 py-2.5 text-slate-700">${supMap.get(itm.supplierId) ?? '-'}</td>
                            <td class="px-3 py-2.5">
                              <button
                                type="button"
                                data-print-item-barcode="${itm.id}"
                                class="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                باركود
                              </button>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
        <div id="inv-pagination-slot" class="mt-3">
          ${createPaginationControls(
            { currentPage, itemsPerPage, totalItems: filtered.length },
            () => {}
          )}
        </div>
      `;
    } else if (activeTab === 'lots') {
      const sortedLots = [...lots].sort((a, b) =>
        (a.effectiveExpiryDate || a.expiryDate).localeCompare(
          b.effectiveExpiryDate || b.expiryDate
        )
      );

      tabBody.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">تتبع الدفعات وتواريخ الصلاحية (Lot / Batch Tracking - FEFO)</h3>
              <p class="text-xs text-slate-500 mt-0.5">يتم الصرف تلقائيًا من الدفعة الأقرب انتهاءً للصلاحية (FEFO) مع حظر الدفعات المنتهية 🔴 وحساب الصلاحية بعد الفتح</p>
            </div>
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 font-semibold">🔴 منتهي: ${alerts.expiredLots.length}</span>
              <span class="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 font-semibold">🟠 <=30 يوم: ${alerts.expiring30Days.length}</span>
              <span class="px-2.5 py-1 rounded-md bg-yellow-100 text-yellow-800 font-semibold">🟡 <=90 يوم: ${alerts.expiring90Days.length}</span>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2.5 text-start">رقم الدفعة (Lot #)</th>
                <th class="px-3 py-2.5 text-start">الصنف</th>
                <th class="px-3 py-2.5 text-start">تاريخ الإنتاج / الانتهاء</th>
                <th class="px-3 py-2.5 text-start">تاريخ الفتح / الصلاحية الفعلية</th>
                <th class="px-3 py-2.5 text-start">مؤشر الصلاحية</th>
                <th class="px-3 py-2.5 text-start">الكمية المتبقية / الأصلية</th>
                <th class="px-3 py-2.5 text-start">فحص الجودة QC</th>
                <th class="px-3 py-2.5 text-start">إجراءات الدفعة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${sortedLots
                .slice(0, 45)
                .map((lot) => {
                  const ev = inventoryService.evaluateLotExpiry(lot);
                  const badgeClass =
                    ev.badgeColor === 'rose'
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : ev.badgeColor === 'amber'
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : ev.badgeColor === 'yellow'
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300';

                  return `
                    <tr class="hover:bg-slate-50 ${lot.status === 'disposed' ? 'opacity-50' : ''}">
                      <td class="px-3 py-2.5 font-mono font-bold text-slate-800">${lot.lotNumber}</td>
                      <td class="px-3 py-2.5">
                        <div class="font-semibold text-slate-900">${lot.itemNameAr}</div>
                        <div class="text-[11px] text-slate-500">${lot.itemCode} · ${lot.storageLocation}</div>
                      </td>
                      <td class="px-3 py-2.5 font-mono">
                        <div>إنتاج: ${lot.productionDate}</div>
                        <div class="font-semibold">انتهاء: ${lot.expiryDate}</div>
                      </td>
                      <td class="px-3 py-2.5 font-mono">
                        <div>فتح: ${lot.openedDate ?? 'لم تُفتح بعد'}</div>
                        <div class="text-sky-700 font-semibold">فعلي: ${ev.effectiveExpiryDate}</div>
                      </td>
                      <td class="px-3 py-2.5">
                        <span class="px-2 py-1 rounded-md border font-semibold ${badgeClass}">
                          ${ev.icon} ${ev.labelAr}
                        </span>
                      </td>
                      <td class="px-3 py-2.5">
                        <div class="font-bold text-slate-900">${lot.remainingQty} <span class="text-slate-400 font-normal">/ ${lot.initialQty}</span></div>
                        <div class="text-[11px] text-slate-500">التكلفة: ${formatCurrency(lot.remainingQty * lot.unitCost)}</div>
                      </td>
                      <td class="px-3 py-2.5">
                        <span class="px-2 py-0.5 rounded-md ${
                          lot.qcStatus === 'passed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        } font-semibold">${lot.qcStatus.toUpperCase()}</span>
                      </td>
                      <td class="px-3 py-2.5">
                        <div class="flex flex-wrap gap-1">
                          ${
                            !lot.openedDate && lot.remainingQty > 0 && lot.status !== 'disposed'
                              ? `<button type="button" data-open-lot="${lot.id}" class="rounded-md bg-sky-50 border border-sky-200 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 cursor-pointer">تسجيل فتح عبوة</button>`
                              : ''
                          }
                          ${
                            lot.remainingQty > 0 && lot.status !== 'disposed'
                              ? `<button type="button" data-dispose-lot="${lot.id}" class="rounded-md bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer">إتلاف رسمي</button>`
                              : `<span class="text-[11px] text-slate-400">${lot.status}</span>`
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
      `;
    } else if (activeTab === 'movements') {
      const filteredMovs = movements.filter(
        (m) => movementTypeFilter === 'all' || m.type === movementTypeFilter
      );
      const movTypeLabels: Record<string, string> = {
        goods_receipt: '📥 استلام بضاعة (Goods Receipt)',
        issue_to_test: '🧪 صرف لتحليل (Issue to Test)',
        internal_transfer: '🔄 صرف داخلي لقسم (Internal Issue)',
        return_from_dept: '↩️ إرجاع للمخزن (Return)',
        disposal: '🗑️ إتلاف منتهي/تالف (Disposal)',
        adjustment: '⚖️ تسوية جرد (Adjustment)',
        transfer: '🚚 تحويل بين مخازن (Transfer)',
        reservation: '🔒 حجز كمية (Reservation)',
      };

      tabBody.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold text-slate-700">تصفية حسب نوع الحركة:</label>
            <select id="mov-type-filter" class="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white">
              <option value="all" ${movementTypeFilter === 'all' ? 'selected' : ''}>جميع أنواع الحركات (${movements.length})</option>
              ${Object.entries(movTypeLabels)
                .map(
                  ([k, label]) =>
                    `<option value="${k}" ${movementTypeFilter === k ? 'selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="text-xs text-slate-500">إجمالي الحركات المعروضة: <strong>${filteredMovs.length}</strong></div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th class="px-3 py-2.5 text-start">رقم الحركة / التاريخ</th>
                <th class="px-3 py-2.5 text-start">نوع الحركة</th>
                <th class="px-3 py-2.5 text-start">الصنف والدفعة</th>
                <th class="px-3 py-2.5 text-start">الكمية</th>
                <th class="px-3 py-2.5 text-start">الرصيد قبل ← بعد</th>
                <th class="px-3 py-2.5 text-start">إجمالي التكلفة</th>
                <th class="px-3 py-2.5 text-start">المرجع والمسؤول</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filteredMovs
                .slice(0, 50)
                .map(
                  (m) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-mono">
                      <div class="font-semibold text-slate-800">${m.movementNumber}</div>
                      <div class="text-[11px] text-slate-500">${m.date}</div>
                    </td>
                    <td class="px-3 py-2.5 font-semibold text-slate-800">${movTypeLabels[m.type] ?? m.type}</td>
                    <td class="px-3 py-2.5">
                      <div class="font-semibold text-slate-900">${m.itemNameAr}</div>
                      <div class="text-[11px] font-mono text-sky-700">Lot: ${m.lotNumber ?? '-'}</div>
                    </td>
                    <td class="px-3 py-2.5 font-bold">${m.quantity}</td>
                    <td class="px-3 py-2.5 font-mono text-slate-600">${m.previousBalance} ← <strong>${m.newBalance}</strong></td>
                    <td class="px-3 py-2.5 font-semibold text-emerald-700">${formatCurrency(m.totalCost)}</td>
                    <td class="px-3 py-2.5">
                      <div class="text-slate-800">${m.referenceType}: <strong>${m.referenceId}</strong></div>
                      <div class="text-[11px] text-slate-500">${m.notes}</div>
                    </td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'receipt') {
      const pendingPurchases = await db.purchaseInvoices
        .filter((p) => !p.stockReceived)
        .toArray();

      tabBody.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <!-- Pending Purchase Invoices Ready for Warehouse Receipt -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-1">1) فواتير مشتريات بانتظار الاستلام المخزني وفحص الجودة</h3>
            <p class="text-xs text-slate-500 mb-4">عند الضغط على "استلام المخزون الآن" يتم إنشاء الدفعات (Lots) وتحديث أرصدة الأصناف وتوليد القيد المحاسبي آليًا.</p>
            ${
              pendingPurchases.length === 0
                ? emptyState('تم استلام جميع فواتير المشتريات المسجلة بنجاح')
                : `<div class="space-y-3">
                    ${pendingPurchases
                      .map(
                        (p) => `
                        <div class="rounded-lg border border-sky-200 bg-sky-50/40 p-3.5 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div class="text-xs font-bold text-slate-900">${p.invoiceNumber} — ${p.supplierName}</div>
                            <div class="text-[11px] text-slate-600 mt-0.5">التاريخ: ${p.date} | الأصناف: ${p.items.length} | الإجمالي: <strong>${p.netTotal} ${p.currency}</strong></div>
                            <div class="text-[11px] text-sky-700 mt-1">${p.items.map((i) => `${i.itemNameAr} (${i.quantity} - Lot: ${i.lotNumber})`).join(' + ')}</div>
                          </div>
                          <button
                            type="button"
                            data-receive-pinv="${p.id}"
                            class="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                          >
                            📥 استلام المخزون وتوليد القيد
                          </button>
                        </div>
                      `
                      )
                      .join('')}
                  </div>`
            }
          </div>

          <!-- Direct Quick Lot Receipt Form -->
          <div class="rounded-xl border border-slate-200 bg-white p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-1">2) إضافة وإذن استلام دفعة مخزنية مباشرة (Goods Receipt)</h3>
            <p class="text-xs text-slate-500 mb-4">يرفض النظام تلقائيًا استلام أي دفعة منتهية الصلاحية وينشئ قيد التوريد المحاسبي فور الحفظ.</p>
            <form id="direct-lot-receipt-form" class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div class="md:col-span-2">
                <label class="block font-semibold text-slate-700 mb-1">الصنف المستلم</label>
                <select name="itemId" required class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                  ${items
                    .map(
                      (itm) =>
                        `<option value="${itm.id}">${itm.code} - ${itm.nameAr} (الرصيد: ${itm.currentStock} ${itm.unit})</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">رقم الدفعة / التشغيلة (Lot Number)</label>
                <input name="lotNumber" required value="LOT-2026-${Math.floor(100 + Math.random() * 899)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">الكمية المستلمة</label>
                <input name="quantity" type="number" min="1" value="200" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">تاريخ الإنتاج</label>
                <input name="productionDate" type="date" value="2026-08-01" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label class="block font-semibold text-slate-700 mb-1">تاريخ انتهاء الصلاحية</label>
                <input name="expiryDate" type="date" value="2027-09-30" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div class="md:col-span-2 pt-2">
                <button type="submit" class="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
                  تسجيل إذن الاستلام وإضافة الدفعة للمخزن
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
    } else if (activeTab === 'bom') {
      tabBody.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-slate-900">قوائم المواد للتحاليل الطبية (Bill of Materials - BOM) والصرف الآلي بنظام FEFO</h3>
            <p class="text-xs text-slate-500 mt-0.5">يحدد كل تحليل الكواشف والأنابيب والمستهلكات المطلوبة ونسبة الهدر المسموحة، وعند التشغيل يخصم النظام من أقدم دفعة صالحة ويولّد قيد التكلفة (COGS).</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${boms
            .map(
              (bom) => `
              <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
                    <div>
                      <span class="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-xs font-bold">${bom.testCode}</span>
                      <span class="font-bold text-sm text-slate-900 ms-1.5">${bom.testNameAr}</span>
                    </div>
                    <div class="text-xs font-bold text-emerald-700">
                      تكلفة المواد: ${formatCurrency(bom.directMaterialCost)}
                    </div>
                  </div>
                  <table class="w-full text-[11px] mb-3">
                    <thead class="text-slate-500 border-b border-slate-100">
                      <tr>
                        <th class="py-1 text-start">المادة / الكاشف</th>
                        <th class="py-1 text-start">الكمية</th>
                        <th class="py-1 text-start">الهدر %</th>
                        <th class="py-1 text-start">التكلفة</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                      ${bom.items
                        .map(
                          (line) => `
                          <tr>
                            <td class="py-1 font-medium text-slate-800">${line.itemNameAr}</td>
                            <td class="py-1 font-mono">${line.quantity} ${line.unit}</td>
                            <td class="py-1 text-slate-500">${line.wastePercent}%</td>
                            <td class="py-1 font-semibold">${formatCurrency(line.quantity * (1 + line.wastePercent / 100) * line.unitCost)}</td>
                          </tr>
                        `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span class="text-[11px] text-slate-500">التكلفة الكلية التقديرية (مواد + عمالة + تشغيل): <strong>${formatCurrency(bom.directMaterialCost + bom.laborCostEstimate + bom.overheadCostEstimate)}</strong></span>
                  <button
                    type="button"
                    data-issue-bom-test="${bom.testId}"
                    class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
                  >
                    🧪 صرف كواشف التحليل الآن (FEFO)
                  </button>
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      `;
    } else if (activeTab === 'stockTaking') {
      tabBody.innerHTML = `
        <div class="space-y-4">
          ${sessions
            .map(
              (s) => `
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-bold text-slate-900">${s.sessionNumber} — ${s.warehouseName}</h3>
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        s.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }">${s.status === 'approved' ? 'معتمد ومسوّى ✅' : 'مسودة جاهزة للاعتماد ⏳'}</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">التاريخ: ${s.date} | صافي قيمة الفروق: <strong>${formatCurrency(s.totalVarianceValue)}</strong> | ${s.notes}</p>
                  </div>
                  ${
                    s.status !== 'approved'
                      ? `<button type="button" data-approve-st="${s.id}" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer">
                          اعتماد الجرد وتوليد قيود التسوية الآن
                        </button>`
                      : ''
                  }
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs text-start border border-slate-200 rounded-lg">
                    <thead class="bg-slate-50 text-slate-600">
                      <tr>
                        <th class="px-3 py-2 text-start">الكود</th>
                        <th class="px-3 py-2 text-start">الصنف</th>
                        <th class="px-3 py-2 text-start">الرصيد الدفتري</th>
                        <th class="px-3 py-2 text-start">الرصيد الفعلي</th>
                        <th class="px-3 py-2 text-start">الفرق (كمية)</th>
                        <th class="px-3 py-2 text-start">قيمة الفرق</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      ${s.lines
                        .map(
                          (l) => `
                          <tr>
                            <td class="px-3 py-2 font-mono">${l.itemCode}</td>
                            <td class="px-3 py-2 font-semibold">${l.itemNameAr}</td>
                            <td class="px-3 py-2 font-mono">${l.bookQty}</td>
                            <td class="px-3 py-2 font-mono font-bold">${l.actualQty}</td>
                            <td class="px-3 py-2 font-mono font-bold ${
                              l.varianceQty < 0
                                ? 'text-rose-600'
                                : l.varianceQty > 0
                                ? 'text-emerald-600'
                                : 'text-slate-500'
                            }">${l.varianceQty > 0 ? `+${l.varianceQty}` : l.varianceQty}</td>
                            <td class="px-3 py-2 font-semibold">${formatCurrency(l.varianceValue)}</td>
                          </tr>
                        `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      `;
    } else if (activeTab === 'alerts') {
      tabBody.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="rounded-xl border border-rose-200 bg-white p-4">
            <h3 class="text-sm font-bold text-rose-700 mb-3">🔴 دفعات منتهية الصلاحية يجب إتلافها (${alerts.expiredLots.length})</h3>
            <div class="space-y-2">
              ${alerts.expiredLots
                .map(
                  (l) => `
                  <div class="rounded-lg border border-rose-200 bg-rose-50/50 p-3 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <div class="font-bold text-slate-900">${l.itemNameAr} (${l.lotNumber})</div>
                      <div class="text-rose-700">تاريخ الانتهاء: ${l.expiryDate} | المتبقي: ${l.remainingQty}</div>
                    </div>
                    <button type="button" data-dispose-lot="${l.id}" class="rounded-md bg-rose-600 px-2.5 py-1.5 text-white font-semibold hover:bg-rose-500 cursor-pointer">
                      إتلاف الآن
                    </button>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>

          <div class="rounded-xl border border-amber-200 bg-white p-4">
            <h3 class="text-sm font-bold text-amber-800 mb-3">⚠️ أصناف وصلت للحد الأدنى أو نقطة إعادة الطلب (${alerts.belowMinStock.length + alerts.atReorderPoint.length})</h3>
            <div class="space-y-2">
              ${[...alerts.belowMinStock, ...alerts.atReorderPoint]
                .map(
                  (itm) => `
                  <div class="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <div class="font-bold text-slate-900">${itm.code} - ${itm.nameAr}</div>
                      <div class="text-amber-800">الرصيد الحالي: <strong>${itm.currentStock}</strong> | الحد الأدنى: ${itm.minStock} | نقطة الطلب: ${itm.reorderPoint}</div>
                    </div>
                    <span class="px-2 py-1 rounded bg-amber-100 text-amber-900 font-semibold">كمية الطلب المقترحة: ${itm.reorderQty}</span>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;
    } else if (activeTab === 'reports') {
      const byCategory = (['chemical', 'consumable', 'equipment', 'packaging'] as InventoryCategory[]).map(
        (cat) => {
          const catItems = items.filter((i) => i.category === cat);
          const val = catItems.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
          return { cat, count: catItems.length, val };
        }
      );

      tabBody.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
          ${byCategory
            .map(
              (c) => `
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <div class="text-xs text-slate-500 uppercase font-semibold">${c.cat}</div>
                <div class="text-lg font-bold text-slate-900 mt-1">${formatCurrency(c.val)}</div>
                <div class="text-xs text-slate-500 mt-0.5">${c.count} صنف مسجل</div>
              </div>
            `
            )
            .join('')}
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <h3 class="text-sm font-bold text-slate-900 mb-3">تقرير تقييم المخزون ومعدل دوران الكواشف (FIFO & Weighted Average Valuation)</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th class="px-3 py-2 text-start">الكود</th>
                  <th class="px-3 py-2 text-start">الصنف</th>
                  <th class="px-3 py-2 text-start">طريقة التقييم</th>
                  <th class="px-3 py-2 text-start">الرصيد الدفتري</th>
                  <th class="px-3 py-2 text-start">متوسط تكلفة الوحدة</th>
                  <th class="px-3 py-2 text-start">إجمالي القيمة المالية</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${items
                  .slice(0, 20)
                  .map((itm) => {
                    const val = inventoryService.calculateItemValuation(itm, lots);
                    return `
                      <tr>
                        <td class="px-3 py-2 font-mono">${itm.code}</td>
                        <td class="px-3 py-2 font-semibold">${itm.nameAr}</td>
                        <td class="px-3 py-2"><span class="px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-mono">${itm.costMethod}</span></td>
                        <td class="px-3 py-2 font-mono font-bold">${itm.currentStock} ${itm.unit}</td>
                        <td class="px-3 py-2">${formatCurrency(val.unitValuation)}</td>
                        <td class="px-3 py-2 font-bold text-emerald-700">${formatCurrency(itm.currentStock * itm.unitCost)}</td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Bind Tab clicks
    container.querySelectorAll<HTMLButtonElement>('[data-inv-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.invTab as InventoryTab;
        currentPage = 1;
        draw();
      });
    });

    // Search & filter listeners
    document.getElementById('inv-search-input')?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      currentPage = 1;
      draw();
    });

    document.getElementById('inv-cat-filter')?.addEventListener('change', (e) => {
      categoryFilter = (e.target as HTMLSelectElement).value;
      currentPage = 1;
      draw();
    });

    document.getElementById('mov-type-filter')?.addEventListener('change', (e) => {
      movementTypeFilter = (e.target as HTMLSelectElement).value;
      draw();
    });

    // Pagination buttons
    container.querySelectorAll<HTMLButtonElement>('[data-page-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = Number(btn.dataset.pageBtn);
        if (!Number.isNaN(page) && page >= 1) {
          currentPage = page;
          draw();
        }
      });
    });

    // Print Barcode for Item
    container.querySelectorAll<HTMLButtonElement>('[data-print-item-barcode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itm = items.find((i) => i.id === btn.dataset.printItemBarcode);
        if (!itm) return;
        printService.printSampleBarcodeLabel({
          labName: 'مختبرات الشفاء التخصصية',
          patientName: itm.nameAr,
          requestNumber: itm.code,
          sampleType: `Storage: ${itm.storageTemp}`,
          barcodeValue: itm.barcode,
          date: '2026-11-10',
        });
      });
    });

    // Open Lot button
    container.querySelectorAll<HTMLButtonElement>('[data-open-lot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const updated = await inventoryService.openLotForUse(btn.dataset.openLot!);
          showToast(
            `تم تسجيل فتح العبوة (${updated.lotNumber}) - الصلاحية الفعلية بعد الفتح: ${updated.effectiveExpiryDate}`,
            'success'
          );
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Dispose Lot button
    container.querySelectorAll<HTMLButtonElement>('[data-dispose-lot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lot = lots.find((l) => l.id === btn.dataset.disposeLot);
        if (!lot) return;
        try {
          const res = await inventoryService.disposeExpiredOrDamagedLot(
            lot.id,
            lot.remainingQty,
            'منتهي الصلاحية - إتلاف بموجب محضر فحص الجودة',
            user.username
          );
          showToast(
            `تم إتلاف الدفعة ${lot.lotNumber} وتوليد القيد المحاسبي (${res.journalEntry.entryNumber})`,
            'warning'
          );
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Receive Purchase Invoice Stock
    container.querySelectorAll<HTMLButtonElement>('[data-receive-pinv]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await inventoryService.receivePurchaseInvoiceStock(
            btn.dataset.receivePinv!,
            user.username
          );
          showToast(
            `تم استلام ${res.lotsCreated.length} دفعة مخزنية وتوليد القيد (${res.journalEntry.entryNumber}) بنجاح`,
            'success'
          );
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Direct Lot Receipt Form
    document
      .getElementById('direct-lot-receipt-form')
      ?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const itemId = String(fd.get('itemId'));
        const lotNumber = String(fd.get('lotNumber'));
        const quantity = Number(fd.get('quantity'));
        const productionDate = String(fd.get('productionDate'));
        const expiryDate = String(fd.get('expiryDate'));

        if (expiryDate < '2026-11-10') {
          showToast('مرفوض: لا يمكن استلام دفعة منتهية الصلاحية للمخزن!', 'error');
          return;
        }

        const item = await db.inventoryItems.get(itemId);
        if (!item) return;

        const newStock = item.currentStock + quantity;
        await db.inventoryLots.put({
          id: `lot_dir_${Date.now()}`,
          lotNumber,
          itemId: item.id,
          itemCode: item.code,
          itemNameAr: item.nameAr,
          itemNameEn: item.nameEn,
          supplierId: item.supplierId,
          supplierName: 'توريد مباشر للمخزن',
          productionDate,
          expiryDate,
          effectiveExpiryDate: expiryDate,
          receivedDate: '2026-11-10',
          initialQty: quantity,
          remainingQty: quantity,
          reservedQty: 0,
          unitCost: item.unitCost,
          storageLocation: 'المخزن الرئيسي M-01',
          qcStatus: 'passed',
          qcTestedBy: user.username,
          qcDate: '2026-11-10',
          status: 'active',
        });

        await db.inventoryItems.put({
          ...item,
          currentStock: newStock,
          availableStock: Math.max(0, newStock - item.reservedStock),
        });

        showToast(`تم استلام الدفعة ${lotNumber} وإضافتها لرصيد ${item.nameAr}`, 'success');
        await draw();
      });

    // Issue BOM Materials for Test
    container.querySelectorAll<HTMLButtonElement>('[data-issue-bom-test]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const testId = btn.dataset.issueBomTest!;
        try {
          const res = await inventoryService.issueMaterialsForTestBOM(
            testId,
            `REQ-BOM-${Date.now().toString().slice(-4)}`,
            user.username
          );
          showToast(
            `تم خصم ${res.movements.length} مادة وفق FEFO وتوليد قيد التكلفة (${res.journalEntry.entryNumber} بمبلغ ${formatCurrency(res.totalCOGS)})`,
            'success'
          );
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Approve Stock Taking
    container.querySelectorAll<HTMLButtonElement>('[data-approve-st]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await inventoryService.approveStockTakingSession(btn.dataset.approveSt!, user.username);
          showToast('تم اعتماد جلسة الجرد وتحديث الأرصدة وتوليد قيد التسوية بنجاح', 'success');
          await draw();
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      });
    });

    // Add Inventory Item Modal
    document.getElementById('btn-add-inv-item')?.addEventListener('click', () => {
      openModal(
        'إضافة صنف جديد لكتالوج المخزون',
        `
          <form id="modal-add-inv-item-form" class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label class="block font-semibold mb-1">كود الصنف</label>
              <input name="code" required value="CHM-0${items.length + 1}" class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" />
            </div>
            <div>
              <label class="block font-semibold mb-1">الفئة</label>
              <select name="category" class="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white">
                <option value="chemical">كواشف ومحاليل كيميائية</option>
                <option value="consumable">مستهلكات وأنابيب طبية</option>
                <option value="equipment">أجهزة وقطع غيار</option>
                <option value="packaging">تعبئة وباركود</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold mb-1">الاسم بالعربية</label>
              <input name="nameAr" required placeholder="مثال: كاشف الكالسيوم المؤين" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">الاسم بالإنجليزية</label>
              <input name="nameEn" required placeholder="Ionized Calcium Reagent" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">الرصيد الافتتاحي</label>
              <input name="currentStock" type="number" value="250" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label class="block font-semibold mb-1">تكلفة الوحدة (ج.م)</label>
              <input name="unitCost" type="number" step="0.1" value="4.5" required class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div class="md:col-span-2 flex justify-end gap-2 pt-3">
              <button type="submit" class="rounded-lg bg-sky-600 px-4 py-2 text-white font-semibold hover:bg-sky-500 cursor-pointer">حفظ الصنف</button>
            </div>
          </form>
        `
      );

      document
        .getElementById('modal-add-inv-item-form')
        ?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const stock = Number(fd.get('currentStock')) || 0;
          await db.inventoryItems.put({
            id: `itm_${Date.now()}`,
            code: String(fd.get('code')),
            barcode: `622300${Math.floor(1000 + Math.random() * 8999)}`,
            nameAr: String(fd.get('nameAr')),
            nameEn: String(fd.get('nameEn')),
            category: String(fd.get('category')) as InventoryCategory,
            subCategory: 'كواشف ومستلزمات',
            unit: 'ml',
            purchaseUnit: 'Kit',
            conversionFactor: 100,
            storageTemp: '2-8°C',
            storageNotes: 'يحفظ في الثلاجة الطبية 2-8°C',
            hazardClass: 'none',
            minStock: 50,
            maxStock: 1000,
            reorderPoint: 100,
            reorderQty: 200,
            currentStock: stock,
            reservedStock: 0,
            availableStock: stock,
            costMethod: 'FIFO',
            unitCost: Number(fd.get('unitCost')) || 1,
            lastPurchasePrice: Number(fd.get('unitCost')) || 1,
            supplierId: 'sup_1',
            active: true,
            createdAt: '2026-11-10',
          });
          closeModal();
          showToast('تم إضافة الصنف بنجاح إلى كتالوج المخزون', 'success');
          await draw();
        });
    });

    // Print A4 Inventory Report
    document.getElementById('btn-print-inv-report')?.addEventListener('click', async () => {
      const settings = (await db.settings.get('default'))!;
      printService.printHtmlDocument(
        'تقرير تقييم وأرصدة المخزون الطبي',
        `
          <div style="font-family: Cairo, sans-serif; direction: rtl; padding: 16px;">
            <h2 style="margin:0 0 6px;">${settings.labNameAr} — تقرير أرصدة وتقييم المخزون</h2>
            <p style="margin:0 0 14px; color:#475569; font-size:12px;">إجمالي الأصناف: ${items.length} | إجمالي القيمة الدفترية: ${formatCurrency(totalStockValue)}</p>
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
              <thead>
                <tr style="background:#f1f5f9;">
                  <th style="border:1px solid #cbd5e1; padding:6px;">الكود</th>
                  <th style="border:1px solid #cbd5e1; padding:6px;">الصنف</th>
                  <th style="border:1px solid #cbd5e1; padding:6px;">الرصيد</th>
                  <th style="border:1px solid #cbd5e1; padding:6px;">تكلفة الوحدة</th>
                  <th style="border:1px solid #cbd5e1; padding:6px;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .slice(0, 30)
                  .map(
                    (i) => `
                    <tr>
                      <td style="border:1px solid #cbd5e1; padding:5px;">${i.code}</td>
                      <td style="border:1px solid #cbd5e1; padding:5px;">${i.nameAr}</td>
                      <td style="border:1px solid #cbd5e1; padding:5px;">${i.currentStock} ${i.unit}</td>
                      <td style="border:1px solid #cbd5e1; padding:5px;">${formatCurrency(i.unitCost)}</td>
                      <td style="border:1px solid #cbd5e1; padding:5px;">${formatCurrency(i.currentStock * i.unitCost)}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      );
    });

    // Export CSV
    document.getElementById('btn-export-inv-csv')?.addEventListener('click', () => {
      exportToCsv(
        'inventory-items.csv',
        ['Code', 'Barcode', 'Name_AR', 'Name_EN', 'Category', 'Current_Stock', 'Unit_Cost', 'Total_Value'],
        items.map((i) => [
          i.code,
          i.barcode,
          i.nameAr,
          i.nameEn,
          i.category,
          i.currentStock,
          i.unitCost,
          Math.round(i.currentStock * i.unitCost * 100) / 100,
        ])
      );
    });
  }

  await draw();
}
