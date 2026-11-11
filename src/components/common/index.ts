export {
  type DeleteConfirmOptions,
  openCustomModal,
  openDeleteConfirmModal,
} from './modal';
export { showToast, type ToastType } from './toast';
export {
  buildPrintTableHtml,
  renderDataTable,
  type TableColumn,
} from './table';
export {
  type FormFieldConfig,
  type FormFieldOption,
  getFormNumber,
  getFormString,
  renderFormField,
} from './form';
export {
  bindSearchInputWithFocus,
  type FilterOption,
  renderSearchFilterBar,
  type SearchFilterBarOptions,
} from './search-filter';
export {
  bindPaginationEvents,
  bindTablePagination,
  createPaginationControls,
  paginateArray,
  paginateItems,
  type PaginationResult,
  type PaginationState,
  renderPaginationBar,
} from './pagination';
export {
  VirtualTable,
  type VirtualTableOptions,
} from './virtual-table';

import { openCustomModal } from './modal';

export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function openModal(
  titleOrOpts: string | { title: string; content: string; size?: string },
  bodyHtml?: string
): void {
  if (typeof titleOrOpts === 'string') {
    openCustomModal(titleOrOpts, bodyHtml || '');
  } else {
    openCustomModal(titleOrOpts.title, titleOrOpts.content);
  }
}

export function closeModal(): void {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

export function pageHeader(
  title: string,
  subtitle: string,
  actionsHtml = ''
): string {
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-5 mb-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
      <div>
        <h1 class="text-lg font-bold text-slate-900">${title}</h1>
        <p class="text-xs text-slate-500 mt-0.5">${subtitle}</p>
      </div>
      ${actionsHtml ? `<div class="flex flex-wrap items-center gap-2">${actionsHtml}</div>` : ''}
    </div>
  `;
}

export const renderPageHeader = pageHeader;

export function emptyState(message: string): string {
  return `
    <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
      ${message}
    </div>
  `;
}

export function formatCurrency(amount: number, currency = 'ج.م'): string {
  const rounded = Math.round((Number(amount) || 0) * 100) / 100;
  return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

