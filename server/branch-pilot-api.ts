import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import mysql from 'mysql2/promise';
import {
  createBranch, listAccessibleBranches, setUserBranchAssignment,
  type BranchDatabase,
} from './branch-service';
import { validBranchId, type BranchPrincipal, type BranchRole } from './branch-access';
import { BRANCH_RESOURCES, readBranchPermissions, saveBranchPermissions, ownBranchPermissions } from './branch-user-permissions';

type AdminRole = 'Developer' | 'Owner';
type AdminSession = { userId: string; role: BranchRole; username: string; branchId?: string; expires: number };
const SESSION_COOKIE = 'tlab_branch_pilot_admin';
const SESSION_DURATION_MS = 60 * 60 * 1000;
const sessions = new Map<string, AdminSession>();
const attempts = new Map<string, { count: number; until: number }>();

function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress || '';
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const target = new URL(origin);
    const hostname = req.headers.host?.split(':')[0] || '';
    return (target.hostname === 'localhost' || target.hostname === '127.0.0.1') &&
      (hostname === 'localhost' || hostname === '127.0.0.1') &&
      target.host === req.headers.host;
  } catch {
    return false;
  }
}

function cookieValue(req: Request): string | null {
  const cookies = (req.headers.cookie || '').split(';').map((c) => c.trim());
  const matching = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return matching ? matching.slice(SESSION_COOKIE.length + 1) : null;
}

function getSession(req: Request): AdminSession | null {
  const key = cookieValue(req);
  const session = key && sessions.get(key);
  if (!session || session.expires < Date.now()) {
    if (key) sessions.delete(key);
    return null;
  }
  return session;
}

function secureCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/branch-pilot; Max-Age=${maxAge}`;
}

function equalLegacyPassword(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function dbConnection() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'tlab_db';
  // Never auto-create a database or import SQL on requests.
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('Invalid MySQL database name');
  return mysql.createConnection({ host, port, user, password, database, connectTimeout: 7000 });
}

async function useDatabase<T>(fn: (db: mysql.Connection) => Promise<T>): Promise<T> {
  const connection = await dbConnection();
  try { return await fn(connection); } finally { await connection.end(); }
}


// The pilot uses the existing legacy user credentials without changing any
// passwords. Production must migrate these plaintext legacy hashes to Argon2id.
async function verifyStaffCredentials(db: mysql.Connection, username: string, password: string):
Promise<{ userId: string; role: BranchRole } | null> {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username) || !password || password.length > 256 ||
      username.toLowerCase() === 'root') return null;
  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    'SELECT id, role, active, raw_json FROM users WHERE username=? LIMIT 1',
    [username],
  );
  const row = rows[0];
  if (!row || Number(row.active) !== 1 ||
      !['Developer','Owner','Doctor','Chemist','Technician','Receptionist','Accountant'].includes(String(row.role))) return null;
  let stored = '';
  try { stored = String(JSON.parse(String(row.raw_json || '{}')).passwordHash || ''); }
  catch { return null; }
  if (!equalLegacyPassword(stored, password)) return null;
  return { userId: String(row.id), role: row.role as BranchRole };
}

async function staffAssignedBranches(db: mysql.Connection, userId: string, role: BranchRole):
Promise<Array<{ branchId: string; code: string; nameAr: string }>> {
  const sql = role === 'Developer'
    ? 'SELECT id, code, name_ar FROM branches WHERE active=1 ORDER BY code'
    : 'SELECT b.id, b.code, b.name_ar FROM user_branches ub INNER JOIN branches b ON b.id=ub.branch_id AND b.active=1 WHERE ub.user_id=? ORDER BY b.code';
  const [rows] = await db.execute<mysql.RowDataPacket[]>(sql, role === 'Developer' ? [] : [userId]);
  return rows.map((r) => ({ branchId: String(r.id), code: String(r.code), nameAr: String(r.name_ar) }));
}

function respondError(res: Response, error: unknown): void {
  if ((error as { code?: string })?.code === 'ER_NO_SUCH_TABLE') {
    res.status(409).json({
      ok: false,
      error: 'BRANCH_SCHEMA_MISSING',
      hint: 'Apply additive sql/tlab_multibranch_additive_v1.sql to a restored test copy of the configured database after taking a full verified backup.',
    });
    return;
  }
  if (error instanceof Error && error.message === 'FORBIDDEN') {
    res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    return;
  }
  if (error instanceof TypeError || (error instanceof Error && error.message === 'INVALID_BRANCH')) {
    res.status(400).json({ ok: false, error: 'Invalid input' });
    return;
  }
  console.error('Branch pilot admin failure:', error instanceof Error ? error.message : String(error));
  res.status(503).json({ ok: false, error: 'Database not ready; apply verified additive migration to a backed-up test database first' });
}

/**
 * LOCAL PILOT ONLY. Legacy MySQL users store passwords as plaintext in raw_json;
 * this separate step-up login must not be considered production-grade authentication.
 * The entire router is disabled unless explicitly enabled AND accessed via loopback.
 */
export function installBranchPilotRoutes(app: Express): void {
  app.use('/api/branch-pilot', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.TLAB_BRANCH_PILOT_ADMIN_ENABLED !== 'true' ||
        !isLoopback(req) || !sameOrigin(req)) {
      res.status(403).json({ ok: false, error: 'Local branch pilot administration disabled' });
      return;
    }
    next();
  });

  // Read-only local health probe. Uses server-side .env credentials only.
  // It never creates a schema, modifies a row, or returns a password.
  // Deliberately precedes the privileged session gate so the Windows
  // connection panel can show a truthful status before administrator login.
  app.get('/api/branch-pilot/connection-status', async (_req, res) => {
    let db: mysql.Connection | null = null;
    try {
      db = await dbConnection();
      const [versionRows] = await db.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version, DATABASE() AS dbname');
      const [tableRows] = await db.query<mysql.RowDataPacket[]>('SHOW TABLES');
      const dbname = String(versionRows[0]?.dbname || process.env.MYSQL_DATABASE || '');
      res.json({
        ok: true,
        version: String(versionRows[0]?.version || ''),
        database: dbname,
        existingTablesCount: tableRows.length,
        // Credentials intentionally omitted, including database username.
      });
    } catch (error) {
      const code = (error as { code?: string }).code || '';
      const safeReason =
        code === 'ER_ACCESS_DENIED_ERROR' ? 'MYSQL_AUTH_FAILED' :
        code === 'ER_BAD_DB_ERROR' ? 'DATABASE_NOT_FOUND' :
        code === 'ECONNREFUSED' ? 'MYSQL_SERVER_UNREACHABLE' :
        code === 'ENOTFOUND' ? 'MYSQL_HOST_NOT_FOUND' : 'MYSQL_CONNECTION_FAILED';
      res.status(503).json({ ok: false, error: safeReason });
    } finally {
      if (db) await db.end().catch(() => undefined);
    }
  });

  app.post('/api/branch-pilot/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    // The database driver uses MYSQL_USER from .env, but browser login must
    // authenticate a T-Lab application Owner/Developer stored in users.
    // Reject accidental submission of the database root credentials.
    if (username.toLowerCase() === 'root') {
      res.status(400).json({ ok: false, error: 'MYSQL_USER_IS_NOT_APP_USER' });
      return;
    }
    const ip = req.socket.remoteAddress || 'local';
    const prior = attempts.get(ip);
    if (prior && prior.until > Date.now() && prior.count >= 5) {
      res.status(429).json({ ok: false, error: 'Too many attempts' });
      return;
    }
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username) || password.length < 1 || password.length > 256) {
      res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      return;
    }
    try {
      const identity = await useDatabase(async (db) => {
        const [records] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT id, role, active, raw_json FROM users WHERE username = ? LIMIT 1',
          [username],
        );
        const record = records[0];
        if (!record || Number(record.active) !== 1 ||
            (record.role !== 'Owner' && record.role !== 'Developer')) return null;
        let passwordHash = '';
        try { passwordHash = String(JSON.parse(String(record.raw_json || '{}')).passwordHash || ''); }
        catch { return null; }
        if (!equalLegacyPassword(passwordHash, password)) return null;
        return { userId: String(record.id), role: record.role as AdminRole };
      });
      if (!identity) {
        const failures = prior?.until && prior.until > Date.now() ? prior.count : 0;
        attempts.set(ip, { count: failures + 1, until: Date.now() + 15 * 60 * 1000 });
        res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        return;
      }
      attempts.delete(ip);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { ...identity, username, expires: Date.now() + SESSION_DURATION_MS });
      res.setHeader('Set-Cookie', secureCookie(token, 3600));
      res.json({ ok: true, role: identity.role });
    } catch (error) { respondError(res, error); }
  });

  // Credentials checked against MySQL BEFORE listing the user's assigned branches.
  app.post('/api/branch-pilot/staff-branches', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const ip = req.socket.remoteAddress || 'local';
    const failed = attempts.get(ip);
    if (failed && failed.count >= 5 && failed.until > Date.now()) {
      res.status(429).json({ ok: false, error: 'Too many attempts' }); return;
    }
    try {
      const data = await useDatabase(async (db) => {
        const user = await verifyStaffCredentials(db, username, password);
        if (!user) return null;
        return { user, branches: await staffAssignedBranches(db, user.userId, user.role) };
      });
      if (!data) {
        attempts.set(ip, { count: (failed && failed.until > Date.now() ? failed.count : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
        res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' }); return;
      }
      attempts.delete(ip);
      res.json({ ok: true, branches: data.branches });
    } catch (error) { respondError(res, error); }
  });

  // Start a server-bound session only for an explicitly authorized active branch.
  app.post('/api/branch-pilot/staff-login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const branchId = req.body?.branchId;
    const ip = req.socket.remoteAddress || 'local';
    const failed = attempts.get(ip);
    if (failed && failed.count >= 5 && failed.until > Date.now()) {
      res.status(429).json({ ok: false, error: 'Too many attempts' }); return;
    }
    if (!validBranchId(branchId)) { res.status(400).json({ ok: false, error: 'INVALID_BRANCH' }); return; }
    try {
      const data = await useDatabase(async (db) => {
        const user = await verifyStaffCredentials(db, username, password);
        if (!user) return null;
        const permitted = await staffAssignedBranches(db, user.userId, user.role);
        if (!permitted.some((b) => b.branchId === branchId)) return { forbidden: true } as const;
        const permissions = await ownBranchPermissions({
          execute: (sql, params) => db.execute(sql, params as string[]),
        }, user.userId, branchId);
        const branch = permitted.find((b) => b.branchId === branchId)!;
        return { user, branch, permissions };
      });
      if (!data) {
        attempts.set(ip, { count: (failed && failed.until > Date.now() ? failed.count : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
        res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' }); return;
      }
      if ('forbidden' in data) { res.status(403).json({ ok: false, error: 'BRANCH_NOT_ASSIGNED' }); return; }
      attempts.delete(ip);
      const previousToken = cookieValue(req);
      if (previousToken) sessions.delete(previousToken);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { ...data.user, username, branchId, expires: Date.now() + SESSION_DURATION_MS });
      res.setHeader('Set-Cookie', secureCookie(token, 3600));
      res.json({ ok: true, userId: data.user.userId, role: data.user.role, branch: data.branch, permissions: data.permissions });
    } catch (error) { respondError(res, error); }
  });

  app.use('/api/branch-pilot', (req, res, next) => {
    if (req.path === '/login' || req.path === '/staff-branches' || req.path === '/staff-login') { next(); return; }
    const session = getSession(req);
    if (!session) { res.status(401).json({ ok: false, error: 'Session required' }); return; }
    res.locals.branchPrincipal = {
      userId: session.userId, role: session.role, active: true, assignedBranchIds: new Set<string>(),
    } satisfies BranchPrincipal;
    res.locals.branchSession = session;
    // Employees cannot invoke branch administration by reusing a staff session.
    const adminOnly = req.path === '/users' || req.path === '/schema-status' ||
      req.path === '/assign' || req.path.startsWith('/user-permissions') ||
      (req.path === '/branches' && req.method !== 'GET') ||
      (req.path === '/branches' && req.method === 'GET' && !!session.branchId);
    if (adminOnly && session.role !== 'Developer' && session.role !== 'Owner') {
      res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      return;
    }
    next();
  });

  // On refresh, ensure the selected branch is still assigned and active.
  app.get('/api/branch-pilot/staff-session', async (_req, res) => {
    const s = res.locals.branchSession as AdminSession;
    if (!s.branchId) { res.status(401).json({ ok: false, error: 'BRANCH_SELECTION_REQUIRED' }); return; }
    try {
      const data = await useDatabase(async (db) => {
        const permitted = await staffAssignedBranches(db, s.userId, s.role);
        const branch = permitted.find((b) => b.branchId === s.branchId);
        if (!branch) return null;
        const permissions = await ownBranchPermissions({
          execute: (sql, params) => db.execute(sql, params as string[]),
        }, s.userId, s.branchId!);
        return { branch, permissions };
      });
      if (!data) { res.status(403).json({ ok: false, error: 'BRANCH_NOT_ASSIGNED' }); return; }
      res.json({ ok: true, userId: s.userId, role: s.role, username: s.username, ...data });
    } catch (error) { respondError(res, error); }
  });

  app.get('/api/branch-pilot/user-permissions', async (req, res) => {
    try {
      const rows = await useDatabase(async (db) => readBranchPermissions({
        execute: (sql, params) => db.execute(sql, params as string[]),
      }, res.locals.branchPrincipal, req.query.userId, req.query.branchId));
      res.json({ ok: true, rows });
    } catch (error) { respondError(res, error); }
  });
  app.post('/api/branch-pilot/user-permissions', async (req, res) => {
    try {
      await useDatabase(async (db) => saveBranchPermissions({
        execute: (sql, params) => db.execute(sql, params as string[]),
      }, res.locals.branchPrincipal, req.body?.userId, req.body?.branchId, req.body?.rows));
      res.json({ ok: true });
    } catch (error) { respondError(res, error); }
  });

  // Schema diagnostics are read-only and available only after the privileged
  // application account is authenticated on the server.
  app.get('/api/branch-pilot/schema-status', async (_req, res) => {
    try {
      const status = await useDatabase(async (db) => {
        const required = ['users', 'branches', 'user_branches', 'user_branch_permissions', 'branch_settings',
          'branch_test_prices', 'branch_inventory', 'branch_transfers',
          'branch_transfer_items', 'branch_sequences', 'branch_migration_audit'];
        const [rows] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
        );
        const existing = new Set(rows.map((r) => String(r.table_name)));
        const [nameRows] = await db.query<mysql.RowDataPacket[]>(
          'SELECT DATABASE() AS name',
        );
        const missing = required.filter((t) => !existing.has(t));
        return { database: String(nameRows[0]?.name || ''), missingTables: missing, ready: missing.length === 0 };
      });
      res.json({ ok: true, ...status });
    } catch (error) { respondError(res, error); }
  });

  app.get('/api/branch-pilot/branches', async (_req, res) => {
    try {
      const items = await useDatabase(async (db) =>
        listAccessibleBranches({ execute: (sql, params) => db.execute(sql, params as string[]) } as BranchDatabase, res.locals.branchPrincipal));
      res.json({ ok: true, branches: items });
    } catch (error) { respondError(res, error); }
  });

  app.post('/api/branch-pilot/branches', async (req, res) => {

    const nameAr = String(req.body?.nameAr || '').trim();
    const nameEn = String(req.body?.nameEn || '').trim();
    const id = `branch_${randomBytes(12).toString('hex')}`;
    try {
      const code = await useDatabase(async (db) => createBranch({
        execute: (sql, params) => db.execute(sql, params as string[]),
      }, res.locals.branchPrincipal, { id, nameAr, nameEn }));
      res.status(201).json({ ok: true, id, code });
    } catch (error) { respondError(res, error); }
  });

  app.get('/api/branch-pilot/users', async (_req, res) => {
    try {
      const users = await useDatabase(async (db) => {
        const [rows] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT id, username, full_name_ar, role FROM users WHERE active = 1 ORDER BY username',
        );
        return rows.map((row) => ({
          id: String(row.id), username: String(row.username),
          name: String(row.full_name_ar || row.username), role: String(row.role),
        }));
      });
      res.json({ ok: true, users });
    } catch (error) { respondError(res, error); }
  });

  app.post('/api/branch-pilot/assign', async (req, res) => {
    try {
      await useDatabase(async (db) => setUserBranchAssignment({
        execute: (sql, params) => db.execute(sql, params as string[]),
      }, res.locals.branchPrincipal, req.body?.userId, req.body?.branchId));
      res.json({ ok: true });
    } catch (error) { respondError(res, error); }
  });

  app.post('/api/branch-pilot/logout', (req, res) => {
    const token = cookieValue(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', secureCookie('', 0));
    res.json({ ok: true });
  });
}
