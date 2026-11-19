import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Connection, RowDataPacket } from 'mysql2/promise';

const scrypt = promisify(scryptCallback);
export const STAFF_ROLES = ['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export interface StaffAccount {
  id: string;
  username: string;
  role: StaffRole;
  active: boolean;
  authVersion: number;
}

interface StaffRow extends RowDataPacket {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  active: number;
  auth_version: number;
}

export type ConnectionFactory = () => Promise<Connection>;

const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{2,63}$/;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new Error('Password must contain at least 12 characters and must not exceed 1024 bytes');
  }
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT_PARAMS) as Buffer;
  return `scrypt-v1:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) return false;
  const parts = String(encoded).split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1' || !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const actual = await scrypt(password, Buffer.from(parts[1], 'hex'), 64, SCRYPT_PARAMS) as Buffer;
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}

export class StaffAccountStore {
  constructor(private readonly connect: ConnectionFactory) {}

  async ensureTable(): Promise<void> {
    const conn = await this.connect();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS \`secure_auth_users\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`username\` VARCHAR(64) NOT NULL,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`role\` VARCHAR(32) NOT NULL,
        \`active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`auth_version\` INT NOT NULL DEFAULT 1,
        UNIQUE KEY \`uq_secure_auth_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
    } finally {
      await conn.end();
    }
  }

  async create(username: string, password: string, role: string): Promise<StaffAccount> {
    if (!USERNAME_PATTERN.test(username) || username.toLowerCase() === 'developer') throw new Error('Invalid or reserved username');
    if (!STAFF_ROLES.includes(role as StaffRole)) throw new Error('Invalid role');
    const hash = await hashPassword(password);
    const id = randomBytes(16).toString('hex');
    const conn = await this.connect();
    try {
      await conn.execute(
        'INSERT INTO `secure_auth_users` (`id`, `username`, `password_hash`, `role`, `active`, `auth_version`) VALUES (?, ?, ?, ?, 1, 1)',
        [id, username, hash, role],
      );
      return { id, username, role: role as StaffRole, active: true, authVersion: 1 };
    } finally {
      await conn.end();
    }
  }

  async find(username: string): Promise<{ account: StaffAccount; hash: string } | null> {
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<StaffRow[]>(
        'SELECT `id`, `username`, `password_hash`, `role`, `active`, `auth_version` FROM `secure_auth_users` WHERE `username` = ? LIMIT 1',
        [username],
      );
      const row = rows[0];
      if (!row || !STAFF_ROLES.includes(row.role as StaffRole)) return null;
      return { account: { id: row.id, username: row.username, role: row.role as StaffRole, active: Boolean(row.active), authVersion: row.auth_version }, hash: row.password_hash };
    } finally {
      await conn.end();
    }
  }

  async list(): Promise<StaffAccount[]> {
    const conn = await this.connect();
    try {
      const [rows] = await conn.query<StaffRow[]>(
        'SELECT `id`, `username`, `role`, `active`, `auth_version` FROM `secure_auth_users` ORDER BY `username`',
      );
      return rows.filter(row => STAFF_ROLES.includes(row.role as StaffRole)).map(row => ({
        id: row.id, username: row.username, role: row.role as StaffRole, active: Boolean(row.active), authVersion: row.auth_version,
      }));
    } finally {
      await conn.end();
    }
  }

  async update(id: string, changes: { active?: boolean; role?: StaffRole; password?: string }): Promise<boolean> {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid account identifier');
    const entries: string[] = [];
    const params: unknown[] = [];
    if (changes.active !== undefined) {
      if (typeof changes.active !== 'boolean') throw new Error('Invalid active value');
      entries.push('`active` = ?'); params.push(changes.active ? 1 : 0);
    }
    if (changes.role !== undefined) {
      if (!STAFF_ROLES.includes(changes.role)) throw new Error('Invalid role');
      entries.push('`role` = ?'); params.push(changes.role);
    }
    if (changes.password !== undefined) {
      entries.push('`password_hash` = ?'); params.push(await hashPassword(changes.password));
    }
    if (!entries.length) throw new Error('No modifications');
    entries.push('`auth_version` = `auth_version` + 1');
    params.push(id);
    const conn = await this.connect();
    try {
      const [result] = await conn.execute(
        `UPDATE \`secure_auth_users\` SET ${entries.join(', ')} WHERE \`id\` = ?`,
        params,
      );
      return (result as { affectedRows: number }).affectedRows === 1;
    } finally {
      await conn.end();
    }
  }
}
