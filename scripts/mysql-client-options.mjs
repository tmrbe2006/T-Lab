import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function temporaryMysqlOptions({ host, port, user, password }) {
  const items = [host, String(port), user, password];
  if (items.some(item => typeof item !== 'string' || /[\r\n\0]/.test(item))) {
    throw new Error('Invalid MySQL connection configuration');
  }
  const directory = await mkdtemp(join(tmpdir(), 'tlab-mysql-client-'));
  const filename = join(directory, 'client.cnf');
  const quoted = value => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  try {
    await writeFile(filename,
      '[client]\n' +
      'user=' + quoted(user) + '\n' +
      'password=' + quoted(password) + '\n' +
      'host=' + quoted(host) + '\n' +
      'port=' + String(port) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    filename,
    cleanup: async () => rm(directory, { recursive: true, force: true }),
  };
}

export function allowPlaintextMysqlConnection(host) {
  // MySQL 5.5 has limited/obsolete TLS; allow loopback traffic only by default.
  if (['127.0.0.1', 'localhost', '::1'].includes(host)) return true;
  const privateIPv4 =
    /^10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/.test(host) ||
    /^192\\.168\\.\\d{1,3}\\.\\d{1,3}$/.test(host) ||
    /^172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}$/.test(host);
  return privateIPv4 && process.env.TLAB_BACKUP_ALLOW_PLAINTEXT_LAN === 'true';
}
