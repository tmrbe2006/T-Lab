import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import dotenv from 'dotenv';
import { decodeBackupKey, verifyEncryptedBackup } from './backup-crypto.mjs';

dotenv.config();

const file = process.argv[2];
if (!file || !file.endsWith('.sql.gz.enc')) {
  console.error('Usage: node scripts/verify-backup.mjs <backup.sql.gz.enc>');
  process.exit(2);
}
try {
  const target = resolve(file);
  const key = decodeBackupKey(process.env.TLAB_BACKUP_KEY);
  const checked = await verifyEncryptedBackup(target, key);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(target)) digest.update(chunk);
  const actual = digest.digest('hex');
  const manifest = (await readFile(target + '.sha256', 'utf8')).trim();
  if (manifest !== actual + '  ' + basename(target)) throw new Error('Backup checksum mismatch');
  console.log('Backup encryption, gzip contents and SHA-256 verified.');
  console.log('Encrypted bytes: ' + checked.encryptedBytes);
  console.log('Decompressed SQL bytes checked: ' + checked.plainBytes);
  console.log('Note: only a restore into a separate test schema verifies recoverability.');
} catch {
  console.error('Backup verification FAILED. File, checksum or encryption key invalid.');
  process.exitCode = 1;
}
