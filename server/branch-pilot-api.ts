import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { MYSQL_TABLES_CONFIG } from '../src/db/mysql-schema';
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
      const previous = getSession(req);
      sessions.set(token, { ...identity, username, branchId: previous?.userId === identity.userId ? previous.branchId : undefined, expires: Date.now() + SESSION_DURATION_MS });
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
    const adminOnly = req.path === '/users' || req.path === '/schema-status' || req.path === '/storage-audit' || req.path === '/migration-preflight' ||
      req.path === '/assign' || req.path.startsWith('/user-permissions') ||
      (req.path === '/branches' && req.method !== 'GET') ||
      (req.path === '/branches' && req.method === 'GET' && !!session.branchId) ||
      req.path === '/user-branches';
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

  app.get('/api/branch-pilot/user-branches', async (req, res) => {
    const userId = req.query.userId;
    if (!validBranchId(userId)) { res.status(400).json({ok:false,error:'INVALID_USER'}); return; }
    try {
      const branches = await useDatabase(async (db) => {
        const [rows] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT b.id, b.code, b.name_ar FROM user_branches ub INNER JOIN branches b ON b.id=ub.branch_id AND b.active=1 WHERE ub.user_id=? ORDER BY b.code',
          [userId],
        );
        return rows.map((row) => ({branchId:String(row.id),code:String(row.code),nameAr:String(row.name_ar)}));
      });
      res.json({ok:true,branches});
    } catch (error) {respondError(res,error);}
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

  /**
   * Read-only migration inventory. Never interpret a successful MySQL ping
   * or a complete table list as proof the browser modules use MySQL.
   * Available to an authenticated Owner or Developer only.
   */
  app.get('/api/branch-pilot/storage-audit', async (_req, res) => {
    try {
      const audit = await useDatabase(async (db) => {
        const [names] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()',
        );
        const present = new Set(names.map(row => String(row.name).toLowerCase()));
        const tables: Array<{
          store: string; mysqlTable: string; exists: boolean; mysqlRows: number | null;
        }> = [];
        for (const mapping of MYSQL_TABLES_CONFIG) {
          // Validate even constant identifiers, never accept table names from a request.
          if (!/^[a-z][a-z0-9_]*$/.test(mapping.mysqlTable)) {
            throw new Error('UNSAFE_SCHEMA_MAPPING');
          }
          const exists = present.has(mapping.mysqlTable.toLowerCase());
          let mysqlRows: number | null = null;
          if (exists) {
            const [countRows] = await db.query<mysql.RowDataPacket[]>(
              `SELECT COUNT(*) AS total FROM \`${mapping.mysqlTable}\``,
            );
            mysqlRows = Number(countRows[0]?.total || 0);
          }
          tables.push({ store: mapping.dexieTable, mysqlTable: mapping.mysqlTable, exists, mysqlRows });
        }
        const missing = tables.filter(item => !item.exists).map(item => item.mysqlTable);
        const [activeDb] = await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() AS schema_name');
        return {
          schema: String(activeDb[0]?.schema_name || ''),
          mappedStores: tables.length,
          tableCount: present.size,
          missingTables: missing,
          tables,
          allMappedTablesExist: missing.length === 0,
          // Frontend Dexie usage is independently audited; table existence
          // CANNOT attest that requests, results or invoices use MySQL.
          allScreensUseMySQL: false,
          browserDataReconciled: false,
          productionReady: false,
        };
      });
      res.json({ ok: true, ...audit });
    } catch (error) {
      respondError(res, error);
    }
  });

  /**
   * Read-only reconciliation of browser primary keys versus MySQL IDs.
   * Never copies, changes, deletes or overwrites records.
   * Only source IDs are submitted; no clinical values or passwords.
   */
  app.post('/api/branch-pilot/migration-preflight', async (req, res) => {
    const provided = req.body?.idsByStore;
    const allowed = MYSQL_TABLES_CONFIG;
    if (!provided || typeof provided !== 'object' || Array.isArray(provided) ||
        Object.keys(provided).length !== allowed.length ||
        allowed.some(m => !(m.dexieTable in provided))) {
      res.status(400).json({ ok: false, error: 'COMPLETE_49_STORE_ID_MANIFEST_REQUIRED' });
      return;
    }
    let submitted = 0;
    for (const mapping of allowed) {
      const ids: unknown = provided[mapping.dexieTable];
      if (!Array.isArray(ids) || ids.length > 100000 ||
          ids.some(id => typeof id !== 'string' || id.length < 1 || id.length > 191) ||
          new Set(ids).size !== ids.length) {
        res.status(400).json({ ok: false, error: 'INVALID_OR_DUPLICATE_STORE_IDS' });
        return;
      }
      submitted += ids.length;
    }
    if (submitted > 300000) {
      res.status(413).json({ ok: false, error: 'MIGRATION_MANIFEST_TOO_LARGE' });
      return;
    }
    try {
      const summary = await useDatabase(async (db) => {
        const [rows] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()',
        );
        const names = new Set(rows.map(row => String(row.name).toLowerCase()));
        const comparison: Array<{
          store:string; mysqlTable:string; mysqlTableExists:boolean;
          browserRecords:number; mysqlRecords:number|null;
          matchingIds:number; browserOnly:number; mysqlOnly:number|null;
        }> = [];
        for (const mapping of allowed) {
          const idList = provided[mapping.dexieTable] as string[];
          if (!/^[a-z][a-z0-9_]*$/.test(mapping.mysqlTable)) throw new Error('UNSAFE_SCHEMA_MAPPING');
          const exists = names.has(mapping.mysqlTable.toLowerCase());
          if (!exists) {
            comparison.push({store:mapping.dexieTable,mysqlTable:mapping.mysqlTable,
              mysqlTableExists:false,browserRecords:idList.length,mysqlRecords:null,
              matchingIds:0,browserOnly:idList.length,mysqlOnly:null});
            continue;
          }
          const [rowCount] = await db.query<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM \`${mapping.mysqlTable}\``,
          );
          const mysqlRecords = Number(rowCount[0]?.total || 0);
          let matchingIds = 0;
          for (let start = 0; start < idList.length; start += 400) {
            const chunk = idList.slice(start, start + 400);
            const [matched] = await db.query<mysql.RowDataPacket[]>(
              `SELECT id FROM \`${mapping.mysqlTable}\` WHERE id IN (${chunk.map(() => '?').join(',')})`,
              chunk,
            );
            matchingIds += matched.length;
          }
          comparison.push({ store:mapping.dexieTable,mysqlTable:mapping.mysqlTable,
            mysqlTableExists:true,browserRecords:idList.length,mysqlRecords,
            matchingIds,browserOnly:idList.length-matchingIds,
            mysqlOnly:Math.max(0,mysqlRecords-matchingIds) });
        }
        return comparison;
      });
      res.json({
        ok:true, readonly:true, noDataTransferred:true,
        // ID equality alone cannot guarantee clinical or financial field equality.
        fieldLevelReconciliationRequired:true,
        readyToDeleteIndexedDB:false,
        comparison:summary,
      });
    } catch(error) {
      respondError(res,error);
    }
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


  /**
   * Patient data is read FROM MYSQL, not from localStorage / Dexie.
   * The pilot's patient_branch_access map safely associates old patients
   * with branch_main, leaving other branches empty until explicitly populated.
   * Every operation re-checks the current session, branch assignment,
   * and user-specific screen permission on the server.
   */
  async function withPatientDb<T>(req: Request, action: 'view'|'add'|'edit'|'delete', fn:(db:mysql.Connection, session:AdminSession)=>Promise<T>):Promise<T> {
    const session = getSession(req);
    if (!session?.branchId) throw new Error('BRANCH_SELECTION_REQUIRED');
    const selectedBranchId: string = session.branchId;
    return useDatabase(async (db) => {
      const accessible = await staffAssignedBranches(db, session.userId, session.role);
      if (!accessible.some(b => b.branchId === selectedBranchId)) throw new Error('BRANCH_NOT_ASSIGNED');
      const rights = await ownBranchPermissions({
        execute: (sql, params) => db.execute(sql, params as string[]),
      }, session.userId, selectedBranchId);
      const explicit = rights.find(row => row.resource === 'patients');
      const permitted = session.role === 'Developer' ||
        (session.role === 'Owner' ? (!explicit || explicit.actions[action] === true) : explicit?.actions[action] === true);
      if (!permitted) throw new Error('FORBIDDEN');
      return fn(db, {...session,branchId:selectedBranchId});
    });
  }

  function patientFromRow(row: mysql.RowDataPacket): Record<string, unknown> {
    let raw: Record<string, unknown> = {};
    try {
      const obj = JSON.parse(String(row.raw_json || '{}')) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) raw = obj as Record<string,unknown>;
    } catch { /* Fall back to explicit columns for legacy imports. */ }
    return {
      ...raw,
      id:String(row.id), code:String(row.code || raw.code || ''),
      name:String(row.name || raw.name || ''),
      nameEn:String(row.name_en || raw.nameEn || ''),
      phone:String(row.phone || raw.phone || ''),
      gender:row.gender === 'female' ? 'female' : 'male',
      birthDate:String(row.birth_date || raw.birthDate || ''),
      age:Number(row.age || raw.age || 0),
      nationalId:String(row.national_id || raw.nationalId || ''),
      address:String(row.address || raw.address || ''),
      notes:String(raw.notes || ''),
      hasDefaultDiscount:raw.hasDefaultDiscount === true,
      defaultDiscountType:['fixed','percentage'].includes(String(raw.defaultDiscountType))
        ? raw.defaultDiscountType : 'none',
      defaultDiscountValue:Number(raw.defaultDiscountValue || 0),
      active:Number(row.active) === 1,
      createdAt:String(row.created_at || raw.createdAt || ''),
    };
  }

  function validatePatient(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('INVALID_PATIENT');
    const obj = input as Record<string,unknown>;
    const text = (key:string, max:number) => {
      const val = String(obj[key] ?? '').trim();
      if (val.length > max) throw new TypeError('INVALID_PATIENT_FIELD');
      return val;
    };
    const id=text('id',64), code=text('code',64), name=text('name',191);
    if (!validBranchId(id) || !code || !name) throw new TypeError('INVALID_PATIENT');
    if (obj.gender !== 'male' && obj.gender !== 'female') throw new TypeError('INVALID_GENDER');
    const age=Number(obj.age), discount=Number(obj.defaultDiscountValue);
    if (!Number.isFinite(age) || age<0 || age>130 ||
        !Number.isFinite(discount) || discount<0) throw new TypeError('INVALID_PATIENT_NUMBERS');
    const mode=['none','fixed','percentage'].includes(String(obj.defaultDiscountType))
      ? String(obj.defaultDiscountType) : 'none';
    if (mode === 'percentage' && discount>100) throw new TypeError('INVALID_DISCOUNT');
    const createdAt=text('createdAt',32) || new Date().toISOString().slice(0,10);
    const normalized = {
      id,code,name,nameEn:text('nameEn',191),phone:text('phone',64),
      gender:obj.gender,age,birthDate:text('birthDate',32),
      nationalId:text('nationalId',64),address:text('address',255),
      notes:text('notes',4000),
      hasDefaultDiscount:obj.hasDefaultDiscount === true,
      defaultDiscountType:mode,defaultDiscountValue:discount,
      active:obj.active !== false,createdAt,
    };
    return normalized;
  }

  function patientError(res:Response,error:unknown) {
    const message=error instanceof Error?error.message:'MYSQL_FAILURE';
    if (['FORBIDDEN','BRANCH_NOT_ASSIGNED'].includes(message)) {
      res.status(403).json({ok:false,error:message});return;
    }
    if (message==='BRANCH_SELECTION_REQUIRED') {
      res.status(401).json({ok:false,error:message});return;
    }
    if (message==='PATIENT_NOT_IN_BRANCH' || message==='PATIENT_HAS_HISTORY' ||
        message==='PATIENT_SHARED_WITH_OTHER_BRANCH') {
      res.status(409).json({ok:false,error:message});return;
    }
    if (error instanceof TypeError) {
      res.status(400).json({ok:false,error:message});return;
    }
    if ((error as {code?:string})?.code==='ER_DUP_ENTRY') {
      res.status(409).json({ok:false,error:'DUPLICATE_PATIENT_ID_OR_CODE'});return;
    }
    if ((error as {code?:string})?.code==='ER_NO_SUCH_TABLE') {
      res.status(409).json({ok:false,error:'PATIENT_BRANCH_MIGRATION_REQUIRED',
        hint:'Apply sql/tlab_patient_branch_access_v3.sql to a verified backup TEST copy of tlab_multibranch_pilot first'});return;
    }
    console.error('Scoped MySQL patients API:',message);
    res.status(503).json({ok:false,error:'MYSQL_PATIENTS_UNAVAILABLE'});
  }

  app.get('/api/branch-pilot/patients', async (req,res) => {
    try {
      const patients=await withPatientDb(req,'view',async(db,session)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT p.* FROM patients p INNER JOIN patient_branch_access pa ON pa.patient_id=p.id WHERE pa.branch_id=? AND p.active=1 ORDER BY p.code',
          [session.branchId!]);
        return rows.map(patientFromRow);
      });
      res.json({ok:true,source:'mysql',patients});
    } catch(error){patientError(res,error);}
  });

  app.post('/api/branch-pilot/patients', async(req,res)=>{
    try {
      const patient=validatePatient(req.body?.patient);
      const result=await withPatientDb(req,'add',async(db,session)=>{
        await db.beginTransaction();
        try {
          const [exists]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT id FROM patients WHERE id=? OR code=? LIMIT 1',[patient.id,patient.code]);
          if(exists.length) throw new TypeError('DUPLICATE_PATIENT_ID_OR_CODE');
          await db.execute(
            `INSERT INTO patients
              (id,code,name,name_en,gender,age,birth_date,phone,national_id,address,default_discount,created_at,active,raw_json)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [patient.id,patient.code,patient.name,patient.nameEn,patient.gender,patient.age,
              patient.birthDate,patient.phone,patient.nationalId,patient.address,patient.defaultDiscountValue,
              patient.createdAt,patient.active?1:0,JSON.stringify(patient)],
          );
          await db.execute(
            'INSERT INTO patient_branch_access(patient_id,branch_id,created_at,created_by) VALUES (?,?,NOW(),?)',
            [patient.id,session.branchId!,session.userId]);
          await db.commit();
          return patient;
        } catch(e){await db.rollback();throw e;}
      });
      res.status(201).json({ok:true,patient:result});
    } catch(error){patientError(res,error);}
  });

  app.put('/api/branch-pilot/patients/:id',async(req,res)=>{
    try {
      const patient=validatePatient(req.body?.patient);
      if(patient.id!==String(req.params.id || '')) throw new TypeError('PATIENT_ID_MISMATCH');
      await withPatientDb(req,'edit',async(db,session)=>{
        await db.beginTransaction();
        try {
          const [existing]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT p.id, p.code FROM patients p JOIN patient_branch_access pa ON pa.patient_id=p.id WHERE p.id=? AND pa.branch_id=? FOR UPDATE',
            [patient.id,session.branchId!]);
          if(!existing.length)throw new Error('PATIENT_NOT_IN_BRANCH');
          const [shared]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT COUNT(*) AS n FROM patient_branch_access WHERE patient_id=?',[patient.id]);
          if(Number(shared[0]?.n)>1)throw new Error('PATIENT_SHARED_WITH_OTHER_BRANCH');
          await db.execute(
            `UPDATE patients SET code=?,name=?,name_en=?,gender=?,age=?,birth_date=?,phone=?,national_id=?,address=?,
              default_discount=?,active=?,raw_json=? WHERE id=?`,
            [patient.code,patient.name,patient.nameEn,patient.gender,patient.age,patient.birthDate,
              patient.phone,patient.nationalId,patient.address,patient.defaultDiscountValue,
              patient.active?1:0,JSON.stringify(patient),patient.id]);
          await db.commit();
        } catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true});
    }catch(error){patientError(res,error);}
  });

  // Never hard-delete a clinical record. Retain historic references and
  // prevent disabling records with requests/invoices (audit-safe pilot).
  app.delete('/api/branch-pilot/patients/:id',async(req,res)=>{
    try{
      const id=String(req.params.id || '');
      if(!validBranchId(id))throw new TypeError('INVALID_PATIENT_ID');
      await withPatientDb(req,'delete',async(db,session)=>{
        await db.beginTransaction();
        try{
          const [rows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT p.id FROM patients p JOIN patient_branch_access pa ON pa.patient_id=p.id WHERE p.id=? AND pa.branch_id=? FOR UPDATE',
            [id,session.branchId!]);
          if(!rows.length)throw new Error('PATIENT_NOT_IN_BRANCH');
          const [usage]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT COUNT(*) AS n FROM lab_requests WHERE patient_id=?',[id]);
          if(Number(usage[0]?.n)>0)throw new Error('PATIENT_HAS_HISTORY');
          const [shared]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT COUNT(*) AS n FROM patient_branch_access WHERE patient_id=?',[id]);
          if(Number(shared[0]?.n)>1)throw new Error('PATIENT_SHARED_WITH_OTHER_BRANCH');
          await db.execute('UPDATE patients SET active=0 WHERE id=?',[id]);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,softDeleted:true});
    }catch(error){patientError(res,error);}
  });

  app.post('/api/branch-pilot/logout', (req, res) => {
    const token = cookieValue(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', secureCookie('', 0));
    res.json({ ok: true });
  });
}
