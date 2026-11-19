import { db } from '../db/database';
import { buildRolePermissions } from '../db/seed';
import { permissionsRepository, usersRepository } from '../repositories';
import { mysqlSyncService } from '../services/mysql-sync.service';
import type { PermissionAction, ResourceScreen, RolePermission, User } from '../types';

const SESSION_KEY = 'medlab_current_user';
type ServerIdentity = { ok?: boolean; username?: string; role?: string; userId?: string };
const STAFF_ROLES = new Set(['Owner','Doctor','Chemist','Technician','Receptionist','Accountant']);
const serverStaffUser = (value: ServerIdentity): User | null => {
  if (!value.ok || !value.userId || typeof value.username !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_.-]{2,63}$/.test(value.username) ||
      typeof value.role !== 'string' || !STAFF_ROLES.has(value.role)) return null;
  return {
    id: value.userId, username: value.username, role: value.role as User['role'],
    passwordHash: '', fullNameAr: value.username, fullNameEn: value.username,
    active: true, createdAt: '2026-01-01',
  };
};

const serverDeveloperUser = (): User => ({
  id: 'server-developer',
  username: 'developer',
  passwordHash: '', // No browser-stored credential.
  fullNameAr: 'مبرمج النظام',
  fullNameEn: 'System Developer',
  role: 'Developer',
  active: true,
  createdAt: '2026-01-01',
});


class AuthService {
  private currentUser: User | null = null;
  private permissionsCache: Map<string, Record<PermissionAction, boolean>> = new Map();

  async init(): Promise<void> {
    this.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    try {
      const session = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (!session.ok) return;
      const data = await session.json() as ServerIdentity;
      if (!data.ok) return;
      if (data.username === 'developer' && data.role === 'Developer') {
        await mysqlSyncService.autoSyncOnStartup();
        await this.reloadPermissionsCache();
        this.currentUser = serverDeveloperUser();
      } else {
        // Limited staff pilot: secure patient domain only, no IndexedDB hydration.
        this.currentUser = serverStaffUser(data);
      }
    } catch {
      // Fail closed if server-side session cannot be established.
    }
  }

  async reloadPermissionsCache(): Promise<void> {
    // Ensure the Developer role and default 'developer' user exist in previously seeded databases
    try {
      const devUser = await usersRepository.getByUsername('developer');
      if (!devUser) {
        await usersRepository.saveUser({
          id: 'usr_dev',
          username: 'developer',
          passwordHash: '',
          fullNameAr: 'م. مبرمج النظام (المبرمج)',
          fullNameEn: 'System Developer',
          role: 'Developer',
          active: true,
          createdAt: '2022-01-01',
        });
      }
      const devRole = await db.roles.get('role_developer');
      if (!devRole) {
        await db.roles.put({
          id: 'role_developer',
          name: 'Developer',
          titleAr: 'المبرمج',
          titleEn: 'System Developer',
          descriptionAr: 'صلاحيات هندسية كاملة لإدارة قاعدة بيانات MySQL والإعدادات وسجل العمليات وخطة الاختبار',
          descriptionEn: 'Full developer access to MySQL DB, settings, audit logs, and QA test plan',
        });
      }
    } catch {
      // ignore if DB is initializing
    }

    const perms: RolePermission[] = await permissionsRepository.getAllPermissions();
    const defaults = buildRolePermissions();
    this.permissionsCache.clear();

    const existingKeys = new Set(perms.map((p) => `${p.role}_${p.resource}`));
    const missingPerms: RolePermission[] = [];

    for (const def of defaults) {
      const key = `${def.role}_${def.resource}`;
      if (!existingKeys.has(key)) {
        missingPerms.push(def);
        this.permissionsCache.set(key, def.actions);
      }
    }

    for (const p of perms) {
      this.permissionsCache.set(`${p.role}_${p.resource}`, p.actions);
    }

    if (missingPerms.length > 0) {
      try {
        await permissionsRepository.saveBulkPermissions(missingPerms);
      } catch {
        // ignore if DB is initializing
      }
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getPermissionsFor(role: string, resource: ResourceScreen): Record<PermissionAction, boolean> | undefined {
    return this.permissionsCache.get(`${role}_${resource}`);
  }

  async login(username: string, passwordPlain: string): Promise<{ ok: boolean; user?: User }> {
    // Server authenticates both Developer and staff identities; the staff UI
    // exposes only the approved /api/v2 patient pilot, not legacy Dexie pages.
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: passwordPlain }),
      });
      if (!response.ok) return { ok: false };
      const payload = await response.json() as ServerIdentity;
      let user: User | null = null;
      if (payload.ok && payload.username === 'developer' && payload.role === 'Developer') {
        await mysqlSyncService.autoSyncOnStartup();
        await this.reloadPermissionsCache();
        user = serverDeveloperUser();
      } else {
        user = serverStaffUser(payload);
      }
      if (!user) {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        return { ok: false };
      }
      this.currentUser = user;
      await this.logAudit('تسجيل دخول إلى النظام / User Sign-In', 'auth', user.id);
      return { ok: true, user };
    } catch {
      return { ok: false };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.currentUser) {
        await this.logAudit('تسجيل خروج / User Sign-Out', 'auth', this.currentUser.id);
      }
    } finally {
      this.currentUser = null;
      localStorage.removeItem(SESSION_KEY);
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      } catch {
        // The browser is logged out even if the API is offline.
      }
    }
  }

  async logAudit(
    action: string,
    screen: ResourceScreen | 'auth',
    recordId: string,
    details = ''
  ): Promise<void> {
    const u = this.currentUser;
    if (u && u.role !== 'Developer') return; // Staff pilot never writes local user audit data.
    await permissionsRepository.addAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: u?.id || 'anonymous',
      username: u?.username || 'anonymous',
      role: u?.role || 'Receptionist',
      action,
      screen,
      recordId,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      details,
    });
  }
}

export const authService = new AuthService();
