import { randomBytes } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { BranchRegistry } from './branch-registry';
import { ServerPermissionStore, type SecureAction } from './server-permissions';

const goodId = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const newId = () => 'bp_' + randomBytes(16).toString('hex');
type PatientRow = RowDataPacket & {
  id: string; branch_id: string; name: string; phone: string;
  gender: string; active: number; version: number;
};
function fields(body: unknown, partial: boolean) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Bad patient body');
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(x => !['name','phone','gender'].includes(x)) ||
      (partial && Object.keys(data).length === 0)) throw new Error('Unsupported patient field');
  if (!partial || data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length < 2 ||
        data.name.length > 191 || /[\u0000-\u001f]/.test(data.name)) throw new Error('Invalid name');
  }
  if (data.phone !== undefined &&
      (typeof data.phone !== 'string' || !/^[0-9+()\- ]{0,32}$/.test(data.phone))) {
    throw new Error('Invalid phone');
  }
  if (data.gender !== undefined && !['male','female'].includes(String(data.gender))) {
    throw new Error('Invalid gender');
  }
  return {
    name: data.name === undefined ? undefined : (data.name as string).trim(),
    phone: data.phone as string | undefined,
    gender: data.gender as string | undefined,
  };
}
export class BranchPatientStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTables(): Promise<void> {
    const db = await this.connect();
    try {
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_branch_patients (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL, ' +
        'name VARCHAR(191) NOT NULL, phone VARCHAR(32) NOT NULL DEFAULT \'\', ' +
        'gender VARCHAR(16) NOT NULL DEFAULT \'male\', ' +
        'active TINYINT(1) NOT NULL DEFAULT 1, version INT NOT NULL DEFAULT 1, ' +
        'created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, ' +
        'KEY idx_branch_patient_list (branch_id, active, id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_branch_patient_audit (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL, ' +
        'record_id VARCHAR(64) NOT NULL, actor_id VARCHAR(64) NOT NULL, ' +
        'operation VARCHAR(16) NOT NULL, version INT NOT NULL, created_at DATETIME NOT NULL, ' +
        'KEY idx_branch_patient_audit (branch_id, record_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
    } finally { await db.end(); }
  }
  async list(branchId: string, cursor: string, limit: number) {
    if (!goodId(branchId) || (cursor && !goodId(cursor)) ||
        !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid page');
    const db = await this.connect();
    try {
      const [rows] = await db.execute<PatientRow[]>(
        'SELECT id, branch_id, name, phone, gender, version FROM secure_branch_patients ' +
        'WHERE branch_id=? AND active=1 AND id>? ORDER BY id LIMIT ?',
        [branchId, cursor, limit],
      );
      return {
        items: rows.map(row => ({ id: row.id, name: row.name, phone: row.phone,
          gender: row.gender, version: Number(row.version) })),
        nextCursor: rows.length === limit ? rows[rows.length-1].id : null,
      };
    } finally { await db.end(); }
  }
  async get(branchId: string, patientId: string) {
    if (!goodId(branchId) || !goodId(patientId)) throw new Error('Invalid record');
    const db = await this.connect();
    try {
      const [rows] = await db.execute<PatientRow[]>(
        'SELECT id, name, phone, gender, version FROM secure_branch_patients ' +
        'WHERE branch_id=? AND id=? AND active=1 LIMIT 1', [branchId, patientId],
      );
      if (!rows.length) return null;
      const row = rows[0];
      return { id: row.id, name: row.name, phone: row.phone, gender: row.gender, version: Number(row.version) };
    } finally { await db.end(); }
  }
  async create(branchId: string, input: unknown, actorId: string) {
    if (!goodId(branchId) || !goodId(actorId)) throw new Error('Invalid branch/actor');
    const p = fields(input, false);
    const id = newId();
    const db = await this.connect();
    try {
      await db.beginTransaction();
      try {
        await db.execute(
          'INSERT INTO secure_branch_patients (id,branch_id,name,phone,gender,active,version,created_at,updated_at) ' +
          'VALUES (?,?,?,?,?,1,1,NOW(),NOW())',
          [id,branchId,p.name,p.phone || '',p.gender || 'male'],
        );
        await db.execute(
          'INSERT INTO secure_branch_patient_audit (id,branch_id,record_id,actor_id,operation,version,created_at) ' +
          'VALUES (?,?,?,?,?,1,NOW())',
          [newId(),branchId,id,actorId,'create'],
        );
        await db.commit();
        return { id, branchId, name:p.name, phone:p.phone || '', gender:p.gender || 'male', version:1 };
      } catch (error) { await db.rollback(); throw error; }
    } finally { await db.end(); }
  }
  async change(branchId: string, patientId: string, input: unknown, version: unknown,
    actorId: string, action: 'edit' | 'delete') {
    if (!goodId(branchId) || !goodId(patientId) || !goodId(actorId) ||
        !Number.isInteger(version) || (version as number) < 1) throw new Error('Invalid revision');
    const p = action === 'edit' ? fields(input, true) : {};
    const db = await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [rows] = await db.execute<PatientRow[]>(
          'SELECT id, version, name, phone, gender FROM secure_branch_patients ' +
          'WHERE branch_id=? AND id=? AND active=1 FOR UPDATE', [branchId,patientId],
        );
        if (!rows.length) { await db.rollback(); return {status:'not_found' as const}; }
        const row = rows[0];
        if (Number(row.version) !== version) {
          await db.rollback(); return {status:'stale_version' as const,version:Number(row.version)};
        }
        const next = Number(row.version) + 1;
        await db.execute(
          'UPDATE secure_branch_patients SET name=?,phone=?,gender=?,active=?,version=?,updated_at=NOW() ' +
          'WHERE branch_id=? AND id=? AND version=?',
          [p.name ?? row.name,p.phone ?? row.phone,p.gender ?? row.gender,
            action==='delete'?0:1,next,branchId,patientId,version],
        );
        await db.execute(
          'INSERT INTO secure_branch_patient_audit ' +
          '(id,branch_id,record_id,actor_id,operation,version,created_at) VALUES (?,?,?,?,?,?,NOW())',
          [newId(),branchId,patientId,actorId,action,next],
        );
        await db.commit();
        return {status:'ok' as const, version:next};
      } catch (error) { await db.rollback(); throw error; }
    } finally { await db.end(); }
  }
}
export function installBranchPatientRoutes(
  app: Express, patients: BranchPatientStore, branches: BranchRegistry,
  permissions: ServerPermissionStore, identity: IdentityResolver,
): void {
  const guard = (action: SecureAction, handler: (req: Request,res: Response,actor: ServerIdentity)=>Promise<void>) =>
    async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) return res.status(401).json({ok:false});
      if (process.env.TLAB_MULTIBRANCH_MODE !== 'true') {
        return res.status(503).json({ok:false,error:'Enable explicit multi-branch mode after schema initialization'});
      }
      try {
        if (!(await permissions.can(actor.role,'patients',action))) {
          return res.status(403).json({ok:false});
        }
        if (!(await branches.isAllowed(actor,req.params.branchId))) {
          // Hide patients from other branches even from legitimate staff users.
          return res.status(404).json({ok:false});
        }
        await handler(req,res,actor);
      } catch {
        return res.status(503).json({ok:false,error:'Branch-scoped patient operation unavailable'});
      }
    };
  app.get('/api/v3/branches/:branchId/patients', guard('view', async (req,res) => {
    const limit = req.query.limit === undefined ? 30 : Number(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
    if (!Number.isInteger(limit) || limit<1 || limit>50 || (cursor && !goodId(cursor))) {
      res.status(400).json({ok:false}); return;
    }
    res.json({ok:true,...await patients.list(req.params.branchId,cursor,limit)});
  }));
  app.get('/api/v3/branches/:branchId/patients/:patientId', guard('view', async (req,res) => {
    if (!goodId(req.params.patientId)) {res.status(400).json({ok:false});return;}
    const patient = await patients.get(req.params.branchId,req.params.patientId);
    if (!patient) {res.status(404).json({ok:false});return;}
    res.json({ok:true,patient});
  }));
  app.post('/api/v3/branches/:branchId/patients', guard('add', async (req,res,actor) => {
    try {
      const patient = await patients.create(req.params.branchId,req.body,actor.userId);
      res.status(201).json({ok:true,patient});
    } catch {res.status(400).json({ok:false,error:'Invalid patient data'});}
  }));
  const mutation = (action:'edit'|'delete') =>
    guard(action, async (req,res,actor) => {
      const version = req.body?.version;
      if (!goodId(req.params.patientId) || !Number.isInteger(version) ||
          Object.keys(req.body || {}).some(key => !['version','changes'].includes(key))) {
        res.status(400).json({ok:false});return;
      }
      try {
        const result = await patients.change(req.params.branchId,req.params.patientId,
          action==='edit'?req.body.changes:{},version,actor.userId,action);
        if (result.status==='not_found') {res.status(404).json({ok:false});return;}
        if (result.status==='stale_version') {res.status(409).json({ok:false,...result});return;}
        res.json({ok:true,...result});
      } catch {res.status(400).json({ok:false});}
    });
  app.patch('/api/v3/branches/:branchId/patients/:patientId',mutation('edit'));
  app.delete('/api/v3/branches/:branchId/patients/:patientId',mutation('delete'));
}
