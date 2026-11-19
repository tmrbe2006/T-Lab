import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver } from './patient-domain';

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
      const policies: Record<string, Record<string, SecureAction[]>> = {
        patients: PERMISSIONS,
        requests: {
          Owner: ['view', 'add'], Receptionist: ['view', 'add'],
          Doctor: ['view'], Chemist: ['view'], Technician: ['view'],
        },
        samples: {
          Owner: ['view', 'add'], Chemist: ['view', 'add'],
          Technician: ['view', 'add'], Doctor: ['view'], Receptionist: ['view'],
        },
      };
      for (const [resource, policiesByRole] of Object.entries(policies)) {
        for (const role of ['Owner','Doctor','Chemist','Technician','Receptionist','Accountant']) {
          for (const action of ['view','add','edit','delete'] as SecureAction[]) {
            const allowed = policiesByRole[role]?.includes(action) ? 1 : 0;
            await conn.execute(
              'INSERT IGNORE INTO `secure_role_permissions` (`role`, `resource`, `action`, `allowed`) VALUES (?, ?, ?, ?)',
              [role, resource, action, allowed],
            );
          }
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
        !['patients', 'requests', 'samples'].includes(resource) || !['view','add','edit','delete'].includes(action) || typeof allowed !== 'boolean') {
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
  async list(resource: string): Promise<Array<{role: string; resource: string; action: string; allowed: boolean}>> {
    if (!['patients', 'requests', 'samples'].includes(resource)) throw new Error('Unsupported resource');
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<RowDataPacket[]>(
        'SELECT `role`, `resource`, `action`, `allowed` FROM `secure_role_permissions` WHERE `resource` = ? ORDER BY `role`, `action`',
        [resource],
      );
      return rows.map(row => ({
        role: String(row.role), resource: String(row.resource),
        action: String(row.action), allowed: Number(row.allowed) === 1,
      }));
    } finally { await conn.end(); }
  }

}

/** Administrative interface for server-enforced permissions (Developer only). */
export function installPermissionAdminRoutes(
  app: Express, store: ServerPermissionStore, identity: IdentityResolver
): void {
  const admin = (handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) { res.status(401).json({ ok: false }); return; }
      if (actor.role !== 'Developer') { res.status(403).json({ ok: false }); return; }
      try { await handler(req, res); }
      catch { res.status(503).json({ ok: false, error: 'Server permissions unavailable' }); }
    };
  app.get('/api/v2/permissions', admin(async (req, res) => {
    if (typeof req.query.resource !== 'string' || !['patients', 'requests', 'samples'].includes(req.query.resource)) { res.status(400).json({ ok: false }); return; }
    res.json({ ok: true, permissions: await store.list(req.query.resource as string) });
  }));
  app.put('/api/v2/permissions', admin(async (req, res) => {
    const { role, resource, action, allowed } = req.body || {};
    if (typeof role !== 'string' || typeof resource !== 'string' ||
        typeof action !== 'string' || typeof allowed !== 'boolean') {
      res.status(400).json({ ok: false, error: 'Invalid permission request' }); return;
    }
    try {
      await store.set(role, resource, action as SecureAction, allowed);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ ok: false, error: 'Unsupported permission' });
    }
  }));
}
