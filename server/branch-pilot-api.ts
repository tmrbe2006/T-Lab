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

  // Authenticated, append-only MySQL audit trail. Identity and branch always
  // come from the server session, never from values sent by the browser.
  app.post('/api/branch-pilot/audit-log', async (req, res) => {
    const session = getSession(req);
    if (!session?.branchId) {
      res.status(401).json({ ok:false, error:'BRANCH_SELECTION_REQUIRED' });
      return;
    }
    const action = String(req.body?.action || '').trim();
    const screen = String(req.body?.screen || '').trim();
    const recordId = String(req.body?.recordId || '').trim();
    const details = String(req.body?.details || '');
    if (!action || action.length > 191 || !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(screen) ||
        recordId.length > 64 || details.length > 2000) {
      res.status(400).json({ ok:false, error:'INVALID_AUDIT_EVENT' });
      return;
    }
    try {
      const id = 'aud_' + randomBytes(16).toString('hex');
      await useDatabase(async db => {
        const permitted = await staffAssignedBranches(db, session.userId, session.role);
        if (!permitted.some(b => b.branchId === session.branchId)) {
          throw new Error('BRANCH_NOT_ASSIGNED');
        }
        const record = {
          id, userId:session.userId, username:session.username, role:session.role,
          action, screen, recordId, timestamp:new Date().toISOString(), details,
        };
        await db.beginTransaction();
        try {
          await db.execute(
            'INSERT INTO audit_logs(id,user_id,username,role,screen,action,record_id,timestamp,raw_json) VALUES(?,?,?,?,?,?,?,?,?)',
            [id, session.userId, session.username, session.role, screen, action,
              recordId, record.timestamp, JSON.stringify(record)],
          );
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            ['auditLogs', id, session.branchId, session.userId],
          );
          await db.commit();
        } catch (error) {
          await db.rollback();
          throw error;
        }
      });
      res.status(201).json({ ok:true, source:'mysql', id });
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
        const [columnRows] = await db.execute<mysql.RowDataPacket[]>(
          'SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
        );
        const columns = new Set(columnRows.map(row =>
          `${String(row.table_name).toLowerCase()}.${String(row.column_name).toLowerCase()}`));
        const tables: Array<{
          store: string; mysqlTable: string; exists: boolean; mysqlRows: number | null;
          missingColumns: string[];
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
          const missingColumns = exists ?
            [...mapping.columns.map(column => column.name), 'raw_json'].filter(column =>
              !columns.has(`${mapping.mysqlTable.toLowerCase()}.${column.toLowerCase()}`)) : [];
          tables.push({
            store: mapping.dexieTable, mysqlTable: mapping.mysqlTable,
            exists, mysqlRows, missingColumns,
          });
        }
        const missing = tables.filter(item => !item.exists).map(item => item.mysqlTable);
        const missingColumns = tables.filter(item => item.missingColumns.length > 0)
          .map(item => ({table: item.mysqlTable, columns: item.missingColumns}));
        const [activeDb] = await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() AS schema_name');
        return {
          schema: String(activeDb[0]?.schema_name || ''),
          mappedStores: tables.length,
          tableCount: present.size,
          missingTables: missing,
          missingColumns,
          tables,
          allMappedTablesExist: missing.length === 0,
          allMappedColumnsExist: missingColumns.length === 0,
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
        hint:'Apply sql/tlab_all_49_store_branch_access_v8.sql to a verified backup TEST copy first'});return;
    }
    console.error('Scoped MySQL patients API:',message);
    res.status(503).json({ok:false,error:'MYSQL_PATIENTS_UNAVAILABLE'});
  }

  app.get('/api/branch-pilot/patients', async (req,res) => {
    try {
      const patients=await withPatientDb(req,'view',async(db,session)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT p.* FROM patients p INNER JOIN mysql_store_branch_access pa ON pa.record_id=p.id AND pa.store_name=\'patients\' WHERE pa.branch_id=? AND p.active=1 ORDER BY p.code',
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
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES (?,?,?,NOW(),?)',
            ['patients',patient.id,session.branchId!,session.userId]);
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
            'SELECT p.id, p.code FROM patients p JOIN mysql_store_branch_access pa ON pa.record_id=p.id AND pa.store_name=\'patients\' WHERE p.id=? AND pa.branch_id=? FOR UPDATE',
            [patient.id,session.branchId!]);
          if(!existing.length)throw new Error('PATIENT_NOT_IN_BRANCH');
          const [shared]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT COUNT(*) AS n FROM mysql_store_branch_access WHERE store_name=\'patients\' AND record_id=?',[patient.id]);
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
            'SELECT p.id FROM patients p JOIN mysql_store_branch_access pa ON pa.record_id=p.id AND pa.store_name=\'patients\' WHERE p.id=? AND pa.branch_id=? FOR UPDATE',
            [id,session.branchId!]);
          if(!rows.length)throw new Error('PATIENT_NOT_IN_BRANCH');
          const [usage]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT COUNT(*) AS n FROM lab_requests WHERE patient_id=?',[id]);
          if(Number(usage[0]?.n)>0)throw new Error('PATIENT_HAS_HISTORY');
          const [shared]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT COUNT(*) AS n FROM mysql_store_branch_access WHERE store_name=\'patients\' AND record_id=?',[id]);
          if(Number(shared[0]?.n)>1)throw new Error('PATIENT_SHARED_WITH_OTHER_BRANCH');
          await db.execute('UPDATE patients SET active=0 WHERE id=?',[id]);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,softDeleted:true});
    }catch(error){patientError(res,error);}
  });


  // Branch-scoped, MySQL-only HOME VISITS pilot. No browser fallback.
  // Migration: sql/tlab_home_visits_branch_access_v5.sql, after verified backups.
  async function withHomeVisitDb<T>(
    req: Request, action: 'view'|'add'|'edit'|'delete',
    fn: (db:mysql.Connection, session:AdminSession)=>Promise<T>,
  ):Promise<T> {
    const session=getSession(req);
    if(!session?.branchId) throw new Error('BRANCH_SELECTION_REQUIRED');
    return useDatabase(async db=>{
      const branches=await staffAssignedBranches(db,session.userId,session.role);
      if(!branches.some(b=>b.branchId===session.branchId)) throw new Error('BRANCH_NOT_ASSIGNED');
      const rows=await ownBranchPermissions({execute:(sql,params)=>db.execute(sql,params as string[])},session.userId,session.branchId!);
      const explicit=rows.find(row=>row.resource==='homeVisits');
      if(!(session.role==='Developer' || (session.role==='Owner'
        ? (!explicit || explicit.actions[action]===true)
        : explicit?.actions[action]===true))) throw new Error('FORBIDDEN');
      return fn(db,session);
    });
  }
  function homeVisitError(res:Response,error:unknown):void {
    const msg=error instanceof Error?error.message:'MYSQL_HOME_VISITS_UNAVAILABLE';
    if(msg==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:msg});return;}
    if(['FORBIDDEN','BRANCH_NOT_ASSIGNED'].includes(msg)){res.status(403).json({ok:false,error:msg});return;}
    if(['VISIT_NOT_IN_BRANCH','DUPLICATE_VISIT','PATIENT_NOT_IN_BRANCH'].includes(msg)){
      res.status(409).json({ok:false,error:msg});return;
    }
    if(error instanceof TypeError){res.status(400).json({ok:false,error:'INVALID_HOME_VISIT'});return;}
    if((error as {code?:string})?.code==='ER_NO_SUCH_TABLE'){
      res.status(409).json({ok:false,error:'HOME_VISITS_SCHEMA_MIGRATION_REQUIRED'});return;
    }
    console.error('MySQL home visit failure:',msg);
    res.status(503).json({ok:false,error:'MYSQL_HOME_VISITS_UNAVAILABLE'});
  }
  function homeVisitValue(input:unknown) {
    if(!input || typeof input!=='object' || Array.isArray(input)) throw new TypeError('INVALID_HOME_VISIT');
    const obj=input as Record<string,unknown>;
    const str=(key:string,max:number)=>{
      const value=String(obj[key]??'').trim();
      if(value.length>max)throw new TypeError('INVALID_HOME_VISIT_FIELD');
      return value;
    };
    const id=str('id',64),visitNumber=str('visitNumber',64),patientId=str('patientId',64);
    if(!validBranchId(id)||!visitNumber||!validBranchId(patientId))throw new TypeError('INVALID_HOME_VISIT');
    const allowed=['scheduled','dispatched','sample_collected','delivered_to_lab','completed','cancelled'];
    const status=str('status',32);
    if(!allowed.includes(status))throw new TypeError('INVALID_HOME_VISIT_STATUS');
    const fee=Number(obj.visitFee);
    if(!Number.isFinite(fee)||fee<0||fee>100000000)throw new TypeError('INVALID_HOME_VISIT_FEE');
    const rec={...obj,id,visitNumber,patientId,status,visitFee:fee,
      patientName:str('patientName',191),patientPhone:str('patientPhone',64),
      address:str('address',255),scheduledDate:str('scheduledDate',32),
      phlebotomistName:str('phlebotomistName',191)};
    if(JSON.stringify(rec).length>48000)throw new TypeError('HOME_VISIT_TOO_LARGE');
    return rec;
  }
  async function requireHomeVisitPatient(db:mysql.Connection,patientId:string,branchId:string){
    const [rows]=await db.execute<mysql.RowDataPacket[]>(
      'SELECT 1 AS allowed FROM mysql_store_branch_access a JOIN patients p ON p.id=a.record_id WHERE a.store_name=\'patients\' AND a.record_id=? AND a.branch_id=? AND p.active=1 LIMIT 1',
      [patientId,branchId]);
    if(!rows.length)throw new Error('PATIENT_NOT_IN_BRANCH');
  }
  app.get('/api/branch-pilot/home-visits/staff',async(req,res)=>{
    try {
      const staff=await withHomeVisitDb(req,'view',async(db,session)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT u.id,u.full_name_ar,u.raw_json FROM users u INNER JOIN user_branches ub ON ub.user_id=u.id WHERE ub.branch_id=? AND u.active=1 AND u.role IN (\'Technician\',\'Chemist\') ORDER BY u.full_name_ar',
          [session.branchId!]);
        return rows.map(row=>{
          let raw:Record<string,unknown>={};
          try{const parsed=JSON.parse(String(row.raw_json||'{}'));if(parsed && typeof parsed==='object' && !Array.isArray(parsed))raw=parsed;}
          catch{/* no local fallback */}
          return {id:String(row.id),nameAr:String(row.full_name_ar||raw.fullNameAr||''),
            phone:String(raw.phone||'')};
        });
      });
      res.json({ok:true,source:'mysql',staff});
    }catch(e){homeVisitError(res,e);}
  });
  app.get('/api/branch-pilot/home-visits',async(req,res)=>{
    try{
      const visits=await withHomeVisitDb(req,'view',async(db,session)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT v.* FROM home_visits v JOIN mysql_store_branch_access a ON a.record_id=v.id AND a.store_name=\'homeVisits\' WHERE a.branch_id=? ORDER BY v.scheduled_date DESC',
          [session.branchId!]);
        return rows.map(row=>{
          let raw:Record<string,unknown>={};
          try {const parsed=JSON.parse(String(row.raw_json||'{}'));if(parsed && typeof parsed==='object' && !Array.isArray(parsed))raw=parsed;}
          catch{/* legacy relational data */}
          return {...raw,id:String(row.id),visitNumber:String(row.visit_number),
            patientId:String(row.patient_id||''),patientName:String(row.patient_name||''),
            patientPhone:String(row.patient_phone||''),address:String(row.address||''),
            scheduledDate:String(row.scheduled_date||''),phlebotomistName:String(row.phlebotomist_name||''),
            visitFee:Number(row.visit_fee||0),status:String(row.status||'scheduled'),
            createdAt:String(raw.createdAt||row.scheduled_date||'')};
        });
      });
      res.json({ok:true,source:'mysql',visits});
    }catch(e){homeVisitError(res,e);}
  });
  app.post('/api/branch-pilot/home-visits',async(req,res)=>{
    try{
      const rec=homeVisitValue(req.body?.visit);
      await withHomeVisitDb(req,'add',async(db,session)=>{
        await db.beginTransaction();
        try{
          await requireHomeVisitPatient(db,String(rec.patientId),session.branchId!);
          const [existing]=await db.execute<mysql.RowDataPacket[]>('SELECT id FROM home_visits WHERE id=? LIMIT 1',[rec.id]);
          if(existing.length)throw new Error('DUPLICATE_VISIT');
          await db.execute(
            'INSERT INTO home_visits (id,visit_number,patient_id,patient_name,patient_phone,address,scheduled_date,phlebotomist_name,visit_fee,status,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [rec.id,rec.visitNumber,rec.patientId,rec.patientName,rec.patientPhone,rec.address,rec.scheduledDate,rec.phlebotomistName,rec.visitFee,rec.status,JSON.stringify(rec)]);
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            ['homeVisits',rec.id,session.branchId!,session.userId]);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.status(201).json({ok:true,source:'mysql'});
    }catch(e){homeVisitError(res,e);}
  });
  app.put('/api/branch-pilot/home-visits/:id',async(req,res)=>{
    try{
      const rec=homeVisitValue(req.body?.visit);
      if(rec.id!==req.params.id)throw new TypeError('INVALID_VISIT_ID');
      await withHomeVisitDb(req,'edit',async(db,session)=>{
        await db.beginTransaction();
        try{
          const [rows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT v.id FROM home_visits v JOIN mysql_store_branch_access a ON a.record_id=v.id AND a.store_name=\'homeVisits\' WHERE v.id=? AND a.branch_id=? FOR UPDATE',
            [rec.id,session.branchId!]);
          if(!rows.length)throw new Error('VISIT_NOT_IN_BRANCH');
          await requireHomeVisitPatient(db,String(rec.patientId),session.branchId!);
          await db.execute('UPDATE home_visits SET visit_number=?,patient_id=?,patient_name=?,patient_phone=?,address=?,scheduled_date=?,phlebotomist_name=?,visit_fee=?,status=?,raw_json=? WHERE id=?',
            [rec.visitNumber,rec.patientId,rec.patientName,rec.patientPhone,rec.address,rec.scheduledDate,rec.phlebotomistName,rec.visitFee,rec.status,JSON.stringify(rec),rec.id]);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,source:'mysql'});
    }catch(e){homeVisitError(res,e);}
  });
  // Clinical history must be retained: hide cancelled records instead of physically deleting them.
  app.delete('/api/branch-pilot/home-visits/:id',async(req,res)=>{
    try{
      await withHomeVisitDb(req,'delete',async(db,session)=>{
        await db.beginTransaction();
        try{
          const [rows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT v.* FROM home_visits v JOIN mysql_store_branch_access a ON a.record_id=v.id AND a.store_name=\'homeVisits\' WHERE v.id=? AND a.branch_id=? FOR UPDATE',
            [req.params.id,session.branchId!]);
          if(!rows.length)throw new Error('VISIT_NOT_IN_BRANCH');
          const row=rows[0];let raw:Record<string,unknown>={};
          try{raw=JSON.parse(String(row.raw_json||'{}'));}catch{/* legacy */}
          await db.execute('UPDATE home_visits SET status=?,raw_json=? WHERE id=?',
            ['cancelled',JSON.stringify({...raw,id:String(row.id),status:'cancelled'}),req.params.id]);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,softDeleted:true,source:'mysql'});
    }catch(e){homeVisitError(res,e);}
  });


  /**
   * Financial read-side migration: all results are server-authorized MySQL rows
   * in the selected branch. No browser source, fake records or client table names.
   * Writes are deliberately NOT enabled until the complete invoice/payment/ledger
   * transaction and reconciliation contracts have been migrated.
   */
  const financeTables = {
    invoices: {table:'invoices',permission:'invoices'},
    invoiceItems: {table:'invoice_items',permission:'invoices'},
    payments: {table:'payments',permission:'payments'},
    journalEntries: {table:'journal_entries',permission:'journalEntries'},
    accounts: {table:'chart_of_accounts',permission:'accounts'},
    cashbox: {table:'cashbox_sessions',permission:'cashbox'},
    dailyClosings: {table:'daily_closings',permission:'cashbox'},
    expenses: {table:'expenses',permission:'expenses'},
    commissions: {table:'doctor_commissions',permission:'commissions'},
    costCenters: {table:'cost_centers',permission:'erpAccounting'},
    periodLocks: {table:'period_locks',permission:'erpAccounting'},
  } as const;
  type FinanceResource=keyof typeof financeTables;
  const financeResource=(value:unknown): FinanceResource|null =>
    typeof value==='string' && Object.prototype.hasOwnProperty.call(financeTables,value)
      ? value as FinanceResource : null;

  async function financeRead<T>(
    req:Request,resource:FinanceResource,
    fn:(db:mysql.Connection,branchId:string,table:string)=>Promise<T>,
  ):Promise<T>{
    const session=getSession(req);
    if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
    return useDatabase(async db=>{
      const assigned=await staffAssignedBranches(db,session.userId,session.role);
      if(!assigned.some(b=>b.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
      const rights=await ownBranchPermissions({execute:(sql,params)=>db.execute(sql,params as string[])},session.userId,session.branchId!);
      const rule=rights.find(x=>x.resource===financeTables[resource].permission);
      if(!(session.role==='Developer' || (session.role==='Owner'
        ? (!rule||rule.actions.view===true) : rule?.actions.view===true)))throw new Error('FORBIDDEN');
      return fn(db,session.branchId!,financeTables[resource].table);
    });
  }
  const snakeToCamel=(key:string)=>key.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
  function financialRow(row:mysql.RowDataPacket):Record<string,unknown>{
    let raw:Record<string,unknown>={};
    try {
      const parsed:unknown=JSON.parse(String(row.raw_json||'{}'));
      if(parsed && typeof parsed==='object'&&!Array.isArray(parsed))raw=parsed as Record<string,unknown>;
    }catch{/* Use explicit database columns when legacy raw_json is absent. */}
    const normalized:Record<string,unknown>={...raw};
    for(const [key,value] of Object.entries(row)){
      if(key==='raw_json')continue;
      const field=snakeToCamel(key);
      normalized[field]=value===null?null:typeof value==='number'?value:
        /^(?:subtotal|discount_amount|tax_amount|net_total|paid_amount|remaining_amount|amount|price|total_debit|total_credit|opening_balance|total_collected|total_expenses|net_cash|balance|commission_amount)$/.test(key)
          ? Number(value):value;
    }
    return normalized;
  }
  function financeReadError(res:Response,error:unknown):void{
    const message=error instanceof Error?error.message:'MYSQL_FINANCE_UNAVAILABLE';
    if(message==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:message});return;}
    if(['FORBIDDEN','BRANCH_NOT_ASSIGNED'].includes(message)){res.status(403).json({ok:false,error:message});return;}
    if((error as {code?:string})?.code==='ER_NO_SUCH_TABLE'){
      res.status(409).json({ok:false,error:'MYSQL_FINANCE_BRANCH_MIGRATION_REQUIRED'});return;
    }
    console.error('Financial MySQL read failure:',message);
    res.status(503).json({ok:false,error:'MYSQL_FINANCE_UNAVAILABLE'});
  }
  app.get('/api/branch-pilot/finance/:resource',async(req,res)=>{
    const resource=financeResource(req.params.resource);
    if(!resource){res.status(404).json({ok:false,error:'INVALID_FINANCE_RESOURCE'});return;}
    try{
      const records=await financeRead(req,resource,async(db,branchId,table)=>{
        // table comes ONLY from immutable server whitelist above.
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT t.* FROM `'+table+'` t INNER JOIN mysql_store_branch_access b ON b.record_id=t.id AND b.store_name=? AND b.branch_id=? ORDER BY t.id',
          [({invoices:'invoices',invoiceItems:'invoiceItems',payments:'payments',journalEntries:'journalEntries',accounts:'chartOfAccounts',cashbox:'cashboxSessions',dailyClosings:'dailyClosings',expenses:'expenses',commissions:'commissions',costCenters:'costCenters',periodLocks:'periodLocks'} as Record<string,string>)[resource],branchId]);
        return rows.map(financialRow);
      });
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,source:'mysql',resource,records});
    }catch(error){financeReadError(res,error);}
  });


  // Diagnostic only: compare invoice paid amounts and journal totals with MySQL.
  // No automatic correction of financial postings is allowed.
  app.get('/api/branch-pilot/finance-reconciliation',async(req,res)=>{
    try {
      const report=await financeRead(req,'invoices',async(db,branchId)=>{
        // A full financial audit also requires permissions to inspect payments
        // and journal postings; do not leak figures to invoice-only users.
        const session=getSession(req)!;
        const rights=await ownBranchPermissions({execute:(sql,params)=>db.execute(sql,params as string[])},session.userId,branchId);
        for(const resource of ['payments','journalEntries']){
          const explicit=rights.find(row=>row.resource===resource);
          if(!(session.role==='Developer' || (session.role==='Owner'
            ? (!explicit||explicit.actions.view===true)
            : explicit?.actions.view===true)))throw new Error('FORBIDDEN');
        }
        const [invoiceRows]=await db.execute<mysql.RowDataPacket[]>(`
          SELECT i.id,i.invoice_number,i.paid_amount,
            COALESCE(SUM(CASE WHEN pa.record_id IS NOT NULL THEN p.amount ELSE 0 END),0) AS paid_from_receipts
          FROM invoices i
          JOIN mysql_store_branch_access a
            ON a.store_name='invoices' AND a.record_id=i.id AND a.branch_id=?
          LEFT JOIN payments p ON p.invoice_id=i.id
          LEFT JOIN mysql_store_branch_access pa
            ON pa.store_name='payments' AND pa.record_id=p.id AND pa.branch_id=?
          GROUP BY i.id,i.invoice_number,i.paid_amount
        `,[branchId,branchId]);
        const [journalRows]=await db.execute<mysql.RowDataPacket[]>(`
          SELECT j.id,j.entry_number,j.total_debit,j.total_credit
          FROM journal_entries j
          JOIN mysql_store_branch_access a
            ON a.store_name='journalEntries' AND a.record_id=j.id AND a.branch_id=?
        `,[branchId]);
        const invoiceDiscrepancies=invoiceRows.filter(row=>
          Math.abs(Number(row.paid_amount||0)-Number(row.paid_from_receipts||0))>0.009
        ).map(row=>({
          id:String(row.id),invoiceNumber:String(row.invoice_number),
          recordedPaid:Number(row.paid_amount||0),receiptTotal:Number(row.paid_from_receipts||0),
        }));
        const journalDiscrepancies=journalRows.filter(row=>
          Math.abs(Number(row.total_debit||0)-Number(row.total_credit||0))>0.009
        ).map(row=>({
          id:String(row.id),entryNumber:String(row.entry_number),
          debit:Number(row.total_debit||0),credit:Number(row.total_credit||0),
        }));
        return {branchId,invoicesChecked:invoiceRows.length,journalsChecked:journalRows.length,
          invoiceDiscrepancies,journalDiscrepancies,
          readyForProduction:false,
          note:'Read-side consistency check only. Source data migration, receipt allocation and line-level journal audit still required.'};
      });
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,source:'mysql',report});
    }catch(e){financeReadError(res,e);}
  });


  app.get('/api/branch-pilot/doctors',async(req,res)=>{
    try {
      const doctors=await useDatabase(async db=>{
        const session=getSession(req);
        if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
        const branches=await staffAssignedBranches(db,session.userId,session.role);
        if(!branches.some(b=>b.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const rights=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId);
        const rule=rights.find(row=>row.resource==='doctors');
        if(!(session.role==='Developer' || (session.role==='Owner'
          ? (!rule||rule.actions.view===true) : rule?.actions.view===true)))throw new Error('FORBIDDEN');
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT d.* FROM doctors d INNER JOIN mysql_store_branch_access a ON a.record_id=d.id AND a.store_name=\'doctors\' WHERE a.branch_id=? AND d.active=1 ORDER BY d.code',
          [session.branchId]);
        return rows.map(row=>{
          let raw:Record<string,unknown>={};
          try{const parsed:unknown=JSON.parse(String(row.raw_json||'{}'));
            if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))raw=parsed as Record<string,unknown>;}
          catch{/* relational fallback */}
          return {...raw,id:String(row.id),code:String(row.code||''),nameAr:String(row.name_ar||''),
            nameEn:String(row.name_en||''),specialty:String(row.specialty||''),
            phone:String(row.phone||''),type:String(row.type||''),
            commissionRate:Number(row.commission_rate||0),commissionEnabled:Number(row.commission_enabled)===1,
            active:Number(row.active)===1};
        });
      });
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,source:'mysql',doctors});
    }catch(e){financeReadError(res,e);}
  });


  // Centralized MySQL-only read API for ALL 49 registered stores.
  // Access to each record is explicitly scoped to the authenticated branch.
  // This is a read-side cutover foundation; never exposes unsafely migrated writes.
  const storePermissions: Record<string,string> = {
    invoiceItems:'invoices', requestItems:'requests',testBOMs:'inventory',
    inventoryLots:'inventory',stockMovements:'inventory',stockTakingSessions:'inventory',
    purchaseInvoices:'purchases',returnNotes:'purchases',chartOfAccounts:'accounts',
    costCenters:'erpAccounting',periodLocks:'erpAccounting',journalEntries:'journalEntries',
    cashboxSessions:'cashbox',dailyClosings:'cashbox',commissions:'commissions',
    auditLogs:'settings',roles:'permissions',permissions:'permissions',
    aiImageAnalyses:'aiHub',aiRecognitionFindings:'aiHub',aiCorrections:'aiHub',
    microscopyScans:'aiHub',criticalValueLogs:'resultReview',
    cultureResults:'microbiology',antibioticsCatalog:'microbiology',
    qcControlLots:'qualityControl',qcRuns:'qualityControl',
    referenceLabPartners:'homeVisits',labToLabDispatches:'homeVisits',
    settings:'settings',users:'users',employees:'employees',
    doctorSpecialties:'doctorSpecialties',scientificDepartments:'scientificDepartments',
    sampleTubes:'sampleTubes',testParameters:'testParameters',
    corporateContracts:'corporateContracts',
  };
  const restrictedStores=new Set(['users','roles','permissions','auditLogs','settings']);
  const mysqlStoreMapping=new Map(MYSQL_TABLES_CONFIG.map(m=>[m.dexieTable,m]));
  function sanitizeMySQLStoreRow(store:string,row:mysql.RowDataPacket):Record<string,unknown> {
    let raw:Record<string,unknown>={};
    try{
      const parsed:unknown=JSON.parse(String(row.raw_json||'{}'));
      if(parsed && typeof parsed==='object'&&!Array.isArray(parsed))raw=parsed as Record<string,unknown>;
    }catch{/* retained SQL columns are still available */}
    // Application-user password material and integration secrets must NEVER leave this endpoint.
    for(const key of Object.keys(raw)){
      if(/password|secret|api.?key|token|private.?key|credential/i.test(key))delete raw[key];
    }
    const result:Record<string,unknown>={...raw};
    for(const [key,value] of Object.entries(row)){
      if(key==='raw_json')continue;
      const prop=key.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase());
      // raw_json preserves original medical names, date types, arrays, formulas
      // and precision. Do not overwrite these with derived SQL search columns.
      if(prop==='id' || !(prop in result))result[prop]=value;
    }
    return result;
  }
  app.get('/api/branch-pilot/mysql-store/:store',async(req,res)=>{
    try{
      const store=String(req.params.store||'');
      const mapped=mysqlStoreMapping.get(store);
      if(!mapped){res.status(404).json({ok:false,error:'UNKNOWN_STORE'});return;}
      const rawLimit=Number(req.query.limit??200),rawOffset=Number(req.query.offset??0);
      if(!Number.isInteger(rawLimit)||rawLimit<1||rawLimit>500||
          !Number.isInteger(rawOffset)||rawOffset<0||rawOffset>10000000){
        res.status(400).json({ok:false,error:'INVALID_PAGINATION'});return;
      }
      const session=getSession(req);
      if(!session?.branchId){res.status(401).json({ok:false,error:'BRANCH_SELECTION_REQUIRED'});return;}
      const data=await useDatabase(async db=>{
        const branches=await staffAssignedBranches(db,session.userId,session.role);
        if(!branches.some(b=>b.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const permission=storePermissions[store]||store;
        const rights=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId!);
        const rule=rights.find(r=>r.resource===permission);
        if(restrictedStores.has(store) && session.role!=='Developer' && session.role!=='Owner')throw new Error('FORBIDDEN');
        if(!(session.role==='Developer'||(session.role==='Owner'
          ? (!rule||rule.actions.view===true):rule?.actions.view===true)))throw new Error('FORBIDDEN');
        // SQL identifiers are server-controlled from MYSQL_TABLES_CONFIG, never request input.
        const sqlTable='`'+mapped.mysqlTable+'`';
        const [countRows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS total FROM '+sqlTable+' t INNER JOIN mysql_store_branch_access a ON a.record_id=t.id WHERE a.store_name=? AND a.branch_id=?',
          [store,session.branchId!]);
        const [rows]=await db.query<mysql.RowDataPacket[]>(
          'SELECT t.* FROM '+sqlTable+' t INNER JOIN mysql_store_branch_access a ON a.record_id=t.id WHERE a.store_name=? AND a.branch_id=? ORDER BY t.id LIMIT ? OFFSET ?',
          [store,session.branchId!,rawLimit,rawOffset]);
        return {total:Number(countRows[0]?.total||0),records:rows.map(row=>sanitizeMySQLStoreRow(store,row))};
      });
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,source:'mysql',store,...data,limit:rawLimit,offset:rawOffset});
    }catch(error){financeReadError(res,error);}
  });


  // Safe master catalog write pilot: non-financial, no result/ledger postings.
  const mysqlMasterEditable=new Set(['doctorSpecialties','scientificDepartments','sampleTubes']);
  async function writeMasterStore(req:Request,res:Response,mode:'save'|'archive') {
    const store=String(req.params.store||'');
    if(!mysqlMasterEditable.has(store)){res.status(403).json({ok:false,error:'DEDICATED_TRANSACTION_API_REQUIRED'});return;}
    const mapping=mysqlStoreMapping.get(store);
    if(!mapping){res.status(404).json({ok:false,error:'UNKNOWN_STORE'});return;}
    try{
      const session=getSession(req);
      if(!session?.branchId){res.status(401).json({ok:false,error:'BRANCH_SELECTION_REQUIRED'});return;}
      const record=req.body?.record;
      if(mode==='save' && (!record||typeof record!=='object'||Array.isArray(record))){
        res.status(400).json({ok:false,error:'INVALID_RECORD'});return;
      }
      const id=String(mode==='archive'?req.params.id:record.id||'');
      if(!validBranchId(id)){res.status(400).json({ok:false,error:'INVALID_RECORD_ID'});return;}
      if(mode==='save' && JSON.stringify(record).length>32000){
        res.status(413).json({ok:false,error:'RECORD_TOO_LARGE'});return;
      }
      await useDatabase(async db=>{
        const branches=await staffAssignedBranches(db,session.userId,session.role);
        if(!branches.some(b=>b.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const rights=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId!);
        const rule=rights.find(r=>r.resource===store);
        await db.beginTransaction();
        try{
          const [existing]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT t.id,t.raw_json FROM `'+mapping.mysqlTable+'` t WHERE t.id=? FOR UPDATE',[id]);
          const isNew=existing.length===0;
          const action=mode==='archive'?'delete':isNew?'add':'edit';
          if(!(session.role==='Developer'||(session.role==='Owner'
            ? (!rule||rule.actions[action]===true) : rule?.actions[action]===true)))throw new Error('FORBIDDEN');
          if(!isNew){
            const [access]=await db.execute<mysql.RowDataPacket[]>(
              'SELECT 1 AS allowed FROM mysql_store_branch_access WHERE store_name=? AND record_id=? AND branch_id=?',
              [store,id,session.branchId!]);
            if(!access.length)throw new Error('RECORD_NOT_IN_BRANCH');
          }
          if(mode==='archive'){
            if(isNew)throw new Error('RECORD_NOT_FOUND');
            let source:Record<string,unknown>={};
            try{source=JSON.parse(String(existing[0].raw_json||'{}')) as Record<string,unknown>;}catch{}
            const updated={...source,id,active:false};
            await db.execute('UPDATE `'+mapping.mysqlTable+'` SET active=0,raw_json=? WHERE id=?',
              [JSON.stringify(updated),id]);
          }else{
            const obj=record as Record<string,unknown>;
            if(typeof obj.code!=='string'||obj.code.length<1||obj.code.length>64 ||
               typeof obj.nameAr!=='string'||obj.nameAr.length<1||obj.nameAr.length>191)
              throw new TypeError('INVALID_MASTER_RECORD');
            const columns=[...mapping.columns.map(c=>c.name),'raw_json'];
            const values=[...mapping.columns.map(c=>c.extract(obj)),JSON.stringify(obj)];
            const table='`'+mapping.mysqlTable+'`';
            if(isNew){
              await db.execute('INSERT INTO '+table+' ('+columns.map(c=>'`'+c+'`').join(',')+
                ') VALUES ('+columns.map(()=>'?').join(',')+')',values);
              await db.execute(
                'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
                [store,id,session.branchId!,session.userId]);
            }else{
              const fields=columns.filter(c=>c!=='id');
              const newValues=values.filter((_,i)=>columns[i]!=='id');
              await db.execute('UPDATE '+table+' SET '+fields.map(c=>'`'+c+'`=?').join(',')+' WHERE id=?',
                [...newValues,id]);
            }
          }
          // Audit in the existing 49-table schema: no extra SQL migration required.
          const auditId='aud_'+randomBytes(16).toString('hex');
          const audit={id:auditId,userId:session.userId,username:session.username,
            role:session.role,screen:store,action,recordId:id,
            timestamp:new Date().toISOString(),details:'MySQL master '+action};
          await db.execute(
            'INSERT INTO audit_logs(id,user_id,username,role,screen,action,record_id,timestamp,raw_json) VALUES(?,?,?,?,?,?,?,?,?)',
            [audit.id,audit.userId,audit.username,audit.role,audit.screen,audit.action,
              audit.recordId,audit.timestamp,JSON.stringify(audit)]);
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            ['auditLogs',auditId,session.branchId!,session.userId]);
          await db.commit();
        }catch(error){await db.rollback();throw error;}
      });
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,source:'mysql',store,id});
    }catch(error){
      const message=error instanceof Error?error.message:'MYSQL_STORE_WRITE_FAILED';
      if(error instanceof TypeError){res.status(400).json({ok:false,error:message});return;}
      if(message==='FORBIDDEN'||message==='BRANCH_NOT_ASSIGNED'){res.status(403).json({ok:false,error:message});return;}
      if(message==='RECORD_NOT_IN_BRANCH'||message==='RECORD_NOT_FOUND'){res.status(409).json({ok:false,error:message});return;}
      financeReadError(res,error);
    }
  }
  app.put('/api/branch-pilot/mysql-master/:store',async(req,res)=>writeMasterStore(req,res,'save'));
  app.delete('/api/branch-pilot/mysql-master/:store/:id',async(req,res)=>writeMasterStore(req,res,'archive'));


  async function assertDayNotClosed(
    db:mysql.Connection,branchId:string,day:string,
  ):Promise<void>{
    const [existing]=await db.execute<mysql.RowDataPacket[]>(
      "SELECT d.id FROM daily_closings d JOIN mysql_store_branch_access a ON a.store_name='dailyClosings' AND a.record_id=d.id AND a.branch_id=? WHERE d.date=? LIMIT 1 FOR UPDATE",
      [branchId,day]);
    if(existing.length)throw new Error('DAY_ALREADY_CLOSED');
  }

  /** Transactional manual journal creation in MySQL; no browser write or caller-provided actor. */
  app.post('/api/branch-pilot/finance/manual-journal',async(req,res)=>{
    try{
      const input=req.body?.input;
      if(!input || typeof input!=='object' || Array.isArray(input))throw new TypeError('INVALID_JOURNAL');
      const date=String(input.date||'');
      const description=String(input.descriptionAr||'').trim();
      const debitCode=String(input.debitCode||'');
      const creditCode=String(input.creditCode||'');
      const amount=Number(input.amount);
      if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) ||
        Number.isNaN(Date.parse(date+'T12:00:00Z')) ||
        new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date ||
        !description||description.length>250 ||
        !/^\d{2,12}$/.test(debitCode)||!/^\d{2,12}$/.test(creditCode)||
        debitCode===creditCode||!Number.isFinite(amount)||amount<=0||
        Math.round(amount*100)<=0||amount>9999999999)
        throw new TypeError('INVALID_JOURNAL');
      const money=Math.round(amount*100)/100;
      const session=getSession(req);
      if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
      const entry=await useDatabase(async db=>{
        const branches=await staffAssignedBranches(db,session.userId,session.role);
        if(!branches.some(x=>x.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const matrix=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId!);
        const rule=matrix.find(x=>x.resource==='journalEntries');
        if(!(session.role==='Developer'||(session.role==='Owner'
          ? (!rule||rule.actions.addJournalEntry===true)
          : rule?.actions.addJournalEntry===true)))throw new Error('FORBIDDEN');
        await db.beginTransaction();
        try{
          const [lockedPeriods]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.id FROM period_locks p JOIN mysql_store_branch_access m ON m.store_name='periodLocks' AND m.record_id=p.id AND m.branch_id=? WHERE p.period_month=? AND p.locked=1 LIMIT 1 FOR UPDATE",
            [session.branchId!,date.slice(0,7)]);
          if(lockedPeriods.length)throw new Error('ACCOUNTING_PERIOD_LOCKED');
          await assertDayNotClosed(db,session.branchId!,date);
          const [accounts]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT a.id,a.code,a.name_ar,a.name_en,a.raw_json FROM chart_of_accounts a JOIN mysql_store_branch_access m ON m.store_name='chartOfAccounts' AND m.record_id=a.id AND m.branch_id=? WHERE a.code IN (?,?) FOR UPDATE",
            [session.branchId!,debitCode,creditCode]);
          if(accounts.length!==2)throw new Error('ACCOUNT_NOT_FOUND');
          const lookup=new Map(accounts.map(a=>[String(a.code),a]));
          const debit=lookup.get(debitCode),credit=lookup.get(creditCode);
          if(!debit||!credit)throw new Error('ACCOUNT_NOT_FOUND');
          for(const a of [debit,credit]){
            let raw:{isGroup?:boolean}={};
            try{raw=JSON.parse(String(a.raw_json||'{}'));}catch{}
            if(raw.isGroup===true)throw new Error('GROUP_ACCOUNT_NOT_POSTABLE');
          }
          const id='je_man_'+randomBytes(16).toString('hex');
          const entryNumber='JE-M-'+randomBytes(10).toString('hex').toUpperCase();
          const line=(a:mysql.RowDataPacket,dr:number,cr:number)=>({
            accountCode:String(a.code),accountNameAr:String(a.name_ar||''),
            accountNameEn:String(a.name_en||''),debit:dr,credit:cr
          });
          const record={
            id,entryNumber,date,entryType:'manual',referenceType:'manual',
            referenceId:'manual',descriptionAr:description,descriptionEn:description,
            lines:[line(debit,money,0),line(credit,0,money)],totalDebit:money,
            totalCredit:money,status:'posted',createdBy:session.userId
          };
          await db.execute(
            'INSERT INTO journal_entries(id,entry_number,date,description,reference_type,reference_id,total_debit,total_credit,raw_json) VALUES(?,?,?,?,?,?,?,?,?)',
            [id,entryNumber,date,description,'manual','manual',money,money,JSON.stringify(record)]
          );
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            ['journalEntries',id,session.branchId!,session.userId]
          );
          await db.commit();
          return record;
        }catch(error){await db.rollback();throw error;}
      });
      res.status(201).json({ok:true,source:'mysql',entry});
    }catch(error){
      const msg=error instanceof Error?error.message:'JOURNAL_WRITE_FAILED';
      if(error instanceof TypeError){res.status(400).json({ok:false,error:msg});return;}
      if(msg==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:msg});return;}
      if(msg==='FORBIDDEN'||msg==='BRANCH_NOT_ASSIGNED'){res.status(403).json({ok:false,error:msg});return;}
      if(['ACCOUNTING_PERIOD_LOCKED','DAY_ALREADY_CLOSED','ACCOUNT_NOT_FOUND','GROUP_ACCOUNT_NOT_POSTABLE'].includes(msg)){
        res.status(409).json({ok:false,error:msg});return;
      }
      financeReadError(res,error);
    }
  });


  /** Post a receipt + update invoice + balanced journal in ONE MySQL transaction. */
  app.post('/api/branch-pilot/finance/receipt',async(req,res)=>{
    try{
      const body=req.body||{};
      const invoiceId=String(body.invoiceId||'');
      const payerType=String(body.payerType||'');
      const method=String(body.method||'');
      const amount=Number(body.amount);
      const notes=String(body.notes||'');
      if(!validBranchId(invoiceId)|| !['patient','contract'].includes(payerType)||
        !['cash','card','bank_transfer'].includes(method)||
        !Number.isFinite(amount)||amount<=0||amount>9999999999||
        Math.round(amount*100)<=0||notes.length>1000)
        throw new TypeError('INVALID_RECEIPT');
      const cash=Math.round(amount*100)/100;
      const session=getSession(req);
      if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
      const receipt=await useDatabase(async db=>{
        const assigned=await staffAssignedBranches(db,session.userId,session.role);
        if(!assigned.some(x=>x.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const rights=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId!);
        for(const [resource,operation] of [['payments','addPayment'],['invoices','view'],['journalEntries','addJournalEntry']] as const){
          const rule=rights.find(x=>x.resource===resource);
          if(!(session.role==='Developer' || (session.role==='Owner'
            ? (!rule||rule.actions[operation]===true) : rule?.actions[operation]===true)))
            throw new Error('FORBIDDEN');
        }
        await db.beginTransaction();
        try{
          const postingDate=new Date().toISOString().slice(0,10);
          const [locks]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT l.id FROM period_locks l JOIN mysql_store_branch_access a ON a.store_name='periodLocks' AND a.record_id=l.id AND a.branch_id=? WHERE l.period_month=? AND l.locked=1 LIMIT 1 FOR UPDATE",
            [session.branchId!,postingDate.slice(0,7)]);
          if(locks.length)throw new Error('ACCOUNTING_PERIOD_LOCKED');
          await assertDayNotClosed(db,session.branchId!,postingDate);
          const [invoices]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT i.* FROM invoices i JOIN mysql_store_branch_access a ON a.record_id=i.id AND a.store_name='invoices' AND a.branch_id=? WHERE i.id=? FOR UPDATE",
            [session.branchId!,invoiceId]);
          if(!invoices.length)throw new Error('INVOICE_NOT_IN_BRANCH');
          const invoiceRow=invoices[0];
          const invoice=JSON.parse(String(invoiceRow.raw_json||'{}')) as Record<string,unknown>;
          if(!invoice || typeof invoice!=='object' || !invoice.id)throw new Error('INVOICE_RAW_JSON_REQUIRED');
          if(invoice.status==='cancelled')throw new Error('CANCELLED_INVOICE');
          const invoiceTotal=Math.round(Number(invoiceRow.net_total)*100)/100;
          const recordedPaid=Math.round(Number(invoiceRow.paid_amount)*100)/100;
          if(!Number.isFinite(invoiceTotal)||!Number.isFinite(recordedPaid)||invoiceTotal<0||
            recordedPaid<0)throw new Error('INVALID_LEGACY_INVOICE_TOTAL');
          const [oldPayments]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.* FROM payments p JOIN mysql_store_branch_access a ON a.record_id=p.id AND a.store_name='payments' AND a.branch_id=? WHERE p.invoice_id=? FOR UPDATE",
            [session.branchId!,invoiceId]);
          let patientPaid=0,contractPaid=0;
          for(const row of oldPayments){
            let record:Record<string,unknown>={};
            try{record=JSON.parse(String(row.raw_json||'{}')) as Record<string,unknown>;}catch{}
            if(record.status==='cancelled')continue;
            const oldAmount=Number(row.amount);
            if(!Number.isFinite(oldAmount)||oldAmount<0)throw new Error('INVALID_EXISTING_PAYMENT');
            if(record.payerType==='contract')contractPaid+=oldAmount;
            else patientPaid+=oldAmount;
          }
          patientPaid=Math.round(patientPaid*100)/100;
          contractPaid=Math.round(contractPaid*100)/100;
          const collected=Math.round((patientPaid+contractPaid)*100)/100;
          // The imported invoice and receipt ledger MUST reconcile before posting more.
          if(Math.abs(collected-recordedPaid)>0.009)throw new Error('LEGACY_PAYMENT_RECONCILIATION_REQUIRED');
          const company=invoice.contractId
            ?Math.max(0,Math.min(invoiceTotal,Math.round(Number(invoice.companyShareAmount||0)*100)/100))
            :0;
          if(payerType==='contract' && !invoice.contractId)throw new Error('NO_CONTRACT_ON_INVOICE');
          const available=Math.round(((payerType==='contract' ? company-contractPaid :
            invoiceTotal-company-patientPaid))*100)/100;
          if(cash>available+0.009)throw new Error('PAYMENT_EXCEEDS_PAYER_SHARE');
          const nextPaid=Math.round((recordedPaid+cash)*100)/100;
          const remaining=Math.round((invoiceTotal-nextPaid)*100)/100;
          if(remaining<-0.009)throw new Error('PAYMENT_EXCEEDS_INVOICE');
          const now=postingDate;
          const paymentId='pay_'+randomBytes(16).toString('hex');
          const paymentNumber='PAY-'+randomBytes(10).toString('hex').toUpperCase();
          const payment={
            id:paymentId,paymentNumber,invoiceId,invoiceNumber:String(invoiceRow.invoice_number),
            patientId:String(invoiceRow.patient_id),date:now,amount:cash,method,payerType,
            createdBy:session.userId,status:'active',notes
          };
          const updated={
            ...invoice,paidAmount:nextPaid,remainingAmount:Math.max(0,remaining),
            paymentMethod:method,status:remaining<=0.009?'paid':'partial'
          };
          await db.execute(
            'INSERT INTO payments(id,payment_number,invoice_id,patient_id,amount,method,date,raw_json) VALUES(?,?,?,?,?,?,?,?)',
            [paymentId,paymentNumber,invoiceId,payment.patientId,cash,method,now,JSON.stringify(payment)]
          );
          await db.execute('UPDATE invoices SET paid_amount=?,remaining_amount=?,status=?,raw_json=? WHERE id=?',
            [updated.paidAmount,updated.remainingAmount,updated.status,JSON.stringify(updated),invoiceId]);
          const journalId='je_pay_'+randomBytes(16).toString('hex');
          const journalNumber='JE-P-'+randomBytes(10).toString('hex').toUpperCase();
          const debitCode=method==='cash'?'1201':'1202';
          const creditCode=payerType==='contract'?'1205':'1204';
          const entry={
            id:journalId,entryNumber:journalNumber,date:now,referenceType:'payment',
            referenceId:paymentId,descriptionAr:'تحصيل دفعة عن فاتورة '+payment.invoiceNumber,
            descriptionEn:'Invoice payment '+payment.invoiceNumber,
            lines:[
              {accountCode:debitCode,accountNameAr:debitCode==='1201'?'الصندوق':'البنك',
                accountNameEn:'Cash / Bank',debit:cash,credit:0},
              {accountCode:creditCode,accountNameAr:'ذمم العملاء',
                accountNameEn:'Receivables',debit:0,credit:cash}
            ],totalDebit:cash,totalCredit:cash,status:'posted',createdBy:session.userId
          };
          await db.execute(
            'INSERT INTO journal_entries(id,entry_number,date,description,reference_type,reference_id,total_debit,total_credit,raw_json) VALUES(?,?,?,?,?,?,?,?,?)',
            [journalId,journalNumber,now,entry.descriptionAr,'payment',paymentId,cash,cash,JSON.stringify(entry)]
          );
          for(const [store,id] of [['payments',paymentId],['journalEntries',journalId]]){
            await db.execute(
              'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
              [store,id,session.branchId!,session.userId]);
          }
          await db.commit();
          return {invoice:updated,payment,journal:entry};
        }catch(error){await db.rollback();throw error;}
      });
      res.status(201).json({ok:true,source:'mysql',...receipt});
    }catch(error){
      const message=error instanceof Error?error.message:'MYSQL_RECEIPT_FAILED';
      if(error instanceof TypeError){res.status(400).json({ok:false,error:message});return;}
      if(message==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:message});return;}
      if(message==='FORBIDDEN'||message==='BRANCH_NOT_ASSIGNED'){res.status(403).json({ok:false,error:message});return;}
      if(['INVOICE_NOT_IN_BRANCH','INVOICE_RAW_JSON_REQUIRED','CANCELLED_INVOICE',
          'INVALID_LEGACY_INVOICE_TOTAL','INVALID_EXISTING_PAYMENT',
          'LEGACY_PAYMENT_RECONCILIATION_REQUIRED','NO_CONTRACT_ON_INVOICE',
          'ACCOUNTING_PERIOD_LOCKED','DAY_ALREADY_CLOSED','PAYMENT_EXCEEDS_PAYER_SHARE','PAYMENT_EXCEEDS_INVOICE'].includes(message)){
        res.status(409).json({ok:false,error:message});return;
      }
      financeReadError(res,error);
    }
  });


  /** Atomic manual service invoice: invoice + item + balanced revenue journal. */
  app.post('/api/branch-pilot/finance/manual-invoice',async(req,res)=>{
    try{
      const input=req.body?.input;
      if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('INVALID_MANUAL_INVOICE');
      const patientId=String(input.patientId||'');
      const contractId=input.contractId?String(input.contractId):'';
      const date=String(input.date||'');
      const serviceName=String(input.serviceName||'').trim();
      const price=Number(input.price),discount=Number(input.discountAmount),taxRate=Number(input.taxRate);
      if(!validBranchId(patientId)||(contractId&&!validBranchId(contractId))||
        !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||
        Number.isNaN(Date.parse(date+'T12:00:00Z'))||
        new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||
        !serviceName||serviceName.length>191||
        ![price,discount,taxRate].every(Number.isFinite)||
        price<=0||price>9999999999||discount<0||discount>price||
        taxRate<0||taxRate>100)
        throw new TypeError('INVALID_MANUAL_INVOICE');
      const cents=(x:number)=>Math.round(x*100);
      const gross=cents(price),discountCents=cents(discount);
      const taxable=gross-discountCents,vat=Math.round(taxable*taxRate/100);
      const total=taxable+vat;
      if(total<=0)throw new TypeError('INVALID_MANUAL_INVOICE_TOTAL');
      const asMoney=(n:number)=>n/100;
      const session=getSession(req);
      if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
      const created=await useDatabase(async db=>{
        const assigned=await staffAssignedBranches(db,session.userId,session.role);
        if(!assigned.some(b=>b.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const matrix=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId!);
        for(const [resource,action] of [['invoices','add'],['journalEntries','addJournalEntry']] as const){
          const rule=matrix.find(x=>x.resource===resource);
          if(!(session.role==='Developer'||(session.role==='Owner'
            ? (!rule||rule.actions[action]===true) : rule?.actions[action]===true)))
            throw new Error('FORBIDDEN');
        }
        await db.beginTransaction();
        try{
          const [period]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.id FROM period_locks p JOIN mysql_store_branch_access a ON a.store_name='periodLocks' AND a.record_id=p.id AND a.branch_id=? WHERE p.period_month=? AND p.locked=1 LIMIT 1 FOR UPDATE",
            [session.branchId!,date.slice(0,7)]);
          if(period.length)throw new Error('ACCOUNTING_PERIOD_LOCKED');
          await assertDayNotClosed(db,session.branchId!,date);
          const [patient]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.id FROM patients p JOIN mysql_store_branch_access a ON a.store_name='patients' AND a.record_id=p.id AND a.branch_id=? WHERE p.id=? AND p.active=1 LIMIT 1 FOR UPDATE",
            [session.branchId!,patientId]);
          if(!patient.length)throw new Error('PATIENT_NOT_IN_BRANCH');
          let companyPercent=0,contractName='';
          if(contractId){
            const [contracts]=await db.execute<mysql.RowDataPacket[]>(
              "SELECT c.* FROM corporate_contracts c JOIN mysql_store_branch_access a ON a.store_name='corporateContracts' AND a.record_id=c.id AND a.branch_id=? WHERE c.id=? AND c.active=1 LIMIT 1 FOR UPDATE",
              [session.branchId!,contractId]);
            if(!contracts.length)throw new Error('CONTRACT_NOT_IN_BRANCH');
            const contract=contracts[0];let raw:Record<string,unknown>={};
            try{raw=JSON.parse(String(contract.raw_json||'{}')) as Record<string,unknown>;}catch{}
            const copay=Number(raw.patientCoPayPercent??contract.patient_copay_percent);
            if(!Number.isFinite(copay)||copay<0||copay>100)throw new Error('INVALID_CONTRACT_COPAY');
            companyPercent=100-copay;contractName=String(raw.nameAr||contract.name_ar||'');
          }
          const companyCents=Math.round(total*companyPercent/100);
          const patientCents=total-companyCents;
          const id='inv_manual_'+randomBytes(16).toString('hex');
          const invoiceNumber='INV-M-'+randomBytes(10).toString('hex').toUpperCase();
          const invoice={
            id,invoiceNumber,requestId:'',patientId,requestType:'internal',date,
            subtotal:asMoney(gross),discountType:discountCents>0?'fixed':'none',
            discountValue:asMoney(discountCents),discountAmount:asMoney(discountCents),
            taxRate,taxAmount:asMoney(vat),netTotal:asMoney(total),paidAmount:0,
            remainingAmount:asMoney(total),status:'unpaid',paymentMethod:'cash',
            createdBy:session.userId,notes:'فاتورة خدمات مستقلة: '+serviceName,
            ...(contractId?{contractId,contractName,patientShareAmount:asMoney(patientCents),
              companyShareAmount:asMoney(companyCents)}:{patientShareAmount:asMoney(total),companyShareAmount:0})
          };
          const itemId='ii_manual_'+randomBytes(16).toString('hex');
          const item={id:itemId,invoiceId:id,testId:'manual_service',testNameAr:serviceName,
            testNameEn:serviceName,price:asMoney(gross),
            netAfterDiscountAndTax:asMoney(total),commissionEligible:false};
          const journalId='je_inv_'+randomBytes(16).toString('hex');
          const journalNumber='JE-I-'+randomBytes(10).toString('hex').toUpperCase();
          const lines=[];
          if(patientCents>0)lines.push({
            accountCode:'1204',accountNameAr:'ذمم المرضى',accountNameEn:'Patient Receivable',
            debit:asMoney(patientCents),credit:0
          });
          if(companyCents>0)lines.push({
            accountCode:'1205',accountNameAr:'ذمم التعاقدات',accountNameEn:'Corporate Receivable',
            debit:asMoney(companyCents),credit:0
          });
          if(taxable>0)lines.push({
            accountCode:contractId?'4102':'4101',accountNameAr:'إيراد تحاليل',
            accountNameEn:'Lab Revenue',debit:0,credit:asMoney(taxable)
          });
          if(vat>0)lines.push({
            accountCode:'2104',accountNameAr:'ضريبة مستحقة',
            accountNameEn:'VAT Payable',debit:0,credit:asMoney(vat)
          });
          const debitTotal=Math.round(lines.reduce((n,x)=>n+x.debit*100,0));
          const creditTotal=Math.round(lines.reduce((n,x)=>n+x.credit*100,0));
          if(debitTotal!==creditTotal || debitTotal!==total)throw new Error('UNBALANCED_INVOICE_JOURNAL');
          const journal={
            id:journalId,entryNumber:journalNumber,date,referenceType:'invoice',
            referenceId:id,descriptionAr:'إصدار فاتورة '+invoiceNumber,
            descriptionEn:'Issue invoice '+invoiceNumber,lines,
            totalDebit:asMoney(total),totalCredit:asMoney(total),status:'posted',
            createdBy:session.userId
          };
          await db.execute(
            'INSERT INTO invoices(id,invoice_number,request_id,patient_id,date,subtotal,discount_amount,tax_amount,net_total,paid_amount,remaining_amount,status,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [id,invoiceNumber,'',patientId,date,invoice.subtotal,invoice.discountAmount,invoice.taxAmount,
              invoice.netTotal,0,invoice.remainingAmount,'unpaid',JSON.stringify(invoice)]
          );
          await db.execute(
            'INSERT INTO invoice_items(id,invoice_id,test_id,test_name_ar,price,net_after_discount_tax,raw_json) VALUES(?,?,?,?,?,?,?)',
            [itemId,id,'manual_service',serviceName,item.price,item.netAfterDiscountAndTax,JSON.stringify(item)]
          );
          await db.execute(
            'INSERT INTO journal_entries(id,entry_number,date,description,reference_type,reference_id,total_debit,total_credit,raw_json) VALUES(?,?,?,?,?,?,?,?,?)',
            [journalId,journalNumber,date,journal.descriptionAr,'invoice',id,
              journal.totalDebit,journal.totalCredit,JSON.stringify(journal)]
          );
          for(const [store,rid] of [['invoices',id],['invoiceItems',itemId],['journalEntries',journalId]]){
            await db.execute('INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
              [store,rid,session.branchId!,session.userId]);
          }
          await db.commit();
          return invoice;
        }catch(e){await db.rollback();throw e;}
      });
      res.status(201).json({ok:true,source:'mysql',invoice:created});
    }catch(e){
      const msg=e instanceof Error?e.message:'MYSQL_INVOICE_FAILED';
      if(e instanceof TypeError){res.status(400).json({ok:false,error:msg});return;}
      if(msg==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:msg});return;}
      if(['FORBIDDEN','BRANCH_NOT_ASSIGNED'].includes(msg)){res.status(403).json({ok:false,error:msg});return;}
      if(['PATIENT_NOT_IN_BRANCH','CONTRACT_NOT_IN_BRANCH','INVALID_CONTRACT_COPAY',
          'ACCOUNTING_PERIOD_LOCKED','DAY_ALREADY_CLOSED','UNBALANCED_INVOICE_JOURNAL'].includes(msg)){
        res.status(409).json({ok:false,error:msg});return;
      }
      financeReadError(res,e);
    }
  });


  /** Server-calculated MySQL daily closing: never trust totals posted by a browser. */
  app.post('/api/branch-pilot/finance/daily-close',async(req,res)=>{
    try{
      const session=getSession(req);
      if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
      const tz=String(process.env.CENTER_TIMEZONE||'Africa/Cairo');
      let businessDate:string;
      try{businessDate=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',
        month:'2-digit',day:'2-digit'}).format(new Date());}
      catch{throw new Error('INVALID_CENTER_TIMEZONE');}
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(businessDate))
        throw new Error('INVALID_BUSINESS_DATE');
      const record=await useDatabase(async db=>{
        const assigned=await staffAssignedBranches(db,session.userId,session.role);
        if(!assigned.some(b=>b.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const rights=await ownBranchPermissions({
          execute:(sql,params)=>db.execute(sql,params as string[])
        },session.userId,session.branchId!);
        const permission=rights.find(row=>row.resource==='cashbox');
        if(!(session.role==='Developer'||(session.role==='Owner'
          ? (!permission||permission.actions.closeDay===true)
          : permission?.actions.closeDay===true)))throw new Error('FORBIDDEN');
        await db.beginTransaction();
        try{
          const [period]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.id FROM period_locks p JOIN mysql_store_branch_access a ON a.store_name='periodLocks' AND a.record_id=p.id AND a.branch_id=? WHERE p.period_month=? AND p.locked=1 LIMIT 1 FOR UPDATE",
            [session.branchId!,businessDate.slice(0,7)]);
          if(period.length)throw new Error('ACCOUNTING_PERIOD_LOCKED');
          const [prior]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT d.id FROM daily_closings d JOIN mysql_store_branch_access a ON a.store_name='dailyClosings' AND a.record_id=d.id AND a.branch_id=? WHERE d.date=? LIMIT 1 FOR UPDATE",
            [session.branchId!,businessDate]);
          if(prior.length)throw new Error('DAY_ALREADY_CLOSED');
          const [invoiceRows]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT i.net_total FROM invoices i JOIN mysql_store_branch_access a ON a.store_name='invoices' AND a.record_id=i.id AND a.branch_id=? WHERE i.date=? AND i.status<>'cancelled' FOR UPDATE",
            [session.branchId!,businessDate]);
          const [receiptRows]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.amount,p.method,p.raw_json FROM payments p JOIN mysql_store_branch_access a ON a.store_name='payments' AND a.record_id=p.id AND a.branch_id=? WHERE p.date=? FOR UPDATE",
            [session.branchId!,businessDate]);
          const [expenseRows]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT e.amount,e.raw_json FROM expenses e JOIN mysql_store_branch_access a ON a.store_name='expenses' AND a.record_id=e.id AND a.branch_id=? WHERE e.date=? FOR UPDATE",
            [session.branchId!,businessDate]);
          const round=(n:number)=>Math.round(n*100)/100;
          const totalInvoices=round(invoiceRows.reduce((sum,r)=>sum+Number(r.net_total||0),0));
          let cash=0,card=0,bank=0;
          for(const row of receiptRows){
            let raw:Record<string,unknown>={};
            try{raw=JSON.parse(String(row.raw_json||'{}'));}catch{}
            if(raw.status==='cancelled')continue;
            const v=Number(row.amount);
            if(!Number.isFinite(v)||v<0)throw new Error('INVALID_EXISTING_RECEIPT');
            if(row.method==='cash')cash+=v;
            else if(row.method==='card')card+=v;
            else if(row.method==='bank_transfer')bank+=v;
            else throw new Error('INVALID_EXISTING_PAYMENT_METHOD');
          }
          let allExpenses=0,cashExpenses=0;
          for(const row of expenseRows){
            let raw:Record<string,unknown>={};
            try{raw=JSON.parse(String(row.raw_json||'{}'));}catch{}
            const amount=Number(row.amount);
            if(!Number.isFinite(amount)||amount<0)throw new Error('INVALID_EXISTING_EXPENSE');
            allExpenses+=amount;
            if(raw.paymentMethod==='cash')cashExpenses+=amount;
          }
          const id='dc_'+session.branchId+'_'+businessDate.replace(/-/g,'');
          const now=new Date().toISOString();
          const closing={
            id,date:businessDate,totalInvoices,totalCollectedCash:round(cash),
            totalCollectedCard:round(card),totalCollectedBank:round(bank),
            totalExpenses:round(allExpenses),netCashInBox:round(cash-cashExpenses),
            closedBy:session.userId,closedAt:now,notes:'Server calculated: net cash = cash receipts - cash expenses'
          };
          await db.execute(
            'INSERT INTO daily_closings(id,date,total_collected,total_expenses,net_cash,raw_json) VALUES(?,?,?,?,?,?)',
            [id,businessDate,round(cash+card+bank),round(allExpenses),
              closing.netCashInBox,JSON.stringify(closing)]);
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            ['dailyClosings',id,session.branchId!,session.userId]);
          await db.commit();
          return closing;
        }catch(e){await db.rollback();throw e;}
      });
      res.status(201).json({ok:true,source:'mysql',closing:record});
    }catch(e){
      const msg=e instanceof Error?e.message:'DAILY_CLOSE_FAILED';
      if(msg==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:msg});return;}
      if(['FORBIDDEN','BRANCH_NOT_ASSIGNED'].includes(msg)){res.status(403).json({ok:false,error:msg});return;}
      if(['ACCOUNTING_PERIOD_LOCKED','DAY_ALREADY_CLOSED','INVALID_EXISTING_RECEIPT',
          'INVALID_EXISTING_PAYMENT_METHOD','INVALID_EXISTING_EXPENSE'].includes(msg)){
        res.status(409).json({ok:false,error:msg});return;
      }
      financeReadError(res,e);
    }
  });


  /** Doctor commission payout and journal are always posted atomically. */
  app.post('/api/branch-pilot/finance/doctor-payout',async(req,res)=>{
    try{
      const commissionId=String(req.body?.commissionId||'');
      const date=String(req.body?.date||'');
      const notes=String(req.body?.notes||'');
      const doctorNameAr=String(req.body?.doctorNameAr||'').slice(0,191);
      const doctorNameEn=String(req.body?.doctorNameEn||'').slice(0,191);
      if(!validBranchId(commissionId)||notes.length>1000||
        !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||
        Number.isNaN(Date.parse(date+'T12:00:00Z'))||
        new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)
        throw new TypeError('INVALID_PAYOUT');
      const session=getSession(req);
      if(!session?.branchId)throw new Error('BRANCH_SELECTION_REQUIRED');
      const commission=await useDatabase(async db=>{
        const branches=await staffAssignedBranches(db,session.userId,session.role);
        if(!branches.some(x=>x.branchId===session.branchId))throw new Error('BRANCH_NOT_ASSIGNED');
        const rights=await ownBranchPermissions({execute:(sql,params)=>db.execute(sql,params as string[])},
          session.userId,session.branchId!);
        for(const [resource,action] of [['commissions','payCommission'],['journalEntries','addJournalEntry']] as const){
          const rule=rights.find(x=>x.resource===resource);
          if(!(session.role==='Developer'||(session.role==='Owner'
            ? (!rule||rule.actions[action]===true):rule?.actions[action]===true)))throw new Error('FORBIDDEN');
        }
        await db.beginTransaction();
        try{
          const [period]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT p.id FROM period_locks p JOIN mysql_store_branch_access a ON a.store_name='periodLocks' AND a.record_id=p.id AND a.branch_id=? WHERE p.period_month=? AND p.locked=1 LIMIT 1 FOR UPDATE",
            [session.branchId!,date.slice(0,7)]);
          if(period.length)throw new Error('ACCOUNTING_PERIOD_LOCKED');
          await assertDayNotClosed(db,session.branchId!,date);
          const [records]=await db.execute<mysql.RowDataPacket[]>(
            "SELECT c.* FROM doctor_commissions c JOIN mysql_store_branch_access a ON a.store_name='commissions' AND a.record_id=c.id AND a.branch_id=? WHERE c.id=? FOR UPDATE",
            [session.branchId!,commissionId]);
          if(!records.length)throw new Error('COMMISSION_NOT_IN_BRANCH');
          const row=records[0];
          let original:Record<string,unknown>;
          try{original=JSON.parse(String(row.raw_json||'')) as Record<string,unknown>;}catch{
            throw new Error('COMMISSION_RAW_JSON_REQUIRED');
          }
          const remaining=Math.round(Number(original.remainingAmount)*100)/100;
          const paid=Math.round(Number(original.paidAmount||0)*100)/100;
          if(!Number.isFinite(remaining)||remaining<=0||!Number.isFinite(paid)||paid<0||
            original.payoutJournalId||original.status==='paid')
            throw new Error('COMMISSION_ALREADY_PAID_OR_INVALID');
          const journalId='je_cp_'+randomBytes(16).toString('hex');
          const journalNumber='JE-CP-'+randomBytes(10).toString('hex').toUpperCase();
          const updated={
            ...original,id:commissionId,paidAmount:Math.round((paid+remaining)*100)/100,
            remainingAmount:0,status:'paid',payoutAmount:remaining,payoutDate:date,
            payoutNotes:notes.trim(),payoutJournalId:journalId
          };
          const journal={
            id:journalId,entryNumber:journalNumber,date,referenceType:'commission_payout',
            referenceId:commissionId,
            descriptionAr:'صرف عمولة الطبيب '+doctorNameAr,
            descriptionEn:'Doctor commission payout '+doctorNameEn,
            lines:[
              {accountCode:'2102',accountNameAr:'ذمم الأطباء',accountNameEn:'Doctors Payable',
                debit:remaining,credit:0},
              {accountCode:'1201',accountNameAr:'الصندوق',accountNameEn:'Cashbox',
                debit:0,credit:remaining}
            ],totalDebit:remaining,totalCredit:remaining,status:'posted',
            createdBy:session.userId
          };
          await db.execute(
            'UPDATE doctor_commissions SET status=?,raw_json=? WHERE id=?',
            ['paid',JSON.stringify(updated),commissionId]
          );
          await db.execute(
            'INSERT INTO journal_entries(id,entry_number,date,description,reference_type,reference_id,total_debit,total_credit,raw_json) VALUES(?,?,?,?,?,?,?,?,?)',
            [journalId,journalNumber,date,journal.descriptionAr,'commission_payout',
              commissionId,remaining,remaining,JSON.stringify(journal)]
          );
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            ['journalEntries',journalId,session.branchId!,session.userId]
          );
          await db.commit();
          return updated;
        }catch(e){await db.rollback();throw e;}
      });
      res.status(201).json({ok:true,source:'mysql',commission});
    }catch(e){
      const msg=e instanceof Error?e.message:'PAYOUT_FAILED';
      if(e instanceof TypeError){res.status(400).json({ok:false,error:msg});return;}
      if(msg==='BRANCH_SELECTION_REQUIRED'){res.status(401).json({ok:false,error:msg});return;}
      if(['FORBIDDEN','BRANCH_NOT_ASSIGNED'].includes(msg)){res.status(403).json({ok:false,error:msg});return;}
      if(['ACCOUNTING_PERIOD_LOCKED','DAY_ALREADY_CLOSED','COMMISSION_NOT_IN_BRANCH','COMMISSION_RAW_JSON_REQUIRED',
          'COMMISSION_ALREADY_PAID_OR_INVALID'].includes(msg)){
        res.status(409).json({ok:false,error:msg});return;
      }
      financeReadError(res,e);
    }
  });

  app.post('/api/branch-pilot/logout', (req, res) => {
    const token = cookieValue(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', secureCookie('', 0));
    res.json({ ok: true });
  });
}
