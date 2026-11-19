import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, stat, unlink, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { createGzip, createGunzip } from 'node:zlib';

export function decodeBackupKey(base64) {
  if (typeof base64 !== 'string' || !/^[a-zA-Z0-9+/]{43}=$/.test(base64)) {
    throw new Error('TLAB_BACKUP_KEY must be 32 random bytes encoded as base64');
  }
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== base64) {
    throw new Error('Invalid backup encryption key');
  }
  return key;
}

// File layout: 12-byte random AES-GCM IV | encrypted gzipped SQL | 16-byte GCM tag.
export async function encryptGzipStream(input, outputPath, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid encryption key');
  const nonce = randomBytes(12);
  await writeFile(outputPath, nonce, { mode: 0o600, flag: 'wx' });
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  try {
    await pipeline(input, createGzip({ level: 6 }), cipher,
      createWriteStream(outputPath, { flags: 'a', mode: 0o600 }));
    await appendFile(outputPath, cipher.getAuthTag());
  } catch (error) {
    await unlink(outputPath).catch(() => {});
    throw error;
  }
}

export async function verifyEncryptedBackup(outputPath, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid encryption key');
  const file = await stat(outputPath);
  if (file.size < 29) throw new Error('Truncated encrypted backup');
  const reader = await open(outputPath, 'r');
  const nonce = Buffer.alloc(12);
  const tag = Buffer.alloc(16);
  try {
    await reader.read(nonce, 0, 12, 0);
    await reader.read(tag, 0, 16, file.size - 16);
  } finally { await reader.close(); }

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  let plainBytes = 0;
  await pipeline(
    createReadStream(outputPath, { start: 12, end: file.size - 17 }),
    decipher, createGunzip(),
    new Writable({
      write(chunk, _encoding, callback) {
        plainBytes += chunk.length;
        callback();
      },
    }),
  );
  if (plainBytes < 80) throw new Error('Backup SQL is empty or incomplete');
  return { plainBytes, encryptedBytes: file.size };
}
