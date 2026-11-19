import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';

type Session = { expires: number };
const sessions = new Map<string, Session>();
const failed = new Map<string, { count: number; reset: number }>();
const COOKIE = 'tlab_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

export function cookieSession(req: Request): string | undefined {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  return match?.slice(COOKIE.length + 1);
}

export function isAuthorized(req: Request): boolean {
  const token = cookieSession(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const entry = sessions.get(createHash('sha256').update(token).digest('hex'));
  return Boolean(entry && entry.expires > Date.now());
}

function sameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) return true; // Non-browser clients still need a valid session.
  try {
    const parsed = new URL(origin);
    const host = req.get('host');
    return Boolean(host && parsed.host === host && (parsed.protocol === 'http:' || parsed.protocol === 'https:'));
  } catch {
    return false;
  }
}

function setSessionCookie(res: Response, token: string, req: Request): void {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
}

export function installApiSecurity(app: Express): void {
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Reject cross-origin browser traffic before any auth or mutation.
    if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: 'Cross-origin request denied' });
    next();
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const attempt = failed.get(key);
    if (attempt && attempt.reset > now && attempt.count >= 5) {
      return res.status(429).json({ ok: false, error: 'Too many login attempts' });
    }
    const configured = process.env.TLAB_ADMIN_PASSWORD || '';
    if (configured.length < 16) {
      return res.status(503).json({ ok: false, error: 'Configure TLAB_ADMIN_PASSWORD (16+ chars) on the server first' });
    }
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const provided = createHash('sha256').update(password).digest();
    const expected = createHash('sha256').update(configured).digest();
    if (username !== 'developer' || !timingSafeEqual(provided, expected)) {
      failed.set(key, { count: (attempt?.reset && attempt.reset > now ? attempt.count : 0) + 1, reset: now + WINDOW_MS });
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    failed.delete(key);
    const token = randomBytes(32).toString('hex');
    sessions.set(createHash('sha256').update(token).digest('hex'), { expires: now + SESSION_MS });
    setSessionCookie(res, token, req);
    return res.json({ ok: true, username: 'developer', role: 'Developer' });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    if (!isAuthorized(req)) return res.status(401).json({ ok: false });
    return res.json({ ok: true, username: 'developer', role: 'Developer' });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = cookieSession(req);
    if (token) sessions.delete(createHash('sha256').update(token).digest('hex'));
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
    return res.json({ ok: true });
  });

  // Transitional safe mode: while server-backed staff accounts/RBAC are being
  // implemented, ONLY the explicitly configured Developer session may call APIs.
  // Never fall back to browser-provided roles or database connection credentials.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'Server authentication required' });
    next();
  });
}
