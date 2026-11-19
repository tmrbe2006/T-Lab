import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { type StaffAccount, StaffAccountStore, verifyPassword } from './staff-accounts';

type Session = { expires: number; username: string; role: string; userId: string; authVersion: number };
const sessions = new Map<string, Session>();
const failed = new Map<string, { count: number; reset: number }>();
const COOKIE = 'tlab_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function cookieSession(req: Request): string | undefined {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  return match?.slice(COOKIE.length + 1);
}

function readSession(req: Request): Session | undefined {
  const token = cookieSession(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const key = hashToken(token);
  const session = sessions.get(key);
  if (session && session.expires <= Date.now()) {
    sessions.delete(key);
    return undefined;
  }
  return session;
}

export function isAuthorized(req: Request): boolean {
  return Boolean(readSession(req));
}

function sameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = req.get('host');
    return Boolean(host && parsed.host === host && (parsed.protocol === 'http:' || parsed.protocol === 'https:'));
  } catch {
    return false;
  }
}

function setSessionCookie(res: Response, token: string, req: Request): void {
  const secure = req.secure;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
}

function publicIdentity(session: Session) {
  return { ok: true, username: session.username, role: session.role, userId: session.userId };
}

export type VerifiedIdentity = { username: string; role: string; userId: string };
export type ProtectedRouteInstaller = (
  app: Express, resolveIdentity: (req: Request) => Promise<VerifiedIdentity | undefined>
) => void;

export function installApiSecurity(
  app: Express, staffStore?: StaffAccountStore, registerProtectedRoutes?: ProtectedRouteInstaller
): void {
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: 'Cross-origin request denied' });
    next();
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const attempt = failed.get(key);
    if (attempt && attempt.reset > now && attempt.count >= 5) {
      return res.status(429).json({ ok: false, error: 'Too many login attempts' });
    }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || username.length > 64 || Buffer.byteLength(password) > 1024) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    }

    let identity: Session | undefined;
    if (username === 'developer') {
      const configured = process.env.TLAB_ADMIN_PASSWORD || '';
      if (configured.length < 16) {
        return res.status(503).json({ ok: false, error: 'Configure TLAB_ADMIN_PASSWORD (16+ chars) on the server first' });
      }
      const provided = createHash('sha256').update(password).digest();
      const expected = createHash('sha256').update(configured).digest();
      if (timingSafeEqual(provided, expected)) {
        identity = { username: 'developer', role: 'Developer', userId: 'server-developer', authVersion: 1, expires: now + SESSION_MS };
      }
    } else if (staffStore) {
      try {
        const found = await staffStore.find(username);
        if (found && found.account.active && await verifyPassword(password, found.hash)) {
          identity = {
            username: found.account.username, role: found.account.role,
            userId: found.account.id, authVersion: found.account.authVersion, expires: now + SESSION_MS,
          };
        }
      } catch {
        return res.status(503).json({ ok: false, error: 'Account database unavailable' });
      }
    }

    if (!identity) {
      failed.set(key, { count: (attempt?.reset && attempt.reset > now ? attempt.count : 0) + 1, reset: now + WINDOW_MS });
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    failed.delete(key);
    const token = randomBytes(32).toString('hex');
    sessions.set(hashToken(token), identity);
    setSessionCookie(res, token, req);
    return res.json(publicIdentity(identity));
  });

  const getLiveSession = async (req: Request): Promise<Session | undefined> => {
    const session = readSession(req);
    if (!session) return undefined;
    if (session.role === 'Developer') return session;
    if (!staffStore) return undefined;
    try {
      const found = await staffStore.find(session.username);
      if (found && found.account.active && found.account.id === session.userId &&
        found.account.authVersion === session.authVersion && found.account.role === session.role) return session;
    } catch {
      // Database outage must not grant access.
    }
    const token = cookieSession(req);
    if (token) sessions.delete(hashToken(token));
    return undefined;
  };

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    const session = await getLiveSession(req);
    if (!session) return res.status(401).json({ ok: false });
    return res.json(publicIdentity(session));
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = cookieSession(req);
    if (token) sessions.delete(hashToken(token));
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
    return res.json({ ok: true });
  });

  // Staff account administration is server-only; browser-provided roles are never trusted.
  if (staffStore) {
    const requireDeveloper = async (req: Request, res: Response, next: NextFunction) => {
      const session = await getLiveSession(req);
      if (!session) return res.status(401).json({ ok: false });
      if (session.role !== 'Developer') return res.status(403).json({ ok: false });
      next();
    };
    app.get('/api/auth/staff', requireDeveloper, async (_req, res) => {
      try { res.json({ ok: true, users: await staffStore.list() }); }
      catch { res.status(503).json({ ok: false, error: 'Account database unavailable' }); }
    });
    app.post('/api/auth/staff', requireDeveloper, async (req, res) => {
      const { username, password, role } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
        return res.status(400).json({ ok: false, error: 'Missing user details' });
      }
      try {
        const account = await staffStore.create(username, password, role);
        return res.status(201).json({ ok: true, user: account });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Invalid account' });
      }
    });
    app.patch('/api/auth/staff/:id', requireDeveloper, async (req, res) => {
      const body = req.body || {};
      const allowed = ['role', 'password', 'active'];
      if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) {
        return res.status(400).json({ ok: false, error: 'Unknown or empty modification' });
      }
      try {
        const updated = await staffStore.update(req.params.id, body);
        if (!updated) return res.status(404).json({ ok: false });
        return res.json({ ok: true });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Invalid update' });
      }
    });
  }

  // Install domain-specific endpoints before the developer-only legacy API gate.
  // They must each check the verified session AND server-side role permissions.
  registerProtectedRoutes?.(app, getLiveSession);

  // Existing legacy APIs still read entire MySQL tables and accept raw edits.
  // No staff role is allowed until each domain operation has server-side RBAC.
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const session = await getLiveSession(req);
    if (!session) return res.status(401).json({ ok: false, error: 'Server authentication required' });
    if (session.role !== 'Developer') return res.status(403).json({ ok: false, error: 'Legacy API unavailable to staff pending domain RBAC' });
    // A Developer session is not authorization to bulk replace patient records.
    // Explicitly opt in only during isolated development with synthetic data.
    if (process.env.TLAB_MULTIBRANCH_MODE === 'true' ||
        process.env.TLAB_ENABLE_LEGACY_API !== 'true') {
      return res.status(403).json({ ok: false, error: 'Legacy API disabled; use protected /api/v2 endpoints' });
    }
    next();
  });
}
