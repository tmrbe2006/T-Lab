export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'password' | 'date' | 'select';
  value?: string | number;
  required?: boolean;
  step?: string;
  min?: string | number;
  max?: string | number;
  mono?: boolean;
  options?: FormFieldOption[];
  disabled?: boolean;
}

/**
 * Renders a reusable form field (input or select) with consistent styling.
 */
export function renderFormField(field: FormFieldConfig): string {
  const type = field.type || 'text';
  const reqAttr = field.required ? 'required' : '';
  const disAttr = field.disabled ? 'disabled' : '';
  const monoClass = field.mono ? 'font-mono' : '';

  if (type === 'select') {
    return `
      <div>
        <label class="block font-semibold mb-1">${field.label}</label>
        <select
          name="${field.name}"
          ${reqAttr}
          ${disAttr}
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${monoClass}"
        >
          ${(field.options || [])
            .map(
              (opt) =>
                `<option value="${opt.value}" ${String(field.value ?? '') === opt.value ? 'selected' : ''}>${opt.label}</option>`
            )
            .join('')}
        </select>
      </div>
    `;
  }

  return `
    <div>
      <label class="block font-semibold mb-1">${field.label}</label>
      <input
        name="${field.name}"
        type="${type}"
        value="${field.value ?? ''}"
        ${field.step ? `step="${field.step}"` : ''}
        ${field.min !== undefined ? `min="${field.min}"` : ''}
        ${field.max !== undefined ? `max="${field.max}"` : ''}
        ${reqAttr}
        ${disAttr}
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${monoClass}"
      />
    </div>
  `;
}

/**
 * Helper to read trimmed string or numeric values from FormData.
 */
export function getFormString(fd: FormData, key: string, fallback = ''): string {
  const val = fd.get(key);
  return val !== null ? String(val).trim() : fallback;
}

export function getFormNumber(fd: FormData, key: string, fallback = 0): number {
  const num = Number(fd.get(key));
  return Number.isFinite(num) ? num : fallback;
}
