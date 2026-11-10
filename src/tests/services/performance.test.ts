import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPaginationControls,
  paginateArray,
  VirtualTable,
} from '../../components/common';
import { db } from '../../db/database';
import { optimizedInvoicesRepository } from '../../repositories/optimized.repository';
import { CacheService } from '../../services/cache.service';
import type { Invoice } from '../../types';

describe('Performance Optimizations Benchmark (Before vs After)', () => {
  beforeEach(async () => {
    CacheService.clear();
    await db.invoices.clear();
  });

  it('1) TablePagination: يجب أن يكون تقسيم وعرض صفحة واحدة أسرع بكثير من بناء جدول بـ 2000 صف دفعة واحدة', () => {
    const dataset = Array.from({ length: 2000 }, (_, i) => ({
      id: `pat_${i + 1}`,
      code: `PT-${10000 + i}`,
      name: `مريض رقم ${i + 1}`,
      phone: `0100000${String(i).padStart(4, '0')}`,
    }));

    const containerBefore = document.createElement('div');
    const tBefore0 = performance.now();
    containerBefore.innerHTML = `
      <table>
        <tbody>
          ${dataset.map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${r.phone}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
    const fullRenderMs = performance.now() - tBefore0;

    const containerAfter = document.createElement('div');
    const tAfter0 = performance.now();
    const pageItems = paginateArray(dataset, 1, 20);
    const controlsHtml = createPaginationControls({
      currentPage: 1,
      itemsPerPage: 20,
      totalItems: dataset.length,
    });
    containerAfter.innerHTML = `
      <table>
        <tbody>
          ${pageItems.map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${r.phone}</td></tr>`).join('')}
        </tbody>
      </table>
      ${controlsHtml}
    `;
    const paginatedRenderMs = performance.now() - tAfter0;

    expect(pageItems).toHaveLength(20);
    expect(containerAfter.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(paginatedRenderMs).toBeLessThan(fullRenderMs);
  });

  it('2) VirtualTable: يجب أن يعرض الصفوف المرئية فقط من أصل 5000 سجل بكفاءة عالية', () => {
    const logs = Array.from({ length: 5000 }, (_, i) => ({
      id: `log_${i}`,
      timestamp: `2026-11-10 10:${String(i % 60).padStart(2, '0')}`,
      username: 'owner',
      action: `عملية مراجعة رقم ${i}`,
    }));

    const fullHost = document.createElement('div');
    const tFull0 = performance.now();
    fullHost.innerHTML = `<table><tbody>${logs
      .map((l) => `<tr style="height:40px"><td>${l.timestamp}</td><td>${l.username}</td><td>${l.action}</td></tr>`)
      .join('')}</tbody></table>`;
    const fullDomMs = performance.now() - tFull0;

    const virtualHost = document.createElement('div');
    const tVirt0 = performance.now();
    const vTable = new VirtualTable(
      virtualHost,
      logs,
      (l) => `<tr style="height:40px"><td>${l.timestamp}</td><td>${l.username}</td><td>${l.action}</td></tr>`,
      { rowHeight: 40, visibleRows: 20, headers: ['التاريخ', 'المستخدم', 'العملية'] }
    );
    vTable.render();
    const virtualDomMs = performance.now() - tVirt0;

    // عدد عناصر tr الفعلية في DOM لا يتجاوز الصفوف المرئية + صف التباعد السفلي
    const renderedRows = virtualHost.querySelectorAll('tbody tr');
    expect(renderedRows.length).toBeLessThanOrEqual(22);
    expect(virtualDomMs).toBeLessThan(fullDomMs);
  });

  it('3) IndexedDB Secondary Indexes + OptimizedInvoicesRepository + CacheService', async () => {
    const bulkInvoices: Invoice[] = Array.from({ length: 600 }, (_, i) => ({
      id: `inv_${i + 1}`,
      invoiceNumber: `INV-${20000 + i}`,
      requestId: `req_${i + 1}`,
      patientId: `pat_${(i % 50) + 1}`,
      doctorId: `doc_${(i % 10) + 1}`,
      requestType: i % 2 === 0 ? 'referred' : 'internal',
      date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      subtotal: 500,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      taxRate: 14,
      taxAmount: 70,
      netTotal: 570,
      paidAmount: i % 10 === 0 ? 0 : 570,
      remainingAmount: i % 10 === 0 ? 570 : 0,
      paymentMethod: 'cash',
      status: i % 10 === 0 ? 'unpaid' : 'paid',
      notes: '',
      createdBy: 'owner',
    }));

    await db.invoices.bulkPut(bulkInvoices);

    const tIdx0 = performance.now();
    const unpaidIndexed = await optimizedInvoicesRepository.getByStatus('unpaid');
    const indexedQueryMs = performance.now() - tIdx0;

    const rangeInvoices = await optimizedInvoicesRepository.getByDateRange('2026-11-01', '2026-11-05');
    expect(unpaidIndexed).toHaveLength(60);
    expect(rangeInvoices.length).toBeGreaterThan(0);

    // اختبار سرعة الكاش مقارنة بالاستعلام المباشر
    const tUncached0 = performance.now();
    const firstFetch = await CacheService.get('bench:unpaid', () =>
      optimizedInvoicesRepository.getUnpaid()
    );
    const uncachedMs = performance.now() - tUncached0;

    const tCached0 = performance.now();
    const cachedFetch = await CacheService.get('bench:unpaid', () =>
      optimizedInvoicesRepository.getUnpaid()
    );
    const cachedMs = performance.now() - tCached0;

    expect(firstFetch).toHaveLength(60);
    expect(cachedFetch).toHaveLength(60);
    expect(cachedMs).toBeLessThanOrEqual(uncachedMs);
    expect(indexedQueryMs).toBeGreaterThanOrEqual(0);
  });
});
