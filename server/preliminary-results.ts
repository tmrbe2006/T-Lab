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
            const numeric = typeof measurement.value === 'number' ? measurement.value : Number(measurement.value);
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
          [id, requestId, testId, request.patient_id, 'draft', 0, JSON.stringify(record)],
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

  app.get('/api/v2/results/:id', route('view', async (req, res) => {
    if (!validId(req.params.id)) { res.status(400).json({ ok: false }); return; }
    const result = await store.get(req.params.id);
    if (!result) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: true, ...result });
  }));

  // No approve/sign/report issuance route by design: clinical QA, gender/age
  // reference intervals, critical flag policies and read-back are incomplete.
}
