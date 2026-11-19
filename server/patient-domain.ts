import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { ServerPermissionStore, type SecureAction } from './server-permissions';

export interface ServerIdentity { userId: string; username: string; role: string }
export type IdentityResolver = (req: Request) => Promise<ServerIdentity | undefined>;
export interface PatientInput {
  name: string;
  nameEn?: string;
  phone?: string;
  gender?: 'male' | 'female';
  birthDate?: string;
  age?: number;
  address?: string;
  notes?: string;
}

type PatientRow = RowDataPacket & { id: string; raw_json: string };
const EDITABLE_FIELDS = ['name', 'nameEn', 'phone', 'gender', 'birthDate', 'age', 'address', 'notes'];
const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;

function validatedFields(input: Record<string, unknown>, partial: boolean): Partial<PatientInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid patient record');
  if (Object.keys(input).some(k => !EDITABLE_FIELDS.includes(k))) throw new Error('Unknown or server-only field');
  if (!partial && (typeof input.name !== 'string' || !input.name.trim())) throw new Error('Patient name required');
  if (partial && Object.keys(input).length === 0) throw new Error('Empty update');
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'age') {
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 125) throw new Error('Invalid age');
      result.age = value;
    } else if (key === 'gender') {
      if (value !== 'male' && value !== 'female') throw new Error('Invalid gender');
      result.gender = value;
    } else if (key === 'birthDate') {
      if (typeof value !== 'string' || (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))) throw new Error('Invalid birthDate');
      result.birthDate = value;
    } else if (typeof value !== 'string') throw new Error('Invalid text field');
    else {
      const max = key === 'name' || key === 'nameEn' ? 191 : key === 'notes' ? 2048 : 255;
      if (value.length > max) throw new Error('Field exceeds maximum size');
      result[key] = key === 'name' ? value.trim() : value;
      if (key === 'name' && !(result.name as string)) throw new Error('Patient name required');
    }
  }
  return result as Partial<PatientInput>;
}

function fromRow(row: PatientRow): Record<string, unknown> {
  if (!row.raw_json) throw new Error('Missing patient data snapshot');
  const data = JSON.parse(row.raw_json) as Record<string, unknown>;
  if (!data || data.id !== row.id || typeof data.name !== 'string') throw new Error('Corrupt patient data');
  return data;
}

