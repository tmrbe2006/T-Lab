import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore, type SecureAction } from './server-permissions';

const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
const token = () => randomBytes(16).toString('hex');
const sqlDate = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
type QueryRow = RowDataPacket & { id: string; status: string; patient_id: string; version?: number; active?: number; price?: string; name?: string };

export class LabWorkflowStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async ensureTables(): Promise<void> {
    const conn = await this.connect();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS \`secure_lab_audit\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`resource\` VARCHAR(32) NOT NULL,
        \`record_id\` VARCHAR(64) NOT NULL,
        \`actor_id\` VARCHAR(64) NOT NULL,
        \`operation\` VARCHAR(24) NOT NULL,
        \`version\` INT NOT NULL,
        \`created_at\` DATETIME NOT NULL,
        INDEX \`idx_lab_audit_record\` (\`resource\`, \`record_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
    } finally { await conn.end(); }
  }

  // Pilot only: creates a draft request and its test items atomically.
  // Does not issue invoices, payments, results or medically approve anything.
  async createRequest(patientId: string, testIds: string[], actor: ServerIdentity) {
    if (!validId(patientId) || !Array.isArray(testIds) || testIds.length < 1 || testIds.length > 30 ||
        testIds.some(id => !validId(id)) || new Set(testIds).size !== testIds.length) {
      throw new Error('Invalid patient or test selection');
    }
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        const [patient] = await conn.execute<QueryRow[]>(
          'SELECT \`id\`, \`active\` FROM \`patients\` WHERE \`id\` = ? FOR UPDATE', [patientId]);
        if (!patient[0] || Number(patient[0].active) !== 1) {
          throw new Error('Active patient not found');
        }
        // Avoid trusting item prices supplied by the browser.
        const tests: Array<{ id: string; price: number }> = [];
        for (const testId of testIds) {
          const [found] = await conn.execute<RowDataPacket[]>(
            'SELECT \`id\`, \`price\`, \`active\` FROM \`tests\` WHERE \`id\` = ? LIMIT 1', [testId]);
          const row = found[0];
          if (!row || Number(row.active) !== 1) throw new Error('Unknown or inactive test');
          const price = Number(row.price);
          if (!Number.isFinite(price) || price < 0 || price > 10000000) throw new Error('Invalid catalogue price');
          tests.push({ id: testId, price });
        }
        const id = 'req_' + token(), requestNumber = 'REQ-' + id.slice(-12).toUpperCase();
        const timestamp = sqlDate();
        const record = {
          id, requestNumber, barcode: requestNumber, patientId, type: 'internal',
          status: 'awaiting_sample', subtotal: tests.reduce((sum, t) => sum + t.price, 0),
          createdAt: timestamp, createdBy: actor.userId, notes: '',
        };
        await conn.execute(
          'INSERT INTO \`lab_requests\` (\`id\`, \`request_number\`, \`barcode\`, \`patient_id\`, \`type\`, \`status\`, \`created_at\`, \`raw_json\`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, requestNumber, requestNumber, patientId, 'internal', 'awaiting_sample', timestamp, JSON.stringify(record)],
        );
        for (const test of tests) {
          const itemId = 'item_' + token();
          await conn.execute(
            'INSERT INTO \`request_items\` (\`id\`, \`request_id\`, \`test_id\`, \`price\`, \`raw_json\`) VALUES (?, ?, ?, ?, ?)',
            [itemId, id, test.id, test.price,
              JSON.stringify({ id: itemId, requestId: id, testId: test.id, price: test.price, commissionEligible: false })],
          );
        }
        await conn.execute('INSERT INTO \`secure_record_versions\` (\`resource\`, \`record_id\`, \`version\`) VALUES (?, ?, 1)', ['requests', id]);
        await conn.execute(
          'INSERT INTO \`secure_lab_audit\` (\`id\`, \`resource\`, \`record_id\`, \`actor_id\`, \`operation\`, \`version\`, \`created_at\`) VALUES (?, ?, ?, ?, ?, 1, NOW())',
          [token(), 'requests', id, actor.userId, 'create'],
        );
        await conn.commit();
        return { record, items: tests, version: 1 };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }

  async receiveSample(requestId: string, expectedVersion: number, sampleType: string, actor: ServerIdentity) {
    if (!validId(requestId) || !Number.isInteger(expectedVersion) || expectedVersion < 1 ||
        typeof sampleType !== 'string' || !/^[a-zA-Z0-9 _-]{1,80}$/.test(sampleType)) {
      throw new Error('Invalid sample or request version');
    }
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute<QueryRow[]>(
          'SELECT \`id\`, \`patient_id\`, \`status\`, \`raw_json\` FROM \`lab_requests\` WHERE \`id\` = ? FOR UPDATE', [requestId]);
        if (!rows[0]) { await conn.rollback(); return { status: 'missing' as const }; }
        const [v] = await conn.execute<RowDataPacket[]>(
          'SELECT \`version\` FROM \`secure_record_versions\` WHERE \`resource\` = ? AND \`record_id\` = ? FOR UPDATE',
          ['requests', requestId],
        );
        if (v.length !== 1) throw new Error('Request version missing');
        const version = Number(v[0].version);
        if (version !== expectedVersion) { await conn.rollback(); return { status: 'conflict' as const, version }; }
        if (rows[0].status !== 'awaiting_sample') { await conn.rollback(); return { status: 'invalid_state' as const }; }

        // Pilot policy: exactly one received sample per request. More complex
        // workflows require separate sample-type/tube identities per test.
        const [existing] = await conn.execute<RowDataPacket[]>(
          'SELECT \`id\` FROM \`samples\` WHERE \`request_id\` = ? LIMIT 1', [requestId]);
        if (existing.length) { await conn.rollback(); return { status: 'invalid_state' as const }; }
        const id = 'sample_' + token(), code = 'SMP-' + id.slice(-12).toUpperCase();
        const timestamp = sqlDate();
        const sample = {
          id, sampleCode: code, requestId, patientId: rows[0].patient_id,
          sampleType, tubeType: '', status: 'received',
          receivedAt: timestamp, receivedBy: actor.userId,
        };
        await conn.execute(
          'INSERT INTO \`samples\` (\`id\`, \`sample_code\`, \`request_id\`, \`patient_id\`, \`sample_type\`, \`status\`, \`collected_at\`, \`raw_json\`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, code, requestId, rows[0].patient_id, sampleType, 'received', timestamp, JSON.stringify(sample)],
        );
        const original = JSON.parse(String(rows[0].raw_json || '{}')) as Record<string, unknown>;
        if (original.id !== requestId || original.patientId !== rows[0].patient_id) throw new Error('Corrupt request snapshot');
        const updated = { ...original, status: 'sample_received' };
        await conn.execute(
          'UPDATE \`lab_requests\` SET \`status\` = ?, \`raw_json\` = ? WHERE \`id\` = ?',
          ['sample_received', JSON.stringify(updated), requestId],
        );
        await conn.execute(
          'UPDATE \`secure_record_versions\` SET \`version\` = ? WHERE \`resource\` = ? AND \`record_id\` = ?',
          [version + 1, 'requests', requestId],
        );
        await conn.execute(
          'INSERT INTO \`secure_lab_audit\` (\`id\`, \`resource\`, \`record_id\`, \`actor_id\`, \`operation\`, \`version\`, \`created_at\`) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [token(), 'requests', requestId, actor.userId, 'sample_received', version + 1],
        );
        await conn.commit();
        return { status: 'ok' as const, sample, requestVersion: version + 1 };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }

  async getRequest(id: string) {
    if (!validId(id)) throw new Error('Invalid request identifier');
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<(QueryRow & { raw_json: string })[]>(
        'SELECT \`id\`, \`patient_id\`, \`status\`, \`raw_json\` FROM \`lab_requests\` WHERE \`id\` = ? LIMIT 1', [id]);
      if (!rows[0]) return null;
      const [versions] = await conn.execute<RowDataPacket[]>(
        'SELECT \`version\` FROM \`secure_record_versions\` WHERE \`resource\` = ? AND \`record_id\` = ?',
        ['requests', id]);
      if (versions.length !== 1) throw new Error('Request version missing');
      const snapshot = JSON.parse(rows[0].raw_json) as Record<string, unknown>;
      if (snapshot.id !== id || snapshot.patientId !== rows[0].patient_id || snapshot.status !== rows[0].status) {
        throw new Error('Request data mismatch');
      }
      return { record: snapshot, version: Number(versions[0].version) };
    } finally { await conn.end(); }
  }
}

export function installLabWorkflowRoutes(
  app: Express, store: LabWorkflowStore, permissions: ServerPermissionStore, identity: IdentityResolver
): void {
  const route = (resource: string, action: SecureAction,
    handler: (req: Request, res: Response, actor: ServerIdentity) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) { res.status(401).json({ ok: false }); return; }
      try {
        if (!(await permissions.can(actor.role, resource, action))) {
          res.status(403).json({ ok: false }); return;
        }
        await handler(req, res, actor);
      } catch {
        res.status(503).json({ ok: false, error: 'Laboratory operation unavailable' });
      }
    };

  app.post('/api/v2/requests', route('requests', 'add', async (req, res, actor) => {
    try {
      const body = req.body || {};
      if (Object.keys(body).some(key => !['patientId', 'testIds'].includes(key))) throw new Error('Unexpected field');
      const created = await store.createRequest(body.patientId, body.testIds, actor);
      res.status(201).json({ ok: true, ...created });
    } catch {
      res.status(422).json({ ok: false, error: 'Invalid patient or test catalogue selection' });
    }
  }));
  app.get('/api/v2/requests/:id', route('requests', 'view', async (req, res) => {
    if (!validId(req.params.id)) { res.status(400).json({ ok: false }); return; }
    const request = await store.getRequest(req.params.id);
    if (!request) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: true, ...request });
  }));
  app.post('/api/v2/requests/:id/samples/receive', route('samples', 'add', async (req, res, actor) => {
    try {
      const body = req.body || {};
      if (Object.keys(body).some(key => !['version','sampleType'].includes(key))) throw new Error('Unexpected field');
      const result = await store.receiveSample(req.params.id, body.version, body.sampleType, actor);
      if (result.status === 'missing') { res.status(404).json({ ok: false }); return; }
      if (result.status === 'conflict') { res.status(409).json({ ok: false, currentVersion: result.version }); return; }
      if (result.status === 'invalid_state') { res.status(409).json({ ok: false, error: 'Sample already received or invalid request state' }); return; }
      res.status(201).json({ ok: true, sample: result.sample, requestVersion: result.requestVersion });
    } catch {
      res.status(422).json({ ok: false, error: 'Invalid sample receipt' });
    }
  }));
}
