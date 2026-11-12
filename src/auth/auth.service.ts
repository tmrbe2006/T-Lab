import { db } from '../db/database';
import { buildRolePermissions } from '../db/seed';
import { permissionsRepository, usersRepository } from '../repositories';
import type { PermissionAction, ResourceScreen, RolePermission, User } from '../types';

const SESSION_KEY = 'medlab_current_user';

class AuthService {
  private currentUser: User | null = null;
  private permissionsCache: Map<string, Record<PermissionAction, boolean>> = new Map();

  async init(): Promise<void> {
    await this.reloadPermissionsCache();
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as User;
        const freshUser = await usersRepository.getByUsername(parsed.username);
        if (freshUser && freshUser.active) {
          this.currentUser = freshUser;
          localStorage.setItem(SESSION_KEY, JSON.stringify(freshUser));
        } else {
          this.logout();
        }
      } catch {
        this.logout();
      }
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
          passwordHash: 'dev123',
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
    const user = await usersRepository.getByUsername(username.trim());
    if (!user || !user.active || user.passwordHash !== passwordPlain) {
      return { ok: false };
    }
    this.currentUser = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    await this.logAudit('تسجيل دخول إلى النظام / User Sign-In', 'auth', user.id, `Username: ${user.username} (${user.role})`);
    return { ok: true, user };
  }

  async logout(): Promise<void> {
    if (this.currentUser) {
      await this.logAudit('تسجيل خروج / User Sign-Out', 'auth', this.currentUser.id, `Username: ${this.currentUser.username}`);
    }
    this.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
  }

  async logAudit(
    action: string,
    screen: ResourceScreen | 'auth',
    recordId: string,
    details = ''
  ): Promise<void> {
    const u = this.currentUser;
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