export class PatientDomainStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTables(): Promise<void> {
    const conn = await this.connect();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS \`secure_record_versions\` (
        \`resource\` VARCHAR(32) NOT NULL,
        \`record_id\` VARCHAR(64) NOT NULL,
        \`version\` INT NOT NULL DEFAULT 1,
        PRIMARY KEY (\`resource\`, \`record_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
      await conn.query(`CREATE TABLE IF NOT EXISTS \`secure_patient_audit\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`record_id\` VARCHAR(64) NOT NULL,
        \`actor_id\` VARCHAR(64) NOT NULL,
        \`operation\` VARCHAR(16) NOT NULL,
        \`version\` INT NOT NULL,
        \`created_at\` DATETIME NOT NULL,
        INDEX \`idx_patient_audit_record\` (\`record_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
    } finally { await conn.end(); }
  }

  async get(id: string): Promise<{ record: Record<string, unknown>; version: number } | null> {
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<PatientRow[]>('SELECT `id`, `raw_json` FROM `patients` WHERE `id` = ? LIMIT 1', [id]);
      if (!rows[0]) return null;
      const [versions] = await conn.execute<RowDataPacket[]>(
        'SELECT `version` FROM `secure_record_versions` WHERE `resource` = ? AND `record_id` = ?',
        ['patients', id],
      );
      return { record: fromRow(rows[0]), version: versions.length ? Number(versions[0].version) : 1 };
    } finally { await conn.end(); }
  }

  async create(input: Partial<PatientInput>, actorId: string) {
    const values = validatedFields(input as Record<string, unknown>, false);
    const id = 'patient_' + randomBytes(16).toString('hex');
    const record = {
      id, code: 'P' + id.slice(-10).toUpperCase(),
      name: values.name || '',
      nameEn: values.nameEn || '',
      phone: values.phone || '',
      gender: values.gender || 'male',
      birthDate: values.birthDate || '',
      age: values.age || 0,
      nationalId: '',
      address: values.address || '',
      notes: values.notes || '',
      hasDefaultDiscount: false,
      defaultDiscountType: 'none',
      defaultDiscountValue: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        await conn.execute(
          `INSERT INTO \`patients\`
          (\`id\`, \`code\`, \`name\`, \`name_en\`, \`gender\`, \`age\`, \`birth_date\`, \`phone\`, \`national_id\`, \`address\`, \`created_at\`, \`active\`, \`raw_json\`)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [record.id, record.code, record.name, record.nameEn, record.gender, record.age,
           record.birthDate, record.phone, record.nationalId, record.address, record.createdAt, 1, JSON.stringify(record)],
        );
        await conn.execute('INSERT INTO `secure_record_versions` (`resource`, `record_id`, `version`) VALUES (?, ?, 1)', ['patients', id]);
        await conn.execute('INSERT INTO `secure_patient_audit` (`id`, `record_id`, `actor_id`, `operation`, `version`, `created_at`) VALUES (?, ?, ?, ?, ?, NOW())',
          [randomBytes(16).toString('hex'), id, actorId, 'create', 1]);
        await conn.commit();
        return { record, version: 1 };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }

  async mutate(id: string, input: Record<string, unknown>, expectedVersion: number, actorId: string, operation: 'edit' | 'delete') {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('Expected version required');
    const changes = operation === 'edit' ? validatedFields(input, true) : {};
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        // Patient row lock serializes concurrent changes in MySQL 5.5 InnoDB.
        const [rows] = await conn.execute<PatientRow[]>('SELECT `id`, `raw_json` FROM `patients` WHERE `id` = ? FOR UPDATE', [id]);
        if (!rows[0]) { await conn.rollback(); return { status: 'missing' as const }; }
        const [versions] = await conn.execute<RowDataPacket[]>(
          'SELECT `version` FROM `secure_record_versions` WHERE `resource` = ? AND `record_id` = ? FOR UPDATE',
          ['patients', id],
        );
        const current = versions.length ? Number(versions[0].version) : 1;
        if (current !== expectedVersion) { await conn.rollback(); return { status: 'conflict' as const, currentVersion: current }; }
        const original = fromRow(rows[0]);
        const record = operation === 'delete' ? { ...original, active: false } : { ...original, ...changes };
        await conn.execute(
          'UPDATE `patients` SET `name` = ?, `name_en` = ?, `gender` = ?, `age` = ?, `birth_date` = ?, `phone` = ?, `address` = ?, `active` = ?, `raw_json` = ? WHERE `id` = ?',
          [record.name, record.nameEn || '', record.gender || '', Number(record.age) || 0, record.birthDate || '', record.phone || '',
           record.address || '', record.active === false ? 0 : 1, JSON.stringify(record), id],
        );
        const next = current + 1;
        if (versions.length) {
          await conn.execute('UPDATE `secure_record_versions` SET `version` = ? WHERE `resource` = ? AND `record_id` = ?', [next, 'patients', id]);
        } else {
          await conn.execute('INSERT INTO `secure_record_versions` (`resource`, `record_id`, `version`) VALUES (?, ?, ?)', ['patients', id, next]);
        }
        await conn.execute('INSERT INTO `secure_patient_audit` (`id`, `record_id`, `actor_id`, `operation`, `version`, `created_at`) VALUES (?, ?, ?, ?, ?, NOW())',
          [randomBytes(16).toString('hex'), id, actorId, operation, next]);
        await conn.commit();
        return { status: 'ok' as const, record, version: next };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }
}

export function installPatientRoutes(
  app: Express, store: PatientDomainStore, permissions: ServerPermissionStore, identity: IdentityResolver
): void {
  const route = (action: SecureAction, handler: (req: Request, res: Response, actor: ServerIdentity) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) { res.status(401).json({ ok: false }); return; }
      try {
        if (!(await permissions.can(actor.role, 'patients', action))) {
          res.status(403).json({ ok: false, error: 'Permission denied' }); return;
        }
        await handler(req, res, actor);
      } catch {
        res.status(503).json({ ok: false, error: 'Patient operation unavailable' });
      }
    };

  app.get('/api/v2/patients/:id', route('view', async (req, res) => {
    if (!idPattern.test(req.params.id)) { res.status(400).json({ ok: false }); return; }
    const patient = await store.get(req.params.id);
    if (!patient) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: true, ...patient });
  }));

  app.post('/api/v2/patients', route('add', async (req, res, actor) => {
    try {
      const created = await store.create(req.body || {}, actor.userId);
      res.status(201).json({ ok: true, ...created });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Invalid patient' });
    }
  }));

  const mutate = (action: 'edit' | 'delete') => route(action, async (req, res, actor) => {
    if (!idPattern.test(req.params.id)) { res.status(400).json({ ok: false }); return; }
    try {
      const result = await store.mutate(req.params.id, action === 'edit' ? req.body?.changes || {} : {},
        req.body?.version, actor.userId, action);
      if (result.status === 'missing') { res.status(404).json({ ok: false }); return; }
      if (result.status === 'conflict') { res.status(409).json({ ok: false, currentVersion: result.currentVersion }); return; }
      res.json({ ok: true, version: result.version, record: result.record });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Invalid mutation' });
    }
  });
  app.patch('/api/v2/patients/:id', mutate('edit'));
  app.delete('/api/v2/patients/:id', mutate('delete'));
}
