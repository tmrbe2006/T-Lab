// @vitest-environment node
import { describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import express from 'express';
import { installApiSecurity } from './api-security';
import { PatientDomainStore, installPatientRoutes } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';
import { LabWorkflowStore, installLabWorkflowRoutes } from './lab-workflow';
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

  it('enforces clinical RBAC and optimistic versions on MySQL 5.5 patient records', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const staff = new StaffAccountStore(connect);
    const permissions = new ServerPermissionStore(connect);
    const patients = new PatientDomainStore(connect);
    await staff.ensureTable();
    await permissions.ensureTable();
    await patients.ensureTables();
    const username = 'patient_ci_' + Date.now().toString(36);
    const account = await staff.create(username, 'Clinic-test-password-98241!', 'Receptionist');

    const app = express();
    app.use(express.json());
    installApiSecurity(app, staff, (secureApp, resolveIdentity) => {
      installPatientRoutes(secureApp, patients, permissions, resolveIdentity);
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + address.port;
      const login = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'Clinic-test-password-98241!' }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      const headers = { cookie, 'content-type': 'application/json' };

      const created = await fetch(base + '/api/v2/patients', {
        method: 'POST', headers, body: JSON.stringify({ name: 'Patient Test', phone: '0100000000', gender: 'female' }),
      });
      expect(created.status).toBe(201);
      const record = await created.json();
      expect(record.version).toBe(1);
      const id = record.record.id as string;

      const firstEdit = await fetch(base + '/api/v2/patients/' + id, {
        method: 'PATCH', headers, body: JSON.stringify({ version: 1, changes: { name: 'Patient Updated' } }),
      });
      expect(firstEdit.status).toBe(200);
      expect((await firstEdit.json()).version).toBe(2);

      const staleEdit = await fetch(base + '/api/v2/patients/' + id, {
        method: 'PATCH', headers, body: JSON.stringify({ version: 1, changes: { name: 'Silent Overwrite' } }),
      });
      expect(staleEdit.status).toBe(409);

      const noDelete = await fetch(base + '/api/v2/patients/' + id, {
        method: 'DELETE', headers, body: JSON.stringify({ version: 2 }),
      });
      expect(noDelete.status).toBe(403);
      expect((await patients.get(id))?.record.name).toBe('Patient Updated');

      await permissions.set('Receptionist', 'patients', 'edit', false);
      const denied = await fetch(base + '/api/v2/patients/' + id, {
        method: 'PATCH', headers, body: JSON.stringify({ version: 2, changes: { name: 'Forbidden Edit' } }),
      });
      expect(denied.status).toBe(403);

      const conn = await connect();
      try {
        const [audit] = await conn.execute<mysql.RowDataPacket[]>(
          'SELECT `actor_id`, `operation`, `version` FROM `secure_patient_audit` WHERE `record_id` = ? ORDER BY `version`',
          [id],
        );
        expect(audit.map(row => row.operation)).toEqual(['create', 'edit']);
        expect(audit.every(row => row.actor_id === account.id)).toBe(true);
      } finally { await conn.end(); }
    } finally {
      await permissions.set('Receptionist', 'patients', 'edit', true);
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('creates a linked request and receives exactly one sample with stale-version prevention', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const permissions = new ServerPermissionStore(connect);
    const patients = new PatientDomainStore(connect);
    const lab = new LabWorkflowStore(connect);
    const staff = new StaffAccountStore(connect);
    await permissions.ensureTable();
    await patients.ensureTables();
    await lab.ensureTables();
    await staff.ensureTable();

    const receptionist = await staff.create('lab_rec_' + Date.now().toString(36), 'Reception-ci-password-2026!', 'Receptionist');
    const technician = await staff.create('lab_tech_' + Date.now().toString(36), 'Technician-ci-password-2026!', 'Technician');
    const patient = await patients.create({ name: 'Integration Laboratory Patient' }, receptionist.id);

    const testId = 'test_ci_' + Date.now().toString(36);
    const conn = await connect();
    try {
      await conn.execute(
        'INSERT INTO \`lab_tests\` (\`id\`, \`code\`, \`name_ar\`, \`price\`, \`active\`) VALUES (?, ?, ?, ?, 1)',
        [testId, 'CI', 'تحليل اختباري', 125.50],
      );
    } finally { await conn.end(); }

    const app = express();
    app.use(express.json());
    installApiSecurity(app, staff, (secureApp, identity) => {
      installLabWorkflowRoutes(secureApp, lab, permissions, identity);
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test server');
      const base = 'http://127.0.0.1:' + address.port;
      const login = async (username: string, password: string) => {
        const res = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        expect(res.status).toBe(200);
        return res.headers.get('set-cookie')!.split(';')[0];
      };
      const receptionCookie = await login(receptionist.username, 'Reception-ci-password-2026!');
      const technicianCookie = await login(technician.username, 'Technician-ci-password-2026!');
      const headers = (cookie: string) => ({ cookie, 'content-type': 'application/json' });

      const untrustedPrice = await fetch(base + '/api/v2/requests', {
        method: 'POST', headers: headers(receptionCookie),
        body: JSON.stringify({ patientId: patient.record.id, testIds: [testId], subtotal: 0 }),
      });
      expect(untrustedPrice.status).toBe(422);
      const badTest = await fetch(base + '/api/v2/requests', {
        method: 'POST', headers: headers(receptionCookie),
        body: JSON.stringify({ patientId: patient.record.id, testIds: ['unknown_test'] }),
      });
      expect(badTest.status).toBe(422);

      const requestResponse = await fetch(base + '/api/v2/requests', {
        method: 'POST', headers: headers(receptionCookie),
        body: JSON.stringify({ patientId: patient.record.id, testIds: [testId] }),
      });
      expect(requestResponse.status).toBe(201);
      const created = await requestResponse.json();
      expect(created.record.patientId).toBe(patient.record.id);
      expect(created.record.subtotal).toBe(125.5);
      expect(created.record.status).toBe('awaiting_sample');

      const technicianCannotRequest = await fetch(base + '/api/v2/requests', {
        method: 'POST', headers: headers(technicianCookie),
        body: JSON.stringify({ patientId: patient.record.id, testIds: [testId] }),
      });
      expect(technicianCannotRequest.status).toBe(403);
      const receptionCannotReceive = await fetch(base + '/api/v2/requests/' + created.record.id + '/samples/receive', {
        method: 'POST', headers: headers(receptionCookie),
        body: JSON.stringify({ version: 1, sampleType: 'Blood' }),
      });
      expect(receptionCannotReceive.status).toBe(403);

      const received = await fetch(base + '/api/v2/requests/' + created.record.id + '/samples/receive', {
        method: 'POST', headers: headers(technicianCookie),
        body: JSON.stringify({ version: 1, sampleType: 'Blood' }),
      });
      expect(received.status).toBe(201);
      const receipt = await received.json();
      expect(receipt.sample.patientId).toBe(patient.record.id);
      expect(receipt.requestVersion).toBe(2);

      const stale = await fetch(base + '/api/v2/requests/' + created.record.id + '/samples/receive', {
        method: 'POST', headers: headers(technicianCookie),
        body: JSON.stringify({ version: 1, sampleType: 'Blood' }),
      });
      expect(stale.status).toBe(409);
      const actual = await lab.getRequest(created.record.id);
      expect(actual?.record.status).toBe('sample_received');
      expect(actual?.version).toBe(2);

      const checkConn = await connect();
      try {
        const [items] = await checkConn.execute<mysql.RowDataPacket[]>(
          'SELECT \`price\` FROM \`request_items\` WHERE \`request_id\` = ?', [created.record.id],
        );
        expect(Number(items[0].price)).toBe(125.5);
        const [audit] = await checkConn.execute<mysql.RowDataPacket[]>(
          'SELECT \`operation\`, \`actor_id\` FROM \`secure_lab_audit\` WHERE \`resource\` = ? AND \`record_id\` = ? ORDER BY \`version\`',
          ['requests', created.record.id],
        );
        expect(audit.map(row => row.operation)).toEqual(['create', 'sample_received']);
        expect(audit[0].actor_id).toBe(receptionist.id);
        expect(audit[1].actor_id).toBe(technician.id);
      } finally { await checkConn.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

});
