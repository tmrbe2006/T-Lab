import { i18n } from '../../i18n';

export interface FilterOption {
  value: string;
  label: string;
}

export interface SearchFilterBarOptions {
  searchInputId: string;
  searchQuery: string;
  placeholder?: string;
  filteredCount: number;
  totalCount: number;
  selectId?: string;
  selectedValue?: string;
  selectOptions?: FilterOption[];
}

/**
 * Renders a unified search input + optional status/category filter + tabular count badge.
 */
export function renderSearchFilterBar(opts: SearchFilterBarOptions): string {
  const placeholder = opts.placeholder || i18n.dict.actions.search;
  return `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <input
          id="${opts.searchInputId}"
          type="search"
          value="${opts.searchQuery}"
          placeholder="${placeholder}"
          class="w-64 sm:w-80 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs"
        />
        ${
          opts.selectId && opts.selectOptions
            ? `
            <select
              id="${opts.selectId}"
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              ${opts.selectOptions
                .map(
                  (o) =>
                    `<option value="${o.value}" ${opts.selectedValue === o.value ? 'selected' : ''}>${o.label}</option>`
                )
                .join('')}
            </select>
          `
            : ''
        }
      </div>
      <span class="text-xs font-mono text-slate-500 tabular-nums">${opts.filteredCount} / ${opts.totalCount}</span>
    </div>
  `;
}

/**
 * Binds a live search input and preserves cursor position and focus across re-renders.
 */
export function bindSearchInputWithFocus(
  inputId: string,
  currentValue: string,
  onChange: (nextValue: string) => void
): void {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  input?.addEventListener('input', () => {
    const val = input.value;
    onChange(val);
    const nextInput = document.getElementById(inputId) as HTMLInputElement | null;
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(val.length, val.length);
    }
  });
  void currentValue;
}
