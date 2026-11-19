import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeBackupKey, encryptGzipStream, verifyEncryptedBackup } from './backup-crypto.mjs';

test('encrypted backup validates correct key and detects tampering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tlab-crypto-'));
  const data = join(dir, 'fixture.sql');
  const backup = join(dir, 'fixture.sql.gz.enc');
  const key = randomBytes(32);
  try {
    await writeFile(data, 'CREATE TABLE patient (id INT);\n'.repeat(30));
    assert.deepEqual(decodeBackupKey(key.toString('base64')), key);
    await encryptGzipStream(createReadStream(data), backup, key);
    const checked = await verifyEncryptedBackup(backup, key);
    assert.ok(checked.plainBytes > 80);
    await assert.rejects(
      verifyEncryptedBackup(backup, randomBytes(32)),
    );
    const bytes = await readFile(backup);
    bytes[20] ^= 0x40;
    await writeFile(backup, bytes);
    await assert.rejects(
      verifyEncryptedBackup(backup, key),
    );
    assert.throws(() => decodeBackupKey('not-a-secret'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
