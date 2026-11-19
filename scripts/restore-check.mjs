import { createDecipheriv, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { decodeBackupKey, verifyEncryptedBackup } from './backup-crypto.mjs';
import { temporaryMysqlOptions, allowPlaintextMysqlConnection } from './mysql-client-options.mjs';

dotenv.config();

async function main() {
  if (process.env.TLAB_ALLOW_TEST_RESTORE !== 'true') {
    throw new Error('Set TLAB_ALLOW_TEST_RESTORE=true only for explicit isolated validation');
  }
  const source = process.env.MYSQL_DATABASE || '';
  const target = process.env.TLAB_RESTORE_TEST_DATABASE || '';
  if (!/^[A-Za-z0-9_]{1,64}$/.test(source) ||
      !/^[A-Za-z0-9_]{1,64}$/.test(target) ||
      target === source || !target.endsWith('_restore_check')) {
    throw new Error('Restore target MUST be a separate, new schema ending _restore_check');
  }
  const archive = resolve(process.argv[2] || '');
  if (!archive.endsWith('.sql.gz.enc')) throw new Error('Encrypted backup file is required');
  const key = decodeBackupKey(process.env.TLAB_BACKUP_KEY);
  await verifyEncryptedBackup(archive, key);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const expectedChecksum = hash.digest('hex') + '  ' + basename(archive);
  if ((await readFile(archive + '.sha256', 'utf8')).trim() !== expectedChecksum) {
    throw new Error('Checksum mismatch. Restore stopped before creating a database.');
  }

  const config = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    connectTimeout: 8000,
  };
  if (!config.user || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('Invalid MySQL server configuration');
  }
  const connection = await mysql.createConnection(config);
  try {
    const [schemas] = await connection.query('SHOW DATABASES');
    if (schemas.some(row => Object.values(row)[0] === target)) {
      throw new Error('Restore target ALREADY EXISTS. Refusing to overwrite existing records.');
    }
    await connection.query('CREATE DATABASE `' + target + '` CHARACTER SET utf8 COLLATE utf8_general_ci');
  } finally { await connection.end(); }

  const info = await stat(archive);
  const file = await open(archive, 'r');
  const nonce = Buffer.alloc(12), tag = Buffer.alloc(16);
  try {
    await file.read(nonce, 0, 12, 0);
    await file.read(tag, 0, 16, info.size - 16);
  } finally { await file.close(); }
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const options = await temporaryMysqlOptions(config);
  const child = spawn(process.env.TLAB_MYSQL_BIN || 'mysql', [
    '--defaults-extra-file=' + options.filename,
    '--protocol=tcp',
    ...(allowPlaintextMysqlConnection(config.host) ? ['--skip-ssl'] : []),
    '--default-character-set=utf8',
    '--database=' + target,
  ], {
    shell: false, stdio: ['pipe', 'ignore', 'pipe'],
    env: { ...process.env, MYSQL_PWD: '' },
  });
  const exit = new Promise((done, fail) => {
    child.once('error', () => fail(new Error('MySQL command-line client unavailable')));
    child.once('close', code => code === 0 ? done() : fail(new Error('Restore SQL import failed')));
  });
  try {
    await Promise.all([
      pipeline(createReadStream(archive, { start: 12, end: info.size - 17 }),
        decipher, createGunzip(), child.stdin),
      exit,
    ]);
  } catch {
    child.kill('SIGTERM');
    throw new Error('Restore failed. Isolated test schema is retained for investigation.');
  } finally {
    await options.cleanup();
  }

  const db = await mysql.createConnection(config);
  try {
    const [all] = await db.query('SHOW TABLES FROM `' + source + '`');
    const tables = all.map(row => String(Object.values(row)[0]));
    if (!tables.length) throw new Error('No source tables to verify');
    for (const table of tables) {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(table)) throw new Error('Invalid table name');
      const [srcCount] = await db.query('SELECT COUNT(*) AS qty FROM `' + source + '`.`' + table + '`');
      const [dstCount] = await db.query('SELECT COUNT(*) AS qty FROM `' + target + '`.`' + table + '`');
      if (Number(srcCount[0].qty) !== Number(dstCount[0].qty)) {
        throw new Error('Restored row count differs for table: ' + table);
      }
    }
    console.log('Test restore verified: ' + tables.length + ' tables with matching row counts.');
    console.log('Isolated schema retained for manual checksum and record validation: ' + target);
    console.log('The original schema was NOT modified.');
  } finally { await db.end(); }
}

main().catch(error => {
  console.error('Restore check failed: ' + error.message);
  process.exitCode = 1;
});
