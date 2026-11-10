import { i18n } from '../../i18n';

export interface PaginationState {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
}

export interface PaginationResult<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

/**
 * Slices an array for a specific page and itemsPerPage.
 */
export function paginateArray<T>(
  items: T[],
  page: number,
  itemsPerPage: number
): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * itemsPerPage;
  return items.slice(start, start + itemsPerPage);
}

/**
 * Creates numbered pagination controls HTML (Previous, Page Numbers with active state, Next)
 * and optionally registers a global/delegated callback or data-page attributes.
 */
export function createPaginationControls(
  state: PaginationState,
  _onPageChange?: (page: number) => void,
  prefixId = 'tbl-pag'
): string {
  const totalPages = Math.max(1, Math.ceil(state.totalItems / state.itemsPerPage));
  const currentPage = Math.min(Math.max(1, state.currentPage), totalPages);

  if (state.totalItems === 0) return '';

  const startIdx = (currentPage - 1) * state.itemsPerPage + 1;
  const endIdx = Math.min(state.totalItems, currentPage * state.itemsPerPage);

  // Build visible page numbers window (up to 5 page buttons around currentPage)
  const pages: number[] = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  const adjustedStart = Math.max(1, endPage - 4);
  for (let p = adjustedStart; p <= endPage; p++) {
    pages.push(p);
  }

  return `
    <div id="${prefixId}-container" class="flex flex-wrap items-center justify-between gap-3 pt-3 px-1 text-xs text-slate-600">
      <div class="font-mono tabular-nums">
        ${i18n.bi('عرض', 'Showing')} <span class="font-bold text-slate-900">${startIdx}-${endIdx}</span> ${i18n.bi('من أصل', 'of')} <span class="font-bold text-slate-900">${state.totalItems}</span> (${i18n.bi('صفحة', 'Page')} ${currentPage}/${totalPages})
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          data-pag-prefix="${prefixId}"
          data-pag-target="${currentPage - 1}"
          ${currentPage <= 1 ? 'disabled' : ''}
          class="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          ${i18n.bi('السابق', 'Prev')}
        </button>
        ${pages
          .map(
            (p) => `
            <button
              type="button"
              data-pag-prefix="${prefixId}"
              data-pag-target="${p}"
              ${p === currentPage ? 'aria-current="page"' : ''}
              class="rounded-lg border px-2.5 py-1 font-mono font-bold tabular-nums cursor-pointer ${
                p === currentPage
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }"
            >
              ${p}
            </button>
          `
          )
          .join('')}
        <button
          type="button"
          data-pag-prefix="${prefixId}"
          data-pag-target="${currentPage + 1}"
          ${currentPage >= totalPages ? 'disabled' : ''}
          class="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          ${i18n.bi('التالي', 'Next')}
        </button>
      </div>
    </div>
  `;
}

/**
 * Binds click events to the controls created by createPaginationControls.
 */
export function bindTablePagination(
  root: HTMLElement | Document,
  state: PaginationState,
  onPageChange: (page: number) => void,
  prefixId = 'tbl-pag'
): void {
  const totalPages = Math.max(1, Math.ceil(state.totalItems / state.itemsPerPage));
  root
    .querySelectorAll<HTMLButtonElement>(`button[data-pag-prefix="${prefixId}"]`)
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Number(btn.getAttribute('data-pag-target'));
        if (target >= 1 && target <= totalPages && target !== state.currentPage) {
          onPageChange(target);
        }
      });
    });
}

/**
 * Slices an array for pagination and returns metadata.
 */
export function paginateItems<T>(
  allItems: T[],
  page: number,
  pageSize = 25
): PaginationResult<T> {
  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const items = paginateArray(allItems, currentPage, pageSize);

  return {
    items,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
  };
}

/**
 * Renders a compact pagination control bar.
 */
export function renderPaginationBar(
  prefixId: string,
  meta: PaginationResult<unknown>
): string {
  return createPaginationControls(
    {
      currentPage: meta.currentPage,
      itemsPerPage: meta.pageSize,
      totalItems: meta.totalItems,
    },
    undefined,
    prefixId
  );
}

/**
 * Binds Previous / Number / Next pagination button clicks.
 */
export function bindPaginationEvents(
  prefixId: string,
  currentPage: number,
  totalPages: number,
  onPageChange: (nextPage: number) => void
): void {
  document
    .querySelectorAll<HTMLButtonElement>(`button[data-pag-prefix="${prefixId}"]`)
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Number(btn.getAttribute('data-pag-target'));
        if (target >= 1 && target <= totalPages && target !== currentPage) {
          onPageChange(target);
        }
      });
    });
}
