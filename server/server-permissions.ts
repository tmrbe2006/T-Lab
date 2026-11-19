import type { Connection, RowDataPacket } from 'mysql2/promise';

export type SecureAction = 'view' | 'add' | 'edit' | 'delete';
const PERMISSIONS: Record<string, SecureAction[]> = {
  Owner: ['view', 'add', 'edit', 'delete'],
  Receptionist: ['view', 'add', 'edit'],
  Doctor: ['view'],
  Chemist: ['view'],
  Technician: ['view'],
};
export class ServerPermissionStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTable(): Promise<void> {
    const conn = await this.connect();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS \`secure_role_permissions\` (
        \`role\` VARCHAR(32) NOT NULL,
        \`resource\` VARCHAR(64) NOT NULL,
        \`action\` VARCHAR(32) NOT NULL,
        \`allowed\` TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (\`role\`, \`resource\`, \`action\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
      for (const role of ['Owner','Doctor','Chemist','Technician','Receptionist','Accountant']) {
        for (const action of ['view','add','edit','delete'] as SecureAction[]) {
          const allowed = PERMISSIONS[role]?.includes(action) ? 1 : 0;
          await conn.execute(
            'INSERT IGNORE INTO `secure_role_permissions` (`role`, `resource`, `action`, `allowed`) VALUES (?, ?, ?, ?)',
            [role, 'patients', action, allowed],
          );
        }
      }
    } finally {
      await conn.end();
    }
  }
  async can(role: string, resource: string, action: SecureAction): Promise<boolean> {
    if (role === 'Developer') return true;
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<RowDataPacket[]>(
        'SELECT `allowed` FROM `secure_role_permissions` WHERE `role` = ? AND `resource` = ? AND `action` = ?',
        [role, resource, action],
      );
      return rows.length === 1 && Number(rows[0].allowed) === 1;
    } finally {
      await conn.end();
    }
  }
  async set(role: string, resource: string, action: SecureAction, allowed: boolean): Promise<void> {
    if (!['Owner','Doctor','Chemist','Technician','Receptionist','Accountant'].includes(role) ||
        resource !== 'patients' || !['view','add','edit','delete'].includes(action) || typeof allowed !== 'boolean') {
      throw new Error('Invalid role, resource or action');
    }
    const conn = await this.connect();
    try {
      await conn.execute(
        'INSERT INTO `secure_role_permissions` (`role`, `resource`, `action`, `allowed`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `allowed` = VALUES(`allowed`)',
        [role, resource, action, allowed ? 1 : 0],
      );
    } finally {
      await conn.end();
    }
  }
}
