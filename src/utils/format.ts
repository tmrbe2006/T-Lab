export function formatCurrency(amount: number, currency = 'EGP'): string {
  const rounded = Math.round((Number(amount) || 0) * 100) / 100;
  return `${rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return String(dateStr).replace('T', ' ').slice(0, 16);
}

export function generateId(prefix = 'ID'): string {
  return `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
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
