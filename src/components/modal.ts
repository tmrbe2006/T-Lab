import { i18n } from '../i18n';

export interface DeleteConfirmOptions {
  recordLabel: string;
  customWarning?: string;
  requireReason?: boolean;
  onConfirm: (reason?: string) => Promise<void> | void;
}

/**
 * Renders a confirmation dialog before deleting any record,
 * showing the record's exact name/code and optionally recording a deletion reason.
 */
export function openDeleteConfirmModal(options: DeleteConfirmOptions): void {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const d = i18n.dict.actions;
  const reasonPlaceholder = i18n.bi(
    'سبب الحذف أو الإلغاء (يُسجل في Audit Log)...',
    'Reason for deletion / cancellation (logged in Audit Log)...'
  );

  root.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]">
      <div class="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 shadow-xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <h3 class="text-base font-bold text-slate-900">${d.confirmDeleteTitle}</h3>
          <button id="del-modal-close" class="text-slate-400 hover:text-slate-700 text-sm font-bold px-2">✕</button>
        </div>
        <div class="mt-4 space-y-3 text-sm text-slate-700">
          <p>${d.confirmDeleteMsg}</p>
          <div class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 font-semibold text-rose-900">
            ${options.recordLabel}
          </div>
          ${
            options.customWarning
              ? `<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">${options.customWarning}</p>`
              : ''
          }
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">
              ${i18n.bi('سبب الحذف (اختياري):', 'Reason for deletion (optional):')}
            </label>
            <input
              id="del-reason-input"
              type="text"
              placeholder="${reasonPlaceholder}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
            />
          </div>
        </div>
        <div class="mt-6 flex items-center justify-end gap-2">
          <button
            id="del-modal-cancel"
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            ${d.cancelBtn}
          </button>
          <button
            id="del-modal-confirm"
            type="button"
            class="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            ${d.confirmBtn}
          </button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    root.innerHTML = '';
  };

  document.getElementById('del-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('del-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('del-modal-confirm')?.addEventListener('click', async () => {
    const reasonEl = document.getElementById('del-reason-input') as HTMLInputElement | null;
    const reason = reasonEl?.value.trim() || undefined;
    closeModal();
    await options.onConfirm(reason);
  });
}

export function openCustomModal(title: string, bodyHtml: string, onMount?: (close: () => void) => void): void {
  const root = document.getElementById('modal-root');
  if (!root) return;

  root.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div class="w-full max-w-2xl rounded-xl bg-white border border-slate-200 p-6 shadow-xl my-8">
        <div class="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 mb-4">
          <h3 class="text-base font-bold text-slate-900">${title}</h3>
          <button id="custom-modal-close" type="button" class="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 py-1">✕</button>
        </div>
        <div id="custom-modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  const close = () => {
    root.innerHTML = '';
  };

  document.getElementById('custom-modal-close')?.addEventListener('click', close);
  if (onMount) onMount(close);
}
