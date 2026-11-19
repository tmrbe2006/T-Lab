// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { installApiSecurity } from './api-security';

let server: Server;
let base = '';
const previous = process.env.TLAB_ADMIN_PASSWORD;

beforeAll(async () => {
  process.env.TLAB_ADMIN_PASSWORD = 'local-test-only-security-password-123456';
  const app = express();
  app.use(express.json());
  installApiSecurity(app);
  app.get('/api/mysql/env-config', (_req, res) => res.json({ ok: true }));
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('test server could not bind');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (previous === undefined) delete process.env.TLAB_ADMIN_PASSWORD;
  else process.env.TLAB_ADMIN_PASSWORD = previous;
});

describe('Protected API', () => {
  it('blocks unauthenticated database operations', async () => {
    const result = await fetch(base + '/api/mysql/env-config');
    expect(result.status).toBe(401);
  });

  it('blocks cross-origin requests including login', async () => {
    const result = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'developer', password: process.env.TLAB_ADMIN_PASSWORD }),
    });
    expect(result.status).toBe(403);
  });

  it('rejects invalid login credentials', async () => {
    const result = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'developer', password: 'wrong' }),
    });
    expect(result.status).toBe(401);
  });

  it('admits only authenticated server Developer sessions', async () => {
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'developer', password: process.env.TLAB_ADMIN_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    expect(cookie).toMatch(/^tlab_session=/);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    const access = await fetch(base + '/api/mysql/env-config', { headers: { cookie } });
    expect(access.status).toBe(200);
    const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie } });
    expect(logout.status).toBe(200);
    const blocked = await fetch(base + '/api/mysql/env-config', { headers: { cookie } });
    expect(blocked.status).toBe(401);
  });
});
