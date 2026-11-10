export type ToastType =
  | 'success'
  | 'error'
  | 'warning'
  | 'critical'
  | 'unauthorized';

export function showToast(message: string, type: ToastType = 'success'): void {
  const container = document.getElementById('toast-root');
  if (!container) return;

  const palette: Record<ToastType, string> = {
    success: 'bg-emerald-900 text-emerald-50 border-emerald-700',
    error: 'bg-rose-900 text-rose-50 border-rose-700',
    warning: 'bg-amber-900 text-amber-50 border-amber-700',
    critical: 'bg-red-950 text-red-50 border-red-600 ring-2 ring-red-500/40',
    unauthorized: 'bg-slate-900 text-rose-200 border-rose-700',
  };

  const prefix: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '!',
    critical: '⚠ CRITICAL',
    unauthorized: '403',
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium transition-all duration-150 ${palette[type]}`;
  toast.innerHTML = `
    <span class="font-mono text-xs font-bold shrink-0">${prefix[type]}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 180);
  }, 3600);
}
