export interface VirtualTableOptions {
  rowHeight?: number;
  visibleRows?: number;
  headers?: string[];
  emptyMessage?: string;
}

export class VirtualTable<T = any> {
  private rowHeight = 40; // ارتفاع الصف بالبكسل
  private visibleRows = 20; // عدد الصفوف المرئية
  private headers: string[] = [];
  private emptyMessage = 'لا توجد سجلات';
  private viewportEl: HTMLElement | null = null;
  private tbodyEl: HTMLElement | null = null;

  constructor(
    private container: HTMLElement,
    private data: T[],
    private renderRow: (item: T, index: number) => string,
    options?: VirtualTableOptions
  ) {
    if (options?.rowHeight) this.rowHeight = options.rowHeight;
    if (options?.visibleRows) this.visibleRows = options.visibleRows;
    if (options?.headers) this.headers = options.headers;
    if (options?.emptyMessage) this.emptyMessage = options.emptyMessage;
    this.mountShell();
  }

  private mountShell(): void {
    const maxViewportHeight = this.visibleRows * this.rowHeight;
    const headerHtml =
      this.headers.length > 0
        ? `
          <thead class="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 shadow-2xs">
            <tr>
              ${this.headers.map((h) => `<th class="py-3 px-3 text-start font-bold">${h}</th>`).join('')}
            </tr>
          </thead>
        `
        : '';

    this.container.innerHTML = `
      <div
        data-virtual-viewport="true"
        class="rounded-xl bg-white border border-slate-200 overflow-y-auto overflow-x-auto relative"
        style="max-height: ${maxViewportHeight + 48}px;"
      >
        <table class="w-full text-xs text-start border-collapse">
          ${headerHtml}
          <tbody data-virtual-tbody="true" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
    `;

    this.viewportEl = this.container.querySelector('[data-virtual-viewport="true"]');
    this.tbodyEl = this.container.querySelector('[data-virtual-tbody="true"]');

    this.viewportEl?.addEventListener('scroll', () => {
      this.render();
    });
  }

  public updateData(newData: T[]): void {
    this.data = newData;
    if (this.viewportEl) {
      this.viewportEl.scrollTop = 0;
    }
    this.render();
  }

  public render(): void {
    if (!this.tbodyEl) {
      this.mountShell();
    }
    const scrollSource = this.viewportEl || this.container;
    const totalHeight = this.data.length * this.rowHeight;
    const scrollTop = scrollSource.scrollTop || 0;
    const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight));
    const endIndex = Math.min(startIndex + this.visibleRows, this.data.length);

    const visibleData = this.data.slice(startIndex, endIndex);
    const offsetY = startIndex * this.rowHeight;
    const bottomSpacerHeight = Math.max(0, totalHeight - endIndex * this.rowHeight);
    const colSpan = Math.max(1, this.headers.length || 6);

    if (!this.tbodyEl) return;

    if (this.data.length === 0) {
      this.tbodyEl.innerHTML = `
        <tr>
          <td colspan="${colSpan}" class="py-8 text-center text-slate-400">${this.emptyMessage}</td>
        </tr>
      `;
      return;
    }

    const topSpacer =
      offsetY > 0
        ? `<tr aria-hidden="true" style="height: ${offsetY}px;"><td colspan="${colSpan}" class="p-0 border-0"></td></tr>`
        : '';
    const bottomSpacer =
      bottomSpacerHeight > 0
        ? `<tr aria-hidden="true" style="height: ${bottomSpacerHeight}px;"><td colspan="${colSpan}" class="p-0 border-0"></td></tr>`
        : '';

    const rowsHtml = visibleData
      .map((item, idx) => this.renderRow(item, startIndex + idx))
      .join('');

    this.tbodyEl.innerHTML = `${topSpacer}${rowsHtml}${bottomSpacer}`;
  }
}
