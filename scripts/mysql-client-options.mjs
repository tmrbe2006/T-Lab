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
