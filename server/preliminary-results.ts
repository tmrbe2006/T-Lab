import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { ServerPermissionStore, type SecureAction } from './server-permissions';
import type { IdentityResolver, ServerIdentity } from './patient-domain';

const validId = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s);
type LabRow = RowDataPacket & { id: string; patient_id: string; status: string; test_id?: string; raw_json?: string; active?: number };
type ParameterRow = RowDataPacket & { id: string; test_id: string; result_type: string; is_calculated: number; active: number };
type ResultValue = { parameterId: string; value: string | number };
const guid = () => randomBytes(16).toString('hex');
const now = () => new Date().toISOString().slice(0,19).replace('T',' ');

export class PreliminaryResultStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  /**
   * Records unverified measurements. No ranges, critical flags or clinical
   * approval are inferred from browser input. This endpoint cannot issue a report.
   */
  async orderedParameters(requestId: string) {
    if (!validId(requestId)) throw new Error('Invalid request');
    const db = await this.connect();
    try {
      const [requests] = await db.execute<RowDataPacket[]>(
        'SELECT status FROM lab_requests WHERE id = ? LIMIT 1', [requestId],
      );
      if (!requests.length) return null;
      const status = String(requests[0].status);
      if (!['sample_received', 'in_analysis'].includes(status)) {
        return { requestId, status, tests: [], entryAllowed: false };
      }
      const [ordered] = await db.execute<RowDataPacket[]>(
        'SELECT ri.test_id, t.code AS test_code, t.name_ar AS test_name, ' +
        'p.id AS parameter_id, p.code AS parameter_code, p.name_ar AS parameter_name, ' +
        'p.unit, p.result_type ' +
        'FROM request_items ri INNER JOIN lab_tests t ON t.id = ri.test_id ' +
        'LEFT JOIN test_parameters p ON p.test_id = ri.test_id AND p.active = 1 AND p.is_calculated = 0 ' +
        'WHERE ri.request_id = ? ORDER BY ri.test_id, p.sort_order, p.id LIMIT 101',
        [requestId],
      );
      if (!ordered.length || ordered.length > 100) throw new Error('Unsupported parameter count');
      const tests = new Map<string, {
        id: string; code: string; name: string;
        parameters: Array<{ id: string; code: string; name: string; unit: string; resultType: string }>;
      }>();
      for (const row of ordered) {
        const id = String(row.test_id);
        if (!tests.has(id)) {
          tests.set(id, {
            id, code: String(row.test_code || ''), name: String(row.test_name || ''),
            parameters: [],
          });
        }
        if (row.parameter_id) {
          tests.get(id)!.parameters.push({
            id: String(row.parameter_id), code: String(row.parameter_code || ''),
            name: String(row.parameter_name || ''), unit: String(row.unit || ''),
            resultType: String(row.result_type || 'qualitative'),
          });
        }
      }
      // No guessed range/critical status is sent to result entry.
      return { requestId, status, tests: [...tests.values()], entryAllowed: true };
    } finally { await db.end(); }
  }

  async createDraft(requestId: string, testId: string, values: ResultValue[], actor: ServerIdentity) {
    if (!validId(requestId) || !validId(testId) || !Array.isArray(values) ||
        values.length < 1 || values.length > 100 ||
        new Set(values.map(v => v?.parameterId)).size !== values.length ||
        values.some(v => !v || !validId(v.parameterId) ||
          !(typeof v.value === 'number' || typeof v.value === 'string'))) {
      throw new Error('Invalid test or measurement values');
    }
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        const [requests] = await conn.execute<LabRow[]>(
          'SELECT \`id\`, \`patient_id\`, \`status\` FROM \`lab_requests\` WHERE \`id\` = ? FOR UPDATE',
          [requestId],
        );
        const request = requests[0];
        if (!request || !['sample_received','in_analysis'].includes(request.status)) throw new Error('Sample not received');
        const [items] = await conn.execute<RowDataPacket[]>(
          'SELECT \`id\` FROM \`request_items\` WHERE \`request_id\` = ? AND \`test_id\` = ? LIMIT 1',
          [requestId, testId],
        );
        if (items.length !== 1) throw new Error('Test not ordered');
        const [duplicate] = await conn.execute<RowDataPacket[]>(
          'SELECT \`id\` FROM \`lab_results\` WHERE \`request_id\` = ? AND \`test_id\` = ? LIMIT 1',
          [requestId, testId],
        );
        if (duplicate.length) throw new Error('Result already exists; use explicit versioned correction');
        const [parameters] = await conn.execute<ParameterRow[]>(
          'SELECT \`id\`, \`test_id\`, \`result_type\`, \`is_calculated\`, \`active\` FROM \`test_parameters\` WHERE \`test_id\` = ?',
          [testId],
        );
        const expected = parameters.filter(p => Number(p.active) === 1 && Number(p.is_calculated) !== 1);
        if (!expected.length || expected.length !== values.length) throw new Error('Complete active parameter set required');
        const byId = new Map(expected.map(p => [p.id, p]));
        for (const measurement of values) {
          const p = byId.get(measurement.parameterId);
          if (!p) throw new Error('Unexpected parameter');
          if (p.result_type === 'numeric') {
            const numericText = String(measurement.value).trim();
            if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(numericText)) throw new Error('Invalid numeric formatting');
            const numeric = Number(numericText);
            if (!Number.isFinite(numeric) || String(measurement.value).trim() === '' ||
                Math.abs(numeric) > 1e12) throw new Error('Invalid numeric result');
          } else {
            if (typeof measurement.value !== 'string' || measurement.value.trim().length < 1 ||
                measurement.value.length > 256) throw new Error('Invalid qualitative result');
          }
        }
        const id = 'result_' + guid();
        const stamp = now();
        const record = {
          id, requestId, testId, patientId: request.patient_id,
          status: 'draft', enteredBy: actor.userId, enteredAt: stamp,
          values: values.map(v => ({ parameterId: v.parameterId, value: v.value })),
          clinicalValidation: 'NOT_REVIEWED',
          flagAssessment: 'NOT_ASSESSED',
          approvedBy: null, approvedAt: null, notes: '',
        };
        await conn.execute(
          'INSERT INTO \`lab_results\` (\`id\`, \`request_id\`, \`test_id\`, \`patient_id\`, \`status\`, \`has_critical\`, \`raw_json\`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, requestId, testId, request.patient_id, 'draft', null, JSON.stringify(record)],
        );
        await conn.execute(
          'INSERT INTO \`secure_record_versions\` (\`resource\`, \`record_id\`, \`version\`) VALUES (?, ?, 1)',
          ['results', id],
        );
        await conn.execute(
          'INSERT INTO \`secure_lab_audit\` (\`id\`, \`resource\`, \`record_id\`, \`actor_id\`, \`operation\`, \`version\`, \`created_at\`) VALUES (?, ?, ?, ?, ?, 1, NOW())',
          [guid(), 'results', id, actor.userId, 'draft_created'],
        );
        await conn.commit();
        return { record, version: 1 };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }

  async submitForReview(id: string, expectedVersion: number, actor: ServerIdentity) {
    if (!validId(id) || !Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('Invalid record version');
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        const [rows] = await conn.execute<LabRow[]>(
          'SELECT \`id\`, \`status\`, \`raw_json\` FROM \`lab_results\` WHERE \`id\` = ? FOR UPDATE', [id],
        );
        if (!rows[0]) { await conn.rollback(); return { status: 'missing' as const }; }
        const [versions] = await conn.execute<RowDataPacket[]>(
          'SELECT \`version\` FROM \`secure_record_versions\` WHERE \`resource\` = ? AND \`record_id\` = ? FOR UPDATE',
          ['results', id],
        );
        if (versions.length !== 1) throw new Error('Result version missing');
        const currentVersion = Number(versions[0].version);
        if (currentVersion !== expectedVersion) {
          await conn.rollback(); return { status: 'conflict' as const, currentVersion };
        }
        if (rows[0].status !== 'draft') { await conn.rollback(); return { status: 'invalid_state' as const }; }
        const saved = JSON.parse(String(rows[0].raw_json || '')) as Record<string, unknown>;
        if (saved.id !== id || saved.status !== 'draft' ||
            saved.enteredBy !== actor.userId || !Array.isArray(saved.values) ||
            saved.values.length === 0 || saved.clinicalValidation !== 'NOT_REVIEWED') {
          throw new Error('Result cannot be submitted by this actor');
        }
        const next = currentVersion + 1;
        const updated = { ...saved, status: 'pending_review', submittedForReviewAt: now(),
          submittedBy: actor.userId, clinicalValidation: 'NOT_REVIEWED',
          flagAssessment: 'NOT_ASSESSED', approvedBy: null, approvedAt: null };
        await conn.execute(
          'UPDATE \`lab_results\` SET \`status\` = ?, \`raw_json\` = ? WHERE \`id\` = ?',
          ['pending_review', JSON.stringify(updated), id],
        );
        await conn.execute(
          'UPDATE \`secure_record_versions\` SET \`version\` = ? WHERE \`resource\` = ? AND \`record_id\` = ?',
          [next, 'results', id],
        );
        await conn.execute(
          'INSERT INTO \`secure_lab_audit\` (\`id\`, \`resource\`, \`record_id\`, \`actor_id\`, \`operation\`, \`version\`, \`created_at\`) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [guid(), 'results', id, actor.userId, 'submit_review', next],
        );
        await conn.commit();
        return { status: 'ok' as const, version: next, record: updated };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }

  async listReviewQueue(cursor: string, limit: number) {
    if ((cursor && !validId(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('Invalid review cursor or limit');
    }
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<(LabRow & { version: number })[]>(
        `SELECT r.\`id\`, r.\`raw_json\`, v.\`version\`
         FROM \`lab_results\` r
         INNER JOIN \`secure_record_versions\` v
           ON v.\`resource\` = 'results' AND v.\`record_id\` = r.\`id\`
         WHERE r.\`status\` = 'pending_review' AND r.\`id\` > ?
         ORDER BY r.\`id\` ASC LIMIT ?`,
        [cursor, limit],
      );
      const items = rows.map(row => {
        const data = JSON.parse(String(row.raw_json || '{}')) as Record<string, unknown>;
        if (data.id !== row.id || data.status !== 'pending_review' ||
            data.clinicalValidation !== 'NOT_REVIEWED' || !Array.isArray(data.values)) {
          throw new Error('Corrupt review record');
        }
        return {
          id: row.id, requestId: data.requestId, testId: data.testId,
          patientId: data.patientId, enteredBy: data.enteredBy,
          values: data.values, status: 'pending_review' as const,
          reviewStatus: 'NOT_REVIEWED' as const, version: Number(row.version),
        };
      });
      return { items, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null };
    } finally { await conn.end(); }
  }

  async get(id: string) {
    if (!validId(id)) throw new Error('Invalid result identifier');
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<LabRow[]>(
        'SELECT \`id\`, \`status\`, \`raw_json\` FROM \`lab_results\` WHERE \`id\` = ? LIMIT 1', [id]);
      if (!rows.length || !rows[0].raw_json) return null;
      const snapshot = JSON.parse(rows[0].raw_json) as Record<string, unknown>;
      if (snapshot.id !== id || snapshot.status !== rows[0].status) throw new Error('Corrupt result record');
      return { record: snapshot };
    } finally { await conn.end(); }
  }
}

