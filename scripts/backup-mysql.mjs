import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { decodeBackupKey, encryptGzipStream, verifyEncryptedBackup } from './backup-crypto.mjs';
import { temporaryMysqlOptions, allowPlaintextMysqlConnection } from './mysql-client-options.mjs';

dotenv.config();

async function main() {
  const db = process.env.MYSQL_DATABASE || '';
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || '';
  const password = process.env.MYSQL_PASSWORD || '';
  const key = decodeBackupKey(process.env.TLAB_BACKUP_KEY);
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(db) ||
      !/^[a-zA-Z0-9_.:-]{1,255}$/.test(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(user)) {
    throw new Error('Invalid MySQL backup configuration');
  }

  const destination = resolve(process.env.TLAB_BACKUP_DIR || './backups');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = 'T-Lab-' + stamp + '-' + randomBytes(4).toString('hex') + '.sql.gz.enc';
  const output = resolve(destination, filename);
  const options = await temporaryMysqlOptions({ host, port, user, password });
  // defaults-extra-file MUST be the first CLI option for MySQL 5.5 and MariaDB.
  const args = [
    '--defaults-extra-file=' + options.filename,
    '--protocol=tcp', ...(allowPlaintextMysqlConnection(host) ? ['--skip-ssl'] : []),
    '--single-transaction', '--quick', '--routines',
    '--triggers', '--events', '--hex-blob',
    '--default-character-set=utf8', db,
  ];
  const child = spawn(process.env.TLAB_MYSQLDUMP_BIN || 'mysqldump', args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MYSQL_PWD: '' },
  });
  let errorHint = '';
  child.stderr?.on('data', chunk => {
    errorHint = (errorHint + String(chunk)).slice(-3000);
  });
  const exited = new Promise((done, fail) => {
    child.once('error', () => fail(new Error('mysqldump executable not available')));
    child.once('close', code => code === 0 ? done() : fail(new Error('mysqldump failed: ' + code)));
  });

  try {
    const encrypted = encryptGzipStream(child.stdout, output, key);
    await Promise.all([encrypted, exited]);
    await verifyEncryptedBackup(output, key);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(output)) digest.update(chunk);
    const checksum = digest.digest('hex');
    const size = (await stat(output)).size;
    await writeFile(output + '.sha256', checksum + '  ' + filename + '\n',
      { mode: 0o600, flag: 'wx' });
    console.log('Encrypted MySQL backup verified.');
    console.log('Path: ' + output);
    console.log('Encrypted bytes: ' + size);
    console.log('SHA-256: ' + checksum);
    console.log('Retain TLAB_BACKUP_KEY separately; without it recovery is impossible.');
  } catch (error) {
    child.kill('SIGTERM');
    await unlink(output).catch(() => {});
    const reason = error instanceof Error ? error.message : 'Unknown backup error';
    const safeReason = reason.split(password).join('[REDACTED]').slice(0, 220);
    const stderrReason = errorHint.split(password).join('[REDACTED]').slice(0, 320);
    throw new Error('Encrypted backup failed and incomplete output was deleted. ' + safeReason + ' ' + stderrReason);
  } finally {
    await options.cleanup();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
