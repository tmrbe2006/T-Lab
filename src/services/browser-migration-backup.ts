import { db } from '../db/database';
import { MYSQL_TABLES_CONFIG } from '../db/mysql-schema';

/**
 * Read-only safety copy before retiring IndexedDB. Nothing is deleted,
 * seeded, imported or sent to a server. Save privately: it contains medical,
 * financial and potentially credential records.
 */
export async function downloadUnmodifiedBrowserBackup(): Promise<{
  tableCount: number; rowCount: number; fileName: string;
}> {
  const tables = MYSQL_TABLES_CONFIG.map(t => t.dexieTable);
  if (tables.length !== 49 || new Set(tables).size !== 49) {
    throw new Error('BACKUP_STORE_MAPPING_INCOMPLETE');
  }
  const all: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  let rowCount = 0;

  for (const store of tables) {
    const rows: unknown[] = await db.table(store).toArray();
    // JSON.stringify silently drops Blob/File values. Refuse to advertise
    // a complete backup when unsupported binary payloads are present.
    for (const row of rows) {
      const visited = new WeakSet<object>();
      const check = (value: unknown, depth = 0): void => {
        if (!value || typeof value !== 'object') return;
        if (depth > 32) throw new Error('BACKUP_OBJECT_NESTING_TOO_DEEP');
        if (typeof Blob !== 'undefined' && value instanceof Blob) {
          throw new Error('BACKUP_BINARY_ATTACHMENT_REQUIRES_SEPARATE_EXPORT');
        }
        if (visited.has(value)) throw new Error('BACKUP_CIRCULAR_RECORD');
        visited.add(value);
        if (Array.isArray(value)) value.forEach(v => check(v, depth + 1));
        else Object.values(value).forEach(v => check(v, depth + 1));
        visited.delete(value);
      };
      check(row);
    }
    all[store] = rows;
    counts[store] = rows.length;
    rowCount += rows.length;
  }

  const createdAt = new Date().toISOString();
  const payload = {
    format: 'tlab-indexeddb-readonly-backup-v1',
    createdAt, sourceDb: db.name,
    instruction: 'Sensitive data. Reconcile IDs and table counts before import into MySQL.',
    counts, totalRows: rowCount, tables: all,
  };
  const body = JSON.stringify(payload);
  const fileName = 'T-Lab-Browser-Backup-' + createdAt.replace(/[:.]/g, '-') + '.json';
  const objectURL = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = objectURL;
  a.download = fileName;
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(objectURL), 1000); }
  return { tableCount: tables.length, rowCount, fileName };
}
