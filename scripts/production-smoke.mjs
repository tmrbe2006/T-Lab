import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 31000 + randomInt(1000);
const base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts',
  '--static-dist', '--port', String(port)], {
  shell: false, stdio: ['ignore','pipe','pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    MYSQL_HOST: '127.0.0.1',
    MYSQL_PORT: '3306',
    MYSQL_USER: 'ci-nonexistent',
    MYSQL_PASSWORD: 'test-only',
    MYSQL_DATABASE: 'ci_no_database',
    MYSQL_CONNECTION_TIMEOUT: '1000',
    TLAB_ADMIN_PASSWORD: 'ci-not-production-password-78048',
    TLAB_ALLOW_SCHEMA_BOOTSTRAP: 'false',
  },
});
let errorOutput = '';
child.stderr?.on('data', data => { errorOutput += String(data).slice(0, 1000); });

async function ready() {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Static production server exited early');
    try {
      const response = await fetch(base + '/');
      if (response.ok) return response;
    } catch { /* poll */ }
    await sleep(200);
  }
  throw new Error('Production server did not become available');
}

try {
  const response = await ready();
  const html = await response.text();
  if (!html.includes('<html') || !html.includes('/assets/')) {
    throw new Error('Production bundle HTML is absent');
  }
  const auth = await fetch(base + '/api/auth/session');
  if (auth.status !== 401) throw new Error('Missing authorization check in production API');
  const source = await fetch(base + '/@vite/client');
  if (source.headers.get('content-type')?.includes('javascript')) {
    throw new Error('Vite developer middleware was exposed during production');
  }
  console.log('Production static-dist smoke passed: built UI, protected API, no Vite dev client.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (process.env.CI === 'true') console.error(errorOutput.slice(-400));
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}
