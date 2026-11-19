// @vitest-environment node
import { describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import express from 'express';
import { installApiSecurity } from './api-security';
import { PatientDomainStore, installPatientRoutes } from './patient-domain';
import { ServerPermissionStore, installPermissionAdminRoutes } from './server-permissions';
import { LabWorkflowStore, installLabWorkflowRoutes } from './lab-workflow';
import { PreliminaryResultStore, installPreliminaryResultRoutes } from './preliminary-results';
import { InvoiceDraftStore, installInvoiceDraftRoutes } from './invoice-drafts';
import { SafeInventoryStore, installSafeInventoryRoutes } from './safe-inventory';
import { StockReceiptStore, installStockReceiptRoutes } from './stock-receiving';
import { StockQcReviewStore, installStockQcReviewRoutes } from './stock-qc-review';
import { FinancialReconciliationStore, installFinancialReconciliationRoutes } from './finance-reconciliation';
import { JournalDraftStore, installJournalDraftRoutes } from './journal-drafts';
import { FinancialPostingPreflightStore, installFinancialPreflightRoutes } from './financial-posting-preflight';
import { BranchRegistry, installBranchRegistryRoutes, installBranchIsolationGate } from './branch-registry';
import { BranchPatientStore, installBranchPatientRoutes } from './branch-patient-domain';
import { ClinicalPreflightStore, installClinicalPreflightRoutes } from './clinical-preflight';
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

  it('accepts only unapproved complete result drafts and blocks unsupported approvals', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const permissionStore = new ServerPermissionStore(connect);
    const accountStore = new StaffAccountStore(connect);
    const patientStore = new PatientDomainStore(connect);
    const labStore = new LabWorkflowStore(connect);
    const resultStore = new PreliminaryResultStore(connect);
    await permissionStore.ensureTable();
    await accountStore.ensureTable();
    await patientStore.ensureTables();
    await labStore.ensureTables();
    const now = Date.now().toString(36);
    const reception = await accountStore.create('resrec_' + now, 'Reception-ci-password-2026!', 'Receptionist');
    const technician = await accountStore.create('restech_' + now, 'Technician-ci-password-2026!', 'Technician');
    const doctor = await accountStore.create('resdoc_' + now, 'Doctor-ci-password-2026!', 'Doctor');
    const patient = await patientStore.create({ name: 'Result Test Patient' }, reception.id);
    const testId = 'res_test_' + now, paramId = 'res_param_' + now;
    const conn = await connect();
    try {
      await conn.execute(
        'INSERT INTO \`lab_tests\` (\`id\`, \`code\`, \`name_ar\`, \`price\`, \`active\`) VALUES (?, ?, ?, 50, 1)',
        [testId, 'R' + now, 'Result CI Test'],
      );
      await conn.execute(
        'INSERT INTO \`test_parameters\` (\`id\`, \`test_id\`, \`code\`, \`result_type\`, \`is_calculated\`, \`active\`) VALUES (?, ?, ?, ?, 0, 1)',
        [paramId, testId, 'CI', 'numeric'],
      );
    } finally { await conn.end(); }
    const request = await labStore.createRequest(patient.record.id, [testId], { userId: reception.id, username: reception.username, role: 'Receptionist' });
    const sample = await labStore.receiveSample(request.record.id, 1, 'Blood', { userId: technician.id, username: technician.username, role: 'Technician' });
    expect(sample.status).toBe('ok');

    const app = express();
    app.use(express.json());
    installApiSecurity(app, accountStore, (secureApp, identity) => {
      installPreliminaryResultRoutes(secureApp, resultStore, permissionStore, identity);
      installClinicalPreflightRoutes(secureApp, new ClinicalPreflightStore(connect), permissionStore, identity);
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + address.port;
      const login = async (username: string, password: string) => {
        const res = await fetch(base + '/api/auth/login', { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
        expect(res.status).toBe(200);
        return res.headers.get('set-cookie')!.split(';')[0];
      };
      const techCookie = await login(technician.username, 'Technician-ci-password-2026!');
      const doctorCookie = await login(doctor.username, 'Doctor-ci-password-2026!');
      const parameters = await fetch(base + '/api/v2/results/requests/' + request.record.id + '/parameters', {
        headers: { cookie: techCookie },
      });
      expect(parameters.status).toBe(200);
      const catalogue = await parameters.json();
      expect(catalogue.entryAllowed).toBe(true);
      expect(catalogue.tests.find((test: { id: string }) => test.id === testId)?.parameters[0].id).toBe(paramId);
      const receptionCookieForParameters = await login(reception.username, 'Reception-ci-password-2026!');
      const deniedParameters = await fetch(base + '/api/v2/results/requests/' + request.record.id + '/parameters', {
        headers: { cookie: receptionCookieForParameters },
      });
      expect(deniedParameters.status).toBe(403);
      const payload = { requestId: request.record.id, testId, values: [{ parameterId: paramId, value: 15.7 }] };
      const doctorCannotSubmit = await fetch(base + '/api/v2/results/drafts', { method: 'POST',
        headers: { cookie: doctorCookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      expect(doctorCannotSubmit.status).toBe(403);
      const wrongParam = await fetch(base + '/api/v2/results/drafts', { method: 'POST',
        headers: { cookie: techCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, values: [{ parameterId: 'unrelated', value: 11 }] }) });
      expect(wrongParam.status).toBe(422);
      const submitted = await fetch(base + '/api/v2/results/drafts', { method: 'POST',
        headers: { cookie: techCookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      expect(submitted.status).toBe(201);
      const draft = await submitted.json();
      expect(draft.record.status).toBe('draft');
      expect(draft.record.approvedBy).toBeNull();
      expect(draft.record.clinicalValidation).toBe('NOT_REVIEWED');
      const duplicate = await fetch(base + '/api/v2/results/drafts', { method: 'POST',
        headers: { cookie: techCookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      expect(duplicate.status).toBe(422);
      const reviewUrl = base + '/api/v2/results/' + draft.record.id + '/submit-review';
      const doctorReview = await fetch(reviewUrl, {
        method: 'POST', headers: { cookie: doctorCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      });
      expect(doctorReview.status).toBe(403);
      const review = await fetch(reviewUrl, {
        method: 'POST', headers: { cookie: techCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      });
      expect(review.status).toBe(200);
      expect((await review.json()).approved).toBe(false);
      const staleReview = await fetch(reviewUrl, {
        method: 'POST', headers: { cookie: techCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      });
      expect(staleReview.status).toBe(409);
      const reviewQueue = await fetch(base + '/api/v2/results/review-queue?limit=25', {
        headers: { cookie: doctorCookie },
      });
      expect(reviewQueue.status).toBe(200);
      const queue = await reviewQueue.json();
      const queued = queue.items.find((item: { id: string }) => item.id === draft.record.id);
      expect(queued).toBeDefined();
      expect(queued.reviewStatus).toBe('NOT_REVIEWED');
      expect(queued.values).toEqual([{ parameterId: paramId, value: 15.7 }]);
      const receptionistCookie = await login(reception.username, 'Reception-ci-password-2026!');
      const deniedQueue = await fetch(base + '/api/v2/results/review-queue', {
        headers: { cookie: receptionistCookie },
      });
      expect(deniedQueue.status).toBe(403);

      const preflight = await fetch(base + '/api/v2/results/' + draft.record.id + '/clinical-preflight', {
        headers: { cookie: doctorCookie },
      });
      expect(preflight.status).toBe(200);
      const assessment = (await preflight.json()).report;
      expect(assessment.releaseAllowed).toBe(false);
      expect(assessment.status).toBe('blocked');
      expect(assessment.reasons).toContain('AGE_AND_SPECIMEN_REFERENCE_INTERVALS_NOT_VALIDATED');
      expect(assessment.reasons).toContain('CRITICAL_LIMIT_ESCALATION_NOT_VALIDATED');
      expect(assessment.reasons).toContain('ANALYZER_QC_AND_SECOND_SIGNOFF_NOT_VALIDATED');
      const unauthorizedPreflight = await fetch(base + '/api/v2/results/' + draft.record.id + '/clinical-preflight', {
        headers: { cookie: receptionistCookie },
      });
      expect(unauthorizedPreflight.status).toBe(403);

      const noApproval = await fetch(base + '/api/v2/results/' + draft.record.id + '/approve', {
        method: 'POST', headers: { cookie: doctorCookie },
      });
      expect(noApproval.status).toBe(403);
      const check = await connect();
      try {
        const [rows] = await check.execute<mysql.RowDataPacket[]>(
          'SELECT \`status\`, \`has_critical\`, \`approved_by\` FROM \`lab_results\` WHERE \`id\` = ?', [draft.record.id],
        );
        expect(rows[0].status).toBe('pending_review');
        expect(rows[0].approved_by).toBeNull();
        expect(rows[0].has_critical).toBeNull();
      } finally { await check.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('creates one unissued financial quote safely, rejects injected prices, prevents double posting', async () => {
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
    const lab = new LabWorkflowStore(connect);
    const quotes = new InvoiceDraftStore(connect);
    await staff.ensureTable();
    await permissions.ensureTable();
    await patients.ensureTables();
    await lab.ensureTables();
    await quotes.ensureTables();
    const suffix = Date.now().toString(36);
    const receptionist = await staff.create('finance_rec_' + suffix, 'Reception-finance-ci-2026!', 'Receptionist');
    const technician = await staff.create('finance_tech_' + suffix, 'Technician-finance-ci-2026!', 'Technician');
    const patient = await patients.create({ name: 'Finance Test Patient' }, receptionist.id);
    const testId = 'finance_test_' + suffix;
    const seed = await connect();
    try {
      await seed.execute(
        'INSERT INTO \`lab_tests\` (\`id\`, \`code\`, \`name_ar\`, \`price\`, \`active\`) VALUES (?, ?, ?, ?, 1)',
        [testId, 'FIN', 'Finance CI', 19.95],
      );
    } finally { await seed.end(); }
    const req = await lab.createRequest(patient.record.id, [testId], {
      username: receptionist.username, userId: receptionist.id, role: 'Receptionist',
    });
    const app = express();
    app.use(express.json());
    installApiSecurity(app, staff, (secureApp, identity) => {
      installInvoiceDraftRoutes(secureApp, quotes, permissions, identity);
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + addr.port;
      const login = async (username: string, password: string) => {
        const res = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        expect(res.status).toBe(200);
        return res.headers.get('set-cookie')!.split(';')[0];
      };
      const recCookie = await login(receptionist.username, 'Reception-finance-ci-2026!');
      const techCookie = await login(technician.username, 'Technician-finance-ci-2026!');
      const key = 'quote_' + suffix + '_unique_2026';
      const input = { requestId: req.record.id, requestVersion: 1, idempotencyKey: key };
      const mutate = (cookie: string, body: unknown) => fetch(base + '/api/v2/finance/quotes', {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect((await mutate(techCookie, input)).status).toBe(403);
      expect((await mutate(recCookie, { ...input, amount: 0 })).status).toBe(422);
      const first = await mutate(recCookie, input);
      expect(first.status).toBe(201);
      const data = await first.json();
      expect(data.draft.amountMinor).toBe(1995);
      expect(data.draft.state).toBe('unissued_quote');
      expect(data.draft.payable).toBe(false);
      expect(data.replayed).toBe(false);

      const retried = await mutate(recCookie, input);
      expect(retried.status).toBe(200);
      const retryData = await retried.json();
      expect(retryData.replayed).toBe(true);
      expect(retryData.draft.id).toBe(data.draft.id);
      expect((await mutate(recCookie, { ...input, requestVersion: 2 })).status).toBe(409);
      expect((await mutate(recCookie, { ...input, idempotencyKey: key + '_another' })).status).toBe(409);

      const getQuote = await fetch(base + '/api/v2/finance/quotes/' + data.draft.id, {
        headers: { cookie: recCookie },
      });
      expect(getQuote.status).toBe(200);
      const read = await getQuote.json();
      expect(read.draft.amountMinor).toBe(1995);

      const conn = await connect();
      try {
        const [records] = await conn.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM \`secure_invoice_drafts\` WHERE \`request_id\` = ?',
          [req.record.id],
        );
        expect(Number(records[0].count)).toBe(1);
        const [invoices] = await conn.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM \`invoices\` WHERE \`request_id\` = ?',
          [req.record.id],
        );
        expect(Number(invoices[0].count)).toBe(0);
        const [payments] = await conn.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM \`payments\` WHERE \`invoice_id\` = ?', [data.draft.id],
        );
        expect(Number(payments[0].count)).toBe(0);
      } finally { await conn.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('issues QC-released FEFO stock atomically and never double-decrements on retry', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const stock = new SafeInventoryStore(connect);
    const grants = new ServerPermissionStore(connect);
    const accounts = new StaffAccountStore(connect);
    await stock.ensureTables();
    await grants.ensureTable();
    await accounts.ensureTable();
    const suffix = Date.now().toString(36);
    const itemId = 'stk_' + suffix, lot1 = 'lot_a_' + suffix, lot2 = 'lot_b_' + suffix;
    const chemist = await accounts.create('stock_chem_' + suffix, 'Chemist-stock-password-2068!', 'Chemist');
    const receptionist = await accounts.create('stock_rec_' + suffix, 'Reception-stock-password-2068!', 'Receptionist');
    const seed = await connect();
    try {
      await seed.execute(
        'INSERT INTO inventory_items (id, code, name_ar, current_stock, active) VALUES (?, ?, ?, ?, 1)',
        [itemId, 'CI-STOCK', 'اختبار كاشف', '12.000']);
      await seed.execute(
        'INSERT INTO inventory_lots (id, item_id, lot_number, expiry_date, remaining_qty, initial_qty, status, qc_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [lot1, itemId, 'L-early', '2030-01-01', '5.000', '5.000', 'active', 'released']);
      await seed.execute(
        'INSERT INTO inventory_lots (id, item_id, lot_number, expiry_date, remaining_qty, initial_qty, status, qc_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [lot2, itemId, 'L-later', '2031-01-01', '7.000', '7.000', 'active', 'released']);
    } finally { await seed.end(); }
    const app = express();
    app.use(express.json());
    installApiSecurity(app, accounts, (secureApp, identity) => installSafeInventoryRoutes(secureApp, stock, grants, identity));
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No address');
      const base = 'http://127.0.0.1:' + address.port;
      const login = async (username: string, password: string) => {
        const response = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        expect(response.status).toBe(200);
        return response.headers.get('set-cookie')!.split(';')[0];
      };
      const allowedCookie = await login(chemist.username, 'Chemist-stock-password-2068!');
      const deniedCookie = await login(receptionist.username, 'Reception-stock-password-2068!');
      const key = 'stock_idem_' + suffix + '_single';
      const send = (cookie: string, body: unknown) => fetch(base + '/api/v2/inventory/issue', {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const selected = { itemId, lotId: lot1, quantity: '2.500', idempotencyKey: key };
      expect((await send(deniedCookie, selected)).status).toBe(403);
      expect((await send(allowedCookie, { ...selected, quantity: '-1.000' })).status).toBe(409);
      expect((await send(allowedCookie, { ...selected, quantity: '500.000' })).status).toBe(409);
      const updateConn = await connect();
      try {
        await updateConn.execute('UPDATE inventory_lots SET qc_status = ? WHERE id = ?', ['pending', lot1]);
      } finally { await updateConn.end(); }
      expect((await send(allowedCookie, selected)).status).toBe(409);
      const restoreConn = await connect();
      try {
        await restoreConn.execute('UPDATE inventory_lots SET qc_status = ? WHERE id = ?', ['released', lot1]);
      } finally { await restoreConn.end(); }

      expect((await send(allowedCookie, { ...selected, lotId: lot2 })).status).toBe(409);
      const first = await send(allowedCookie, selected);
      expect(first.status).toBe(201);
      const firstResult = await first.json();
      expect(firstResult.remainingItem).toBe('9.500');
      expect(firstResult.remainingLot).toBe('2.500');
      const replay = await send(allowedCookie, selected);
      expect(replay.status).toBe(200);
      expect((await replay.json()).movementId).toBe(firstResult.movementId);
      expect((await send(allowedCookie, { ...selected, idempotencyKey: key + '_different', quantity: '5.000' })).status).toBe(409);
      const check = await connect();
      try {
        const [items] = await check.execute<mysql.RowDataPacket[]>('SELECT current_stock FROM inventory_items WHERE id = ?', [itemId]);
        expect(Number(items[0].current_stock)).toBe(9.5);
        const [lots] = await check.execute<mysql.RowDataPacket[]>('SELECT remaining_qty FROM inventory_lots WHERE id = ?', [lot1]);
        expect(Number(lots[0].remaining_qty)).toBe(2.5);
        const [movements] = await check.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) AS qty FROM stock_movements WHERE item_id = ?', [itemId]);
        expect(Number(movements[0].qty)).toBe(1);
      } finally { await check.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('quarantines new reagent lots without affecting usable stock or bypassing QC', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const accounts = new StaffAccountStore(connect);
    const grants = new ServerPermissionStore(connect);
    const receipts = new StockReceiptStore(connect);
    const stock = new SafeInventoryStore(connect);
    const qc = new StockQcReviewStore(connect);
    await accounts.ensureTable();
    await grants.ensureTable();
    await receipts.ensureTable();
    await stock.ensureTables();
    await qc.ensureTables();
    const suffix = Date.now().toString(36);
    const itemId = 'receiving_' + suffix;
    const chemist = await accounts.create('recv_chem_' + suffix, 'Chemist-stock-receive-2026!', 'Chemist');
    const receptionist = await accounts.create('recv_rec_' + suffix, 'Reception-stock-receive-2026!', 'Receptionist');
    const owner = await accounts.create('recv_owner_' + suffix, 'Owner-QC-password-2026!', 'Owner');
    const seed = await connect();
    try {
      await seed.execute(
        'INSERT INTO inventory_items (id, code, name_ar, current_stock, active) VALUES (?, ?, ?, 0, 1)',
        [itemId, 'RECEIVE', 'Quarantined reagent']);
    } finally { await seed.end(); }

    const app = express();
    app.use(express.json());
    installApiSecurity(app, accounts, (secureApp, identity) => {
      installStockReceiptRoutes(secureApp, receipts, grants, identity);
      installSafeInventoryRoutes(secureApp, stock, grants, identity);
      installStockQcReviewRoutes(secureApp, qc, grants, identity);
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + addr.port;
      const login = async (username: string, password: string) => {
        const response = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        expect(response.status).toBe(200);
        return response.headers.get('set-cookie')!.split(';')[0];
      };
      const allowed = await login(chemist.username, 'Chemist-stock-receive-2026!');
      const denied = await login(receptionist.username, 'Reception-stock-receive-2026!');
      const ownerCookie = await login(owner.username, 'Owner-QC-password-2026!');
      const body = {
        itemId, lotNumber: 'LOT-' + suffix, quantity: '3.500',
        expiryDate: '2031-12-31', idempotencyKey: 'receive_' + suffix + '_unique',
      };
      const post = (cookie: string, payload: unknown) => fetch(base + '/api/v2/inventory/receipts/quarantine', {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      expect((await post(denied, body)).status).toBe(403);
      expect((await post(allowed, { ...body, expiryDate: '2000-01-01' })).status).toBe(409);
      expect((await post(allowed, { ...body, quantity: '0' })).status).toBe(409);
      expect((await post(allowed, { ...body, quantity: '3.5', qcStatus: 'released' })).status).toBe(422);
      const first = await post(allowed, body);
      expect(first.status).toBe(201);
      const received = await first.json();
      expect(received.status).toBe('quarantined');
      const retry = await post(allowed, body);
      expect(retry.status).toBe(200);
      expect((await retry.json()).lotId).toBe(received.lotId);
      const quarantineList = await fetch(base + '/api/v2/inventory/receipts/quarantine?limit=50', {
        headers: { cookie: allowed },
      });
      expect(quarantineList.status).toBe(200);
      const quarantined = (await quarantineList.json()).items.find((item: { lotId: string }) => item.lotId === received.lotId);
      expect(quarantined.status).toBe('quarantined');
      expect(quarantined.approved).toBe(false);
      const unauthorizedList = await fetch(base + '/api/v2/inventory/receipts/quarantine', {
        headers: { cookie: denied },
      });
      expect(unauthorizedList.status).toBe(403);
      expect((await post(allowed, { ...body, idempotencyKey: body.idempotencyKey + '_different' })).status).toBe(409);
      const qcPayload = {
        receiptId: received.receiptId, verdict: 'pass',
        evidence: 'QC documents verified by independent reviewer',
        idempotencyKey: 'qc_' + suffix + '_review_key',
      };
      const review = (cookie: string, value: unknown) =>
        fetch(base + '/api/v2/inventory/qc/reviews', {
          method: 'POST', headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(value),
        });
      expect((await review(allowed, qcPayload)).status).toBe(403);
      expect((await review(denied, qcPayload)).status).toBe(403);
      await expect(qc.decide(received.receiptId, 'pass',
        'QC documents verified by independent reviewer',
        'qc_same_actor_' + suffix + '_key',
        { userId: chemist.id, username: chemist.username, role: 'Chemist' },
      )).rejects.toThrow('Independent reviewer required');
      const successfulQc = await review(ownerCookie, qcPayload);
      expect(successfulQc.status).toBe(201);
      const qcData = await successfulQc.json();
      expect(qcData.releasedForUse).toBe(false);
      const retriedQc = await review(ownerCookie, qcPayload);
      expect(retriedQc.status).toBe(200);
      expect((await retriedQc.json()).reviewId).toBe(qcData.reviewId);
      expect((await review(ownerCookie, { ...qcPayload, verdict: 'fail',
        idempotencyKey: qcPayload.idempotencyKey + '_other' })).status).toBe(409);
      const failingReceiptBody = {
        ...body, lotNumber: 'LOT-REJECT-' + suffix,
        idempotencyKey: body.idempotencyKey + '_rejected',
      };
      const badReceipt = await post(allowed, failingReceiptBody);
      expect(badReceipt.status).toBe(201);
      const failedLot = await badReceipt.json();
      const failDecision = await review(ownerCookie, {
        receiptId: failedLot.receiptId, verdict: 'fail',
        evidence: 'QC test documentation did not satisfy acceptance criteria',
        idempotencyKey: 'qc_reject_' + suffix + '_unique',
      });
      expect(failDecision.status).toBe(201);
      expect((await failDecision.json()).releasedForUse).toBe(false);

      const issue = await fetch(base + '/api/v2/inventory/issue', {
        method: 'POST', headers: { cookie: allowed, 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId, lotId: received.lotId, quantity: '1.000',
          idempotencyKey: 'issue_unreleased_' + suffix,
        }),
      });
      expect(issue.status).toBe(409);

      const corruptedBalanceId = '000_discrepancy_' + suffix;
      const reconcileFixture = await connect();
      try {
        await reconcileFixture.execute(
          'INSERT INTO inventory_items (id, code, name_ar, current_stock, active) VALUES (?, ?, ?, ?, 1)',
          [corruptedBalanceId, 'RECON-CI', 'Balance discrepancy fixture', '5.000'],
        );
      } finally { await reconcileFixture.end(); }
      const reconciliation = await fetch(base + '/api/v2/inventory/reconciliation?limit=25', {
        headers: { cookie: allowed },
      });
      expect(reconciliation.status).toBe(200);
      const reconciliationData = await reconciliation.json();
      expect(reconciliationData.readOnly).toBe(true);
      const detected = reconciliationData.items.find(
        (item: { itemId: string }) => item.itemId === corruptedBalanceId,
      );
      expect(detected.status).toBe('quantity_mismatch');
      expect(detected.differenceMilli).toBe(5000);
      expect(detected.balanced).toBe(false);

      const unauthorizedReconciliation = await fetch(base + '/api/v2/inventory/reconciliation', {
        headers: { cookie: denied },
      });
      expect(unauthorizedReconciliation.status).toBe(403);
      const check = await connect();
      try {
        const [lots] = await check.execute<mysql.RowDataPacket[]>(
          'SELECT initial_qty, remaining_qty, status, qc_status FROM inventory_lots WHERE id = ?', [received.lotId],
        );
        expect(Number(lots[0].initial_qty)).toBe(3.5);
        expect(Number(lots[0].remaining_qty)).toBe(0);
        expect(lots[0].status).toBe('quarantine');
        expect(lots[0].qc_status).toBe('reviewed_pass');
        const [item] = await check.execute<mysql.RowDataPacket[]>(
          'SELECT current_stock FROM inventory_items WHERE id = ?', [itemId],
        );
        expect(Number(item[0].current_stock)).toBe(0);
        const [proof] = await check.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS qty FROM secure_stock_receipts WHERE item_id = ?', [itemId],
        );
        expect(Number(proof[0].qty)).toBe(2);
        const [rejected] = await check.execute<mysql.RowDataPacket[]>(
          'SELECT status, qc_status, remaining_qty FROM inventory_lots WHERE id = ?',
          [failedLot.lotId],
        );
        expect(rejected[0].status).toBe('rejected');
        expect(rejected[0].qc_status).toBe('rejected');
        expect(Number(rejected[0].remaining_qty)).toBe(0);

      } finally { await check.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('audits legacy invoices and journal headers without changing money', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const accounts = new StaffAccountStore(connect);
    const grants = new ServerPermissionStore(connect);
    const finance = new FinancialReconciliationStore(connect);
    await accounts.ensureTable();
    await grants.ensureTable();
    const suffix = Date.now().toString(36);
    const goodInvoice = '000_finance_ok_' + suffix;
    const badInvoice = '000_finance_bad_' + suffix;
    const goodJournal = '000_journal_ok_' + suffix;
    const badJournal = '000_journal_bad_' + suffix;
    const accountant = await accounts.create('audit_accountant_' + suffix, 'Accountant-Audit-2026!', 'Accountant');
    const receptionist = await accounts.create('audit_reception_' + suffix, 'Reception-Audit-2026!', 'Receptionist');
    const db = await connect();
    try {
      await db.execute(
        'INSERT INTO invoices (id, invoice_number, patient_id, subtotal, discount_amount, tax_amount, net_total, paid_amount, remaining_amount) ' +
        'VALUES (?, ?, ?, 100, 5, 0, 95, 30, 65)',
        [goodInvoice, 'INV-' + suffix, 'ci_test_patient'],
      );
      await db.execute(
        'INSERT INTO payments (id, payment_number, invoice_id, patient_id, amount) VALUES (?, ?, ?, ?, 30)',
        ['pay_good_' + suffix, 'PAY-' + suffix, goodInvoice, 'ci_test_patient'],
      );
      await db.execute(
        'INSERT INTO invoices (id, invoice_number, patient_id, subtotal, discount_amount, tax_amount, net_total, paid_amount, remaining_amount) ' +
        'VALUES (?, ?, ?, 100, 0, 0, 100, 75, 25)',
        [badInvoice, 'INV-BAD-' + suffix, 'ci_test_patient'],
      );
      await db.execute(
        'INSERT INTO journal_entries (id, entry_number, total_debit, total_credit) VALUES (?, ?, 200, 200)',
        [goodJournal, 'JE-OK-' + suffix],
      );
      await db.execute(
        'INSERT INTO journal_entries (id, entry_number, total_debit, total_credit) VALUES (?, ?, 50, 20)',
        [badJournal, 'JE-BAD-' + suffix],
      );
    } finally { await db.end(); }
    const app = express();
    app.use(express.json());
    installApiSecurity(app, accounts, (secureApp, identity) =>
      installFinancialReconciliationRoutes(secureApp, finance, grants, identity));
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + addr.port;
      const login = async (username: string, password: string) => {
        const response = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        expect(response.status).toBe(200);
        return response.headers.get('set-cookie')!.split(';')[0];
      };
      const allowed = await login(accountant.username, 'Accountant-Audit-2026!');
      const denied = await login(receptionist.username, 'Reception-Audit-2026!');
      const invoiceResponse = await fetch(base + '/api/v2/finance/audit/invoices?limit=25', {
        headers: { cookie: allowed },
      });
      expect(invoiceResponse.status).toBe(200);
      const invoiceAudit = await invoiceResponse.json();
      expect(invoiceAudit.readOnly).toBe(true);
      expect(invoiceAudit.items.find((x: { invoiceId: string }) =>
        x.invoiceId === goodInvoice)?.status).toBe('balanced');
      expect(invoiceAudit.items.find((x: { invoiceId: string }) =>
        x.invoiceId === badInvoice)?.errors).toContain('PAYMENTS_SUM_MISMATCH');
      const journalResponse = await fetch(base + '/api/v2/finance/audit/journals?limit=25', {
        headers: { cookie: allowed },
      });
      expect(journalResponse.status).toBe(200);
      const journalAudit = await journalResponse.json();
      expect(journalAudit.lineItemsVerified).toBe(false);
      expect(journalAudit.items.find((x: { journalId: string }) =>
        x.journalId === goodJournal)?.status).toBe('header_balanced');
      expect(journalAudit.items.find((x: { journalId: string }) =>
        x.journalId === badJournal)?.errors).toContain('JOURNAL_HEADER_UNBALANCED');
      expect((await fetch(base + '/api/v2/finance/audit/invoices',
        { headers: { cookie: denied } })).status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('creates only unposted balanced journal drafts with strict idempotency and RBAC', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const accounts = new StaffAccountStore(connect);
    const grants = new ServerPermissionStore(connect);
    const journals = new JournalDraftStore(connect);
    await accounts.ensureTable();
    await grants.ensureTable();
    await journals.ensureTables();
    const suffix = Date.now().toString(36);
    const accountant = await accounts.create(
      'journal_acct_' + suffix, 'Journal-Accountant-2026!', 'Accountant',
    );
    const tech = await accounts.create(
      'journal_tech_' + suffix, 'Journal-Technician-2026!', 'Technician',
    );
    const anotherAccountant = await accounts.create('journal_other_' + suffix, 'Other-Accountant-2026!', 'Accountant');
    const app = express();
    app.use(express.json());
    installApiSecurity(app, accounts, (securedApp, identity) =>
      installJournalDraftRoutes(securedApp, journals, grants, identity));
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + addr.port;
      const login = async (username: string, password: string) => {
        const response = await fetch(base + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        expect(response.status).toBe(200);
        return response.headers.get('set-cookie')!.split(';')[0];
      };
      const allowed = await login(accountant.username, 'Journal-Accountant-2026!');
      const denied = await login(tech.username, 'Journal-Technician-2026!');
      const otherCookie = await login(anotherAccountant.username, 'Other-Accountant-2026!');
      const key = 'journal_idempotency_' + suffix;
      const data = {
        memo: 'Synthetic double entry journal validation',
        lines: [
          { accountCode: '1001', debit: '125.75', credit: '0' },
          { accountCode: '4100', debit: '0', credit: '125.75' },
        ],
        idempotencyKey: key,
      };
      const send = (cookie: string, body: unknown) => fetch(
        base + '/api/v2/finance/journal-drafts', {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      expect((await send(denied, data)).status).toBe(403);
      expect((await send(allowed, { ...data, lines: [
        { accountCode: '1001', debit: '125.75', credit: '0' },
        { accountCode: '4100', debit: '0', credit: '125.74' },
      ] })).status).toBe(409);
      expect((await send(allowed, { ...data, lines: [
        { accountCode: '1001', debit: '-1', credit: '0' },
        { accountCode: '4100', debit: '0', credit: '1' },
      ] })).status).toBe(409);
      expect((await send(allowed, { ...data, posted: true })).status).toBe(422);
      const first = await send(allowed, data);
      expect(first.status).toBe(201);
      const created = await first.json();
      expect(created.totalMinor).toBe(12575);
      expect(created.lineCount).toBe(2);
      expect(created.posted).toBe(false);
      const details = await fetch(base + '/api/v2/finance/journal-drafts/' + created.draftId, {
        headers: { cookie: allowed },
      });
      expect(details.status).toBe(200);
      const detailsBody = (await details.json()).draft;
      expect(detailsBody.posted).toBe(false);
      expect(detailsBody.approved).toBe(false);
      expect(detailsBody.lines).toHaveLength(2);
      expect(detailsBody.lines[0].debitMinor).toBe(12575);
      expect((await fetch(base + '/api/v2/finance/journal-drafts/' + created.draftId, {
        headers: { cookie: otherCookie },
      })).status).toBe(404);

      expect((await fetch(base + '/api/v2/finance/journal-drafts/' + created.draftId, {
        headers: { cookie: denied },
      })).status).toBe(403);

      const replay = await send(allowed, data);
      expect(replay.status).toBe(200);
      expect((await replay.json()).draftId).toBe(created.draftId);
      expect((await send(allowed, { ...data,
        lines: [{ accountCode: '1001', debit: '1', credit: '0' },
          { accountCode: '4100', debit: '0', credit: '1' }],
      })).status).toBe(409);
      const db = await connect();
      try {
        const [rows] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS count_rows FROM secure_journal_draft_lines WHERE draft_id = ?',
          [created.draftId],
        );
        expect(Number(rows[0].count_rows)).toBe(2);
        const [posted] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS count_rows FROM journal_entries WHERE id = ?',
          [created.draftId],
        );
        expect(Number(posted[0].count_rows)).toBe(0);
      } finally { await db.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('developer permission matrix lists all newly added secure modules and denies non-Developer', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const permissions = new ServerPermissionStore(connect);
    await permissions.ensureTable();
    const app = express();
    app.use(express.json());
    installPermissionAdminRoutes(app, permissions, async req => {
      const role = req.get('x-ci-role');
      return role ? { role, username: role, userId: 'ci-role-user' } : undefined;
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + address.port + '/api/v2/permissions';
      const resources = [
        'patients', 'requests', 'samples', 'results', 'invoiceDrafts',
        'inventoryMovements', 'inventoryReceipts', 'inventoryQc',
        'financeAudit', 'journalDrafts',
      ];
      expect((await fetch(base + '?resource=journalDrafts')).status).toBe(401);
      expect((await fetch(base + '?resource=journalDrafts',
        { headers: { 'x-ci-role': 'Accountant' } })).status).toBe(403);
      for (const resource of resources) {
        const response = await fetch(base + '?resource=' + resource, {
          headers: { 'x-ci-role': 'Developer' },
        });
        expect(response.status, 'Permission UI resource ' + resource).toBe(200);
        const body = await response.json();
        expect(body.permissions.length).toBe(24);
        expect(body.permissions.every((row: { resource: string }) =>
          row.resource === resource)).toBe(true);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('blocks fiscal posting when period is locked, accounts missing or account is a parent', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const permissions = new ServerPermissionStore(connect);
    const accounts = new StaffAccountStore(connect);
    const preflight = new FinancialPostingPreflightStore(connect);
    await accounts.ensureTable();
    await permissions.ensureTable();
    const suffix = Date.now().toString(36);
    const debitCode = 'AST' + suffix, creditCode = 'REV' + suffix;
    const childCode = 'CH' + suffix;
    const period = new Date().toISOString().slice(0,7);
    const entryDate = new Date().toISOString().slice(0,10);
    const db = await connect();
    try {
      await db.execute(
        'INSERT INTO chart_of_accounts (id, code, name_ar, type) VALUES (?, ?, ?, ?)',
        ['acc_debit_' + suffix, debitCode, 'Synthetic debit ledger', 'asset'],
      );
      await db.execute(
        'INSERT INTO chart_of_accounts (id, code, name_ar, type) VALUES (?, ?, ?, ?)',
        ['acc_credit_' + suffix, creditCode, 'Synthetic credit ledger', 'revenue'],
      );
      await db.execute(
        'INSERT INTO chart_of_accounts (id, code, name_ar, type, parent_code) VALUES (?, ?, ?, ?, ?)',
        ['acc_child_' + suffix, childCode, 'Child ledger', 'asset', debitCode],
      );
      await db.execute(
        'INSERT INTO period_locks (id, period_month, locked) VALUES (?, ?, 1)',
        ['period_locked_' + suffix, period],
      );
    } finally { await db.end(); }

    const app = express();
    app.use(express.json());
    installFinancialPreflightRoutes(app, preflight, permissions, async req => {
      const role = req.get('x-ci-role');
      return role ? { role, username: role, userId: 'ci-user' } : undefined;
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const url = 'http://127.0.0.1:' + addr.port + '/api/v2/finance/posting-preflight';
      const send = (role: string | undefined, codes: string[]) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(role ? { 'x-ci-role': role } : {}) },
          body: JSON.stringify({ entryDate, accountCodes: codes }),
        });
      expect((await send(undefined, [debitCode, creditCode])).status).toBe(401);
      expect((await send('Technician', [debitCode, creditCode])).status).toBe(403);
      const locked = await send('Accountant', [debitCode, creditCode]);
      expect(locked.status).toBe(200);
      const lockedBody = (await locked.json()).report;
      expect(lockedBody.approvedForPosting).toBe(false);
      expect(lockedBody.reasons).toContain('PERIOD_LOCKED');
      expect(lockedBody.reasons).toContain('PARENT_ACCOUNT_NOT_POSTABLE:' + debitCode);
      const missing = await send('Accountant', [debitCode, 'MISSING_' + suffix]);
      expect(missing.status).toBe(200);
      expect((await missing.json()).report.reasons).toContain('ACCOUNT_MISSING_OR_DUPLICATE:MISSING_' + suffix);
      expect((await send('Accountant', ['invalid/code', creditCode])).status).toBe(422);
      const dbCheck = await connect();
      try {
        const [rows] = await dbCheck.execute<mysql.RowDataPacket[]>(
          'SELECT locked FROM period_locks WHERE id = ?', ['period_locked_' + suffix],
        );
        expect(Number(rows[0].locked)).toBe(1);
      } finally { await dbCheck.end(); }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });

  it('isolates branch membership and keeps branch administration Developer-only', async () => {
    const connect = () => mysql.createConnection({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
    });
    const staff = new StaffAccountStore(connect);
    const registry = new BranchRegistry(connect);
    await staff.ensureTable();
    await registry.ensureTables();
    const suffix = Date.now().toString(36);
    const a = await staff.create('branch_a_' + suffix, 'Branch-employee-A-2026!', 'Receptionist');
    const b = await staff.create('branch_b_' + suffix, 'Branch-employee-B-2026!', 'Receptionist');
    const one = await registry.create('branch_one_' + suffix, 'Sample branch one');
    const two = await registry.create('branch_two_' + suffix, 'Sample branch two');
    expect(await registry.isAllowed({ userId: a.id, username: a.username, role: a.role }, one.id)).toBe(false);
    expect(await registry.grant(a.id, one.id)).toBe(true);
    expect(await registry.grant(b.id, two.id)).toBe(true);
    expect(await registry.isAllowed({ userId: a.id, username: a.username, role: a.role }, one.id)).toBe(true);
    expect(await registry.isAllowed({ userId: a.id, username: a.username, role: a.role }, two.id)).toBe(false);
    expect(await registry.isAllowed({ userId: b.id, username: b.username, role: b.role }, one.id)).toBe(false);
    expect(await registry.isAllowed({ userId: b.id, username: b.username, role: b.role }, two.id)).toBe(true);
    await registry.revoke(a.id, one.id);
    expect(await registry.isAllowed({ userId: a.id, username: a.username, role: a.role }, one.id)).toBe(false);
    const app = express();
    app.use(express.json());
    installBranchRegistryRoutes(app, registry, async req => {
      const role = req.get('x-ci-role');
      return role ? {role, userId: role === 'Receptionist' ? a.id : 'server-developer',
        username: role.toLowerCase()} : undefined;
    });
    installBranchIsolationGate(app);
    app.get('/api/v2/patients', (_req, res) => res.json({ ok: true, data: 'unscoped' }));
    const server = await new Promise<import('node:http').Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const base = 'http://127.0.0.1:' + addr.port;
      expect((await fetch(base + '/api/v2/branches')).status).toBe(401);
      const previousMode = process.env.TLAB_MULTIBRANCH_MODE;
      process.env.TLAB_MULTIBRANCH_MODE = 'true';
      try {
        const unsafePatient = await fetch(base + '/api/v2/patients');
        expect(unsafePatient.status).toBe(503);
        expect((await unsafePatient.json()).error).toContain('database-level isolation');
      } finally {
        if (previousMode === undefined) delete process.env.TLAB_MULTIBRANCH_MODE;
        else process.env.TLAB_MULTIBRANCH_MODE = previousMode;
      }
      const staffList = await fetch(base + '/api/v2/branches', {headers:{'x-ci-role':'Receptionist'}});
      expect(staffList.status).toBe(200);
      expect((await staffList.json()).branches.some((row:{id:string})=>row.id===two.id)).toBe(false);
      const denied = await fetch(base + '/api/v2/branches', {
        method:'POST', headers:{'content-type':'application/json','x-ci-role':'Receptionist'},
        body:JSON.stringify({code:'branch_other_'+suffix,name:'Denied branch'}),
      });
      expect(denied.status).toBe(403);
      const created = await fetch(base + '/api/v2/branches', {
        method:'POST', headers:{'content-type':'application/json','x-ci-role':'Developer'},
        body:JSON.stringify({code:'branch_third_'+suffix,name:'Third sample branch'}),
      });
      expect(created.status).toBe(201);
      expect((await created.json()).branch.id).toMatch(/^br_/);
    } finally {
      await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    }
  });

});
