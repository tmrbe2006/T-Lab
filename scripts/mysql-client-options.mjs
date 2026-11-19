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
  // MySQL 5.5 has obsolete TLS; permit unencrypted loopback only by default.
  if (['127.0.0.1', 'localhost', '::1'].includes(host)) return true;
  const octets = host.split('.').map(Number);
  const validIp = octets.length === 4 &&
    host.split('.').every(part => part.length > 0 && part.length <= 3 &&
      part.split('').every(ch => ch >= '0' && ch <= '9')) &&
    octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
  const privateIp = validIp && (
    octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
  );
  return privateIp && process.env.TLAB_BACKUP_ALLOW_PLAINTEXT_LAN === 'true';
}