export function installPreliminaryResultRoutes(
  app: Express, store: PreliminaryResultStore, permissions: ServerPermissionStore, identity: IdentityResolver
): void {
  const route = (action: SecureAction, handler: (req: Request, res: Response, actor: ServerIdentity) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) { res.status(401).json({ ok: false }); return; }
      try {
        if (!(await permissions.can(actor.role, 'results', action))) {
          res.status(403).json({ ok: false, error: 'Result permission denied' }); return;
        }
        await handler(req, res, actor);
      } catch {
        res.status(503).json({ ok: false, error: 'Results unavailable' });
      }
    };

  app.get('/api/v2/results/requests/:requestId/parameters', route('view', async (req, res) => {
    if (!validId(req.params.requestId)) {
      res.status(400).json({ ok: false }); return;
    }
    const ordered = await store.orderedParameters(req.params.requestId);
    if (!ordered) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: true, ...ordered });
  }));

  app.post('/api/v2/results/drafts', route('add', async (req, res, actor) => {
    const body = req.body || {};
    if (!body || typeof body !== 'object' || Object.keys(body).some(key => !['requestId','testId','values'].includes(key))) {
      res.status(422).json({ ok: false, error: 'Invalid result fields' }); return;
    }
    try {
      const created = await store.createDraft(body.requestId, body.testId, body.values, actor);
      res.status(201).json({ ok: true, ...created });
    } catch {
      res.status(422).json({ ok: false, error: 'Invalid or duplicate unreviewed result' });
    }
  }));

  app.post('/api/v2/results/:id/submit-review', route('edit', async (req, res, actor) => {
    if (!validId(req.params.id) || !req.body ||
        Object.keys(req.body).sort().join(',') !== 'version') {
      res.status(422).json({ ok: false, error: 'Result version required' }); return;
    }
    try {
      const result = await store.submitForReview(req.params.id, req.body.version, actor);
      if (result.status === 'missing') { res.status(404).json({ ok: false }); return; }
      if (result.status === 'conflict' || result.status === 'invalid_state') {
        res.status(409).json({ ok: false, error: 'Stale or already submitted result' }); return;
      }
      res.json({ ok: true, version: result.version, status: 'pending_review', approved: false });
    } catch {
      res.status(422).json({ ok: false, error: 'Draft could not be submitted' });
    }
  }));

  app.get('/api/v2/results/review-queue', route('view', async (req, res) => {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
    const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    if ((cursor && !validId(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      res.status(400).json({ ok: false }); return;
    }
    res.json({ ok: true, ...(await store.listReviewQueue(cursor, limit)) });
  }));

  app.get('/api/v2/results/:id', route('view', async (req, res) => {
    if (!validId(req.params.id)) { res.status(400).json({ ok: false }); return; }
    const result = await store.get(req.params.id);
    if (!result) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: true, ...result });
  }));

  // No approve/sign/report issuance route by design: clinical QA, gender/age
  // reference intervals, critical flag policies and read-back are incomplete.
}
