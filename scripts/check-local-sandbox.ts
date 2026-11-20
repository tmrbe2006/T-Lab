import 'dotenv/config';
import mysql from 'mysql2/promise';

const name = process.env.MYSQL_DATABASE || '';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const password = process.env.TLAB_ADMIN_PASSWORD || '';
const safeHost = ['127.0.0.1', 'localhost', '::1'].includes(host);
async function main() {
  if (!/^[A-Za-z][A-Za-z0-9_]{2,54}_(test|demo)$/.test(name)) {
    throw new Error('The configured MySQL database is not clearly a sandbox ending _test or _demo.');
  }
  if (!safeHost) throw new Error('Local test launcher accepts only loopback MySQL, not an off-machine host.');
  if (password.length < 16) throw new Error('Set a strong test-only TLAB_ADMIN_PASSWORD (16+ characters).');
  const prohibited = ['TLAB_ENABLE_LEGACY_API','TLAB_ENABLE_UNSAFE_BULK_IMPORT',
    'TLAB_ENABLE_SNAPSHOT_PULL','MYSQL_AUTO_SYNC'];
  if (prohibited.some(key => process.env[key] === 'true')) {
    throw new Error('Unsafe legacy MySQL/IndexedDB sync flag is enabled.');
  }
  const connection = await mysql.createConnection({
    host, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: name, connectTimeout: 8000,
  });
  try {
    const [tables] = await connection.query<mysql.RowDataPacket[]>('SHOW TABLES');
    const present = new Set(tables.map(row => String(Object.values(row)[0])));
    const required = ['patients', 'lab_requests', 'samples', 'lab_results',
      'secure_auth_users', 'secure_role_permissions', 'secure_invoice_drafts',
      'secure_stock_receipts', 'secure_stock_qc_reviews',
      'secure_journal_drafts', 'secure_journal_draft_lines'];
    const missing = required.filter(table => !present.has(table));
    if (missing.length) throw new Error('Sandbox not initialized; missing: ' + missing.join(', '));
    const [version] = await connection.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
    console.log('OK: isolated test schema ' + name + ' on ' + host +
      ' (MySQL ' + String(version[0]?.version || '') + ', ' + present.size + ' tables).');
    console.log('Legacy bulk APIs and automatic browser database sync are disabled.');
    console.log('This is not approval for clinical results or financial posting.');
  } finally { await connection.end(); }
}
main().catch(error => {
  console.error('LOCAL TEST BLOCKED: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exitCode = 1;
});
