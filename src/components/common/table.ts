import { i18n } from '../../i18n';

export interface TableColumn<T> {
  header: string;
  render: (row: T, index: number) => string;
  className?: string;
  printOnly?: boolean;
  screenOnly?: boolean;
}

/**
 * Renders a standardized data table container with responsive horizontal scrolling.
 */
export function renderDataTable<T>(
  columns: TableColumn<T>[],
  rows: T[],
  emptyMessage?: string
): string {
  const screenCols = columns.filter((c) => !c.printOnly);
  const emptyText =
    emptyMessage ||
    i18n.bi('لا توجد سجلات مطابقة للبحث الحالي', 'No matching records found');

  return `
    <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
      <table class="w-full text-xs text-start">
        <thead>
          <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
            ${screenCols
              .map(
                (col) =>
                  `<th class="py-3 px-3 text-start ${col.className || ''}">${col.header}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${
            rows.length > 0
              ? rows
                  .map(
                    (row, idx) => `
                  <tr class="hover:bg-slate-50">
                    ${screenCols
                      .map(
                        (col) =>
                          `<td class="py-2.5 px-3 ${col.className || ''}">${col.render(row, idx)}</td>`
                      )
                      .join('')}
                  </tr>
                `
                  )
                  .join('')
              : `<tr><td colspan="${screenCols.length}" class="py-8 text-center text-slate-400">${emptyText}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Generates an official A4 printable table HTML string from columns and rows.
 */
export function buildPrintTableHtml<T>(
  headers: string[],
  rows: T[],
  renderCells: (row: T, index: number) => string[]
): string {
  return `
    <table class="print-table">
      <thead>
        <tr>
          ${headers.map((h) => `<th>${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row, idx) => `
            <tr>
              ${renderCells(row, idx)
                .map((cell) => `<td>${cell}</td>`)
                .join('')}
            </tr>
          `
          )
          .join('')}
      </tbody>
    </table>
  `;
}
