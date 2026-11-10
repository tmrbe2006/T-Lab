import { i18n } from '../i18n';
import { router } from '../router';

export function renderForbiddenPage(container: HTMLElement, attemptedResource = ''): void {
  const c = i18n.dict.common;
  container.innerHTML = `
    <div class="max-w-xl mx-auto my-16 rounded-xl bg-white border border-rose-200 p-8 text-center shadow-sm">
      <div class="mx-auto w-14 h-14 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-mono text-lg font-bold">
        403
      </div>
      <h2 class="mt-4 text-xl font-bold text-slate-900">${c.forbiddenTitle}</h2>
      <p class="mt-2 text-sm text-slate-600 leading-relaxed">${c.forbiddenMessage}</p>
      ${
        attemptedResource
          ? `<div class="mt-3 text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-1.5 inline-block">Resource: ${attemptedResource}</div>`
          : ''
      }
      <div class="mt-6">
        <button
          id="forbidden-back-btn"
          type="button"
          class="rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
        >
          ${c.backToDashboard}
        </button>
      </div>
    </div>
  `;

  document.getElementById('forbidden-back-btn')?.addEventListener('click', () => {
    router.navigate('dashboard');
  });
}
