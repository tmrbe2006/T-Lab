/**
 * Read-only T-Lab MySQL import verification.
 * Run: node --env-file=.env scripts/verify-mysql-import.mjs
 * No schema creation, seeding, imports, deletes or updates are performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const definition = fs.readFileSync(path.resolve('src/db/mysql-schema.ts'), 'utf8');
const tables = [...new Set([...definition.matchAll(/mysqlTable:\s*'([a-zA-Z0-9_]+)'/g)].map(m => m[1]))];
if (tables.length !== 49) {
  console.error('SCHEMA_MAPPING_UNEXPECTED: Expected 49 mapped tables; found', tables.length);
  process.exit(2);
}
const database = process.env.MYSQL_DATABASE || 'tlab_db';
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  console.error('INVALID_DATABASE_NAME');
  process.exit(2);
}
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database,
  connectTimeout: 8000,
});
try {
  const [databaseRows] = await connection.query('SELECT DATABASE() AS database_name, VERSION() AS server_version');
  const [existingRows] = await connection.query('SHOW TABLES');
  const existing = new Set(existingRows.flatMap(row => Object.values(row).map(String)));
  console.log('Connected database:', databaseRows[0].database_name);
  console.log('MySQL version:', databaseRows[0].server_version);
  console.log('Database tables:', existing.size);
  console.log('Mapped application tables:', tables.length);
  const missing = tables.filter(t => !existing.has(t));
  if (missing.length) console.error('MISSING_TABLES:', missing.join(', '));
  else console.log('All 49 mapped table names exist.');
  const important = ['patients', 'lab_tests', 'test_parameters', 'requests', 'invoices',
    'payments', 'journal_entries', 'branches', 'users', 'patient_branch_access'];
  console.log('\nRead-only row counts (absence is not the same as an empty table):');
  for (const table of important) {
    if (!existing.has(table)) { console.log(table + ': MISSING'); continue; }
    // Identifiers are strictly code-owned constants, never user input.
    const [rows] = await connection.query('SELECT COUNT(*) AS total FROM `' + table + '`');
    console.log(table + ': ' + rows[0].total);
  }
  if (missing.length) process.exitCode = 1;
  else console.log('\nSchema check passed. This does NOT prove the UI uses MySQL or that browser data were migrated.');
} finally {
  await connection.end();
}
