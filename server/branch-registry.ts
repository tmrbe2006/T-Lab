import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver, ServerIdentity } from './patient-domain';

const idOk = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{2,39}$/.test(v);
const nameOk = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length >= 2 && v.length <= 120 &&
  !/[\u0000-\u001f]/.test(v);
const roleOk = (role: string): boolean => role === 'Developer' || role === 'Owner';
type BranchRow = RowDataPacket & {
  id: string; code: string; name_ar: string; active: number; created_at: string;
};
export class BranchRegistry {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTables(): Promise<void> {
    const db = await this.connect();
    try {
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_lab_branches (' +
        'id VARCHAR(40) NOT NULL PRIMARY KEY, code VARCHAR(40) NOT NULL, ' +
        'name_ar VARCHAR(120) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, ' +
        'created_at DATETIME NOT NULL, UNIQUE KEY uq_branch_code (code)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_staff_branch_grants (' +
        'user_id VARCHAR(64) NOT NULL, branch_id VARCHAR(40) NOT NULL, ' +
        'created_at DATETIME NOT NULL, PRIMARY KEY (user_id, branch_id), ' +
        'KEY idx_grants_branch (branch_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
    } finally { await db.end(); }
  }
  async list(actor: ServerIdentity): Promise<Array<{id:string;code:string;nameAr:string;active:boolean}>> {
    const db = await this.connect();
    try {
      const [rows] = roleOk(actor.role)
        ? await db.query<BranchRow[]>(
          'SELECT id, code, name_ar, active FROM secure_lab_branches ORDER BY code LIMIT 100',
        )
        : await db.execute<BranchRow[]>(
          'SELECT b.id, b.code, b.name_ar, b.active FROM secure_lab_branches b ' +
          'INNER JOIN secure_staff_branch_grants g ON g.branch_id=b.id ' +
          'WHERE g.user_id=? AND b.active=1 ORDER BY b.code LIMIT 100',
          [actor.userId],
        );
      return rows.map(row => ({
        id: String(row.id), code: String(row.code),
        nameAr: String(row.name_ar), active: Number(row.active) === 1,
      }));
    } finally { await db.end(); }
  }
  async create(code: unknown, name: unknown) {
    if (!idOk(code) || !nameOk(name)) throw new Error('Invalid branch code or name');
    const id = 'br_' + randomBytes(12).toString('hex');
    const db = await this.connect();
    try {
      await db.execute(
        'INSERT INTO secure_lab_branches (id, code, name_ar, active, created_at) ' +
        'VALUES (?, ?, ?, 1, NOW())',
        [id, code, name.trim()],
      );
      return { id, code, nameAr: name.trim(), active: true };
    } finally { await db.end(); }
  }
  async grant(userId: unknown, branchId: unknown): Promise<boolean> {
    if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(userId) ||
        typeof branchId !== 'string' || !idOk(branchId)) throw new Error('Invalid grant');
    const db = await this.connect();
    try {
      const [user] = await db.execute<RowDataPacket[]>(
        'SELECT id FROM secure_auth_users WHERE id=? AND active=1 LIMIT 1', [userId],
      );
      const [branch] = await db.execute<RowDataPacket[]>(
        'SELECT id FROM secure_lab_branches WHERE id=? AND active=1 LIMIT 1', [branchId],
      );
      if (user.length !== 1 || branch.length !== 1) return false;
      await db.execute(
        'INSERT IGNORE INTO secure_staff_branch_grants ' +
        '(user_id,branch_id,created_at) VALUES (?,?,NOW())', [userId, branchId],
      );
      return true;
    } finally { await db.end(); }
  }
  async revoke(userId: unknown, branchId: unknown): Promise<void> {
    if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(userId) ||
        typeof branchId !== 'string' || !idOk(branchId)) throw new Error('Invalid grant');
    const db = await this.connect();
    try {
      await db.execute(
        'DELETE FROM secure_staff_branch_grants WHERE user_id=? AND branch_id=?',
        [userId, branchId],
      );
    } finally { await db.end(); }
  }
  async isAllowed(actor: ServerIdentity, branchId: unknown): Promise<boolean> {
    if (typeof branchId !== 'string' || !idOk(branchId)) return false;
    const db = await this.connect();
    try {
      if (roleOk(actor.role)) {
        const [rows] = await db.execute<RowDataPacket[]>(
          'SELECT id FROM secure_lab_branches WHERE id=? AND active=1 LIMIT 1',
          [branchId],
        );
        return rows.length === 1;
      }
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT b.id FROM secure_lab_branches b ' +
        'INNER JOIN secure_staff_branch_grants g ON g.branch_id=b.id ' +
        'WHERE b.id=? AND b.active=1 AND g.user_id=? LIMIT 1',
        [branchId, actor.userId],
      );
      return rows.length === 1;
    } finally { await db.end(); }
  }
}
export function installBranchIsolationGate(app: Express): void {
  app.use('/api/v2', (req: Request, res: Response, next) => {
    if (process.env.TLAB_MULTIBRANCH_MODE !== 'true') return next();
    // The /api/v2/branches metadata APIs use server-checked memberships.
    // All clinical, financial, inventory and reporting endpoints remain
    // blocked until every DB query is formally branch-scoped and tested.
    if (req.path === '/branches' || req.path.startsWith('/branches/')) return next();
    return res.status(503).json({
      ok: false,
      error: 'Multi-branch operational endpoints are disabled pending database-level isolation',
    });
  });
}

export function installBranchRegistryRoutes(
  app: Express, store: BranchRegistry, identity: IdentityResolver,
): void {
  app.get('/api/v2/branches', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try { return res.json({ ok: true, branches: await store.list(actor), operationalIsolationReady: false, multiBranchModeEnabled: process.env.TLAB_MULTIBRANCH_MODE === 'true', branchPatientsAvailable: true }); }
    catch { return res.status(503).json({ ok: false }); }
  });
  app.post('/api/v2/branches', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    if (actor.role !== 'Developer') return res.status(403).json({ ok: false });
    try {
      if (Object.keys(req.body || {}).sort().join(',') !== 'code,name') return res.status(422).json({ ok: false });
      return res.status(201).json({ ok: true, branch: await store.create(req.body.code, req.body.name) });
    } catch { return res.status(409).json({ ok: false }); }
  });
  app.post('/api/v2/branches/:id/grants', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    if (actor.role !== 'Developer') return res.status(403).json({ ok: false });
    if (Object.keys(req.body || {}).join(',') !== 'userId') return res.status(422).json({ ok: false });
    try {
      if (!(await store.grant(req.body.userId, req.params.id))) return res.status(404).json({ ok: false });
      return res.status(201).json({ ok: true });
    } catch { return res.status(422).json({ ok: false }); }
  });
  app.delete('/api/v2/branches/:id/grants/:userId', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    if (actor.role !== 'Developer') return res.status(403).json({ ok: false });
    try { await store.revoke(req.params.userId, req.params.id); return res.json({ ok: true }); }
    catch { return res.status(422).json({ ok: false }); }
  });
  app.get('/api/v2/branches/:id/access', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await store.isAllowed(actor, req.params.id))) return res.status(403).json({ ok: false });
      return res.json({
        ok: true, branchId: req.params.id, allowed: true,
        operationalIsolationReady: false,
      });
    } catch { return res.status(503).json({ ok: false }); }
  });
}
