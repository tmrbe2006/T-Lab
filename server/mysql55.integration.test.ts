// @vitest-environment node
import { describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import express from 'express';
import { installApiSecurity } from './api-security';
import { StaffAccountStore, verifyPassword } from './staff-accounts';
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
  it('provisions staff with salted hashes, authenticates, and revokes on update', async () => {
    const store = new StaffAccountStore(() => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    }));
    await store.ensureTable();
    const username = 'ci_staff_' + Date.now().toString(36);
    const created = await store.create(username, 'Test-only-password-12345!', 'Technician');
    expect(created.role).toBe('Technician');
    const record = await store.find(username);
    expect(record?.account.id).toBe(created.id);
    expect(record?.hash).toMatch(/^scrypt-v1:/);
    expect(record?.hash).not.toContain('Test-only-password');
    expect(await verifyPassword('Test-only-password-12345!', record!.hash)).toBe(true);
    expect(await verifyPassword('incorrect-password', record!.hash)).toBe(false);
    expect(await store.update(created.id, { role: 'Chemist' })).toBe(true);
    const modified = await store.find(username);
    expect(modified?.account.role).toBe('Chemist');
    expect(modified?.account.authVersion).toBe(2);
    expect(await store.update(created.id, { active: false })).toBe(true);
    expect((await store.find(username))?.account.active).toBe(false);
    expect((await store.list()).some(a => a.id === created.id)).toBe(true);
  });

  it('revokes an existing staff session when the developer disables that user', async () => {
    const store = new StaffAccountStore(() => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    }));
    await store.ensureTable();
    const username = 'revoked_' + Date.now().toString(36);
    const created = await store.create(username, 'Very-strong-test-password-7822!', 'Receptionist');
    const app = express();
    app.use(express.json());
    installApiSecurity(app, store);
    app.get('/api/mysql/pull-all', (_req, res) => res.json({ ok: true }));
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + address.port;
      const login = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'Very-strong-test-password-7822!' }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      const me = await fetch(base + '/api/auth/session', { headers: { cookie } });
      expect((await me.json()).role).toBe('Receptionist');
      const legacy = await fetch(base + '/api/mysql/pull-all', { headers: { cookie } });
      expect(legacy.status).toBe(403);
      const staffAdmin = await fetch(base + '/api/auth/staff', { headers: { cookie } });
      expect(staffAdmin.status).toBe(403);
      await store.update(created.id, { active: false });
      const revoked = await fetch(base + '/api/auth/session', { headers: { cookie } });
      expect(revoked.status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('requires Developer session for user administration and never exposes password hashes', async () => {
    const store = new StaffAccountStore(() => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    }));
    await store.ensureTable();
    const previous = process.env.TLAB_ADMIN_PASSWORD;
    process.env.TLAB_ADMIN_PASSWORD = 'integration-only-developer-password-97038';
    const app = express();
    app.use(express.json());
    installApiSecurity(app, store);
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + address.port;
      const anonymous = await fetch(base + '/api/auth/staff');
      expect(anonymous.status).toBe(401);
      const adminLogin = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'developer', password: process.env.TLAB_ADMIN_PASSWORD }),
      });
      expect(adminLogin.status).toBe(200);
      const cookie = adminLogin.headers.get('set-cookie')!.split(';')[0];
      const username = 'api_ci_' + Date.now().toString(36);
      const created = await fetch(base + '/api/auth/staff', {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'Api-integration-secret-12345!', role: 'Doctor' }),
      });
      expect(created.status).toBe(201);
      const user = (await created.json()).user;
      expect(user.password_hash).toBeUndefined();
      const list = await fetch(base + '/api/auth/staff', { headers: { cookie } });
      expect(list.status).toBe(200);
      const listed = await list.text();
      expect(listed).not.toContain('password_hash');
      expect(listed).not.toContain('Api-integration-secret-12345!');
      const change = await fetch(base + '/api/auth/staff/' + user.id, {
        method: 'PATCH', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      expect(change.status).toBe(200);
      expect((await store.find(username))?.account.active).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.TLAB_ADMIN_PASSWORD;
      else process.env.TLAB_ADMIN_PASSWORD = previous;
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

});
