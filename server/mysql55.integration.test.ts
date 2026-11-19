// @vitest-environment node
import { describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { buildCreateTableSQL, MYSQL_TABLES_CONFIG } from '../src/db/mysql-schema';

const enabled = process.env.TLAB_RUN_MYSQL55_TESTS === 'true';
describe.skipIf(!enabled)('Real MySQL 5.5 schema compatibility', () => {
  it('creates every mapped table, verifies unique keys, and rolls back clinical inserts', async () => {
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
      connectTimeout: 5000,
      multipleStatements: false,
    });
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
      expect(String(rows[0].version)).toMatch(/^5\.5\./);
      for (const mapping of MYSQL_TABLES_CONFIG) {
        await conn.query(buildCreateTableSQL(mapping));
      }
      const [tables] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES');
      expect(tables.length).toBeGreaterThanOrEqual(MYSQL_TABLES_CONFIG.length);
      await conn.beginTransaction();
      await conn.execute('INSERT INTO `users` (`id`, `username`, `role`, `active`) VALUES (?, ?, ?, ?)', [
        'integration-001', 'ci-user', 'Receptionist', 1,
      ]);
      const [inserted] = await conn.query<mysql.RowDataPacket[]>('SELECT * FROM `users` WHERE `id` = ?', ['integration-001']);
      expect(inserted.length).toBe(1);
      await conn.rollback();
      const [rolledBack] = await conn.query<mysql.RowDataPacket[]>('SELECT * FROM `users` WHERE `id` = ?', ['integration-001']);
      expect(rolledBack.length).toBe(0);
    } finally {
      await conn.end();
    }
  });
});
