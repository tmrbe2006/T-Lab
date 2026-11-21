import { db } from '../db/database';
import { buildRolePermissions } from '../db/seed';
import { permissionsRepository, usersRepository } from '../repositories';
import type { PermissionAction, ResourceScreen, RolePermission, User } from '../types';

const SESSION_KEY = 'medlab_current_user';

export interface ActiveBranchContext {
  branchId: string;
  code: string;
  nameAr: string;
  permissions: Array<{ resource: string; actions: Record<string, boolean> }>;
}

class AuthService {
  private currentUser: User | null = null;
  private activeBranch: ActiveBranchContext | null = null;
  private permissionsCache: Map<string, Record<PermissionAction, boolean>> = new Map();

  async init(): Promise<void> {
    await this.reloadPermissionsCache();
    if (window.location.port === '3127') {
      try {
        const response = await fetch('/api/branch-pilot/staff-session', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json() as {
          ok:boolean; userId:string; username:string; role:User['role'];
          branch:{branchId:string;code:string;nameAr:string};
          permissions:ActiveBranchContext['permissions'];
        };
        if (response.ok && data.ok) {
          this.currentUser = {
            id:data.userId, username:data.username, role:data.role,
            passwordHash:'', fullNameAr:data.username, fullNameEn:data.username,
            active:true, createdAt:'',
          };
          this.activeBranch = { ...data.branch, permissions:data.permissions };
          return;
        }
      } catch { /* server session expired or unavailable */ }
      this.currentUser = null;
      this.activeBranch = null;
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as User;
        const freshUser = await usersRepository.getByUsername(parsed.username);
        if (freshUser && freshUser.active) {
          if (window.location.port === '3127') {
            try {
              const response = await fetch('/api/branch-pilot/staff-session', { credentials: 'same-origin', cache: 'no-store' });
              const result = await response.json() as {
                ok: boolean; userId: string; username: string;
                branch: {branchId:string;code:string;nameAr:string};
                permissions: ActiveBranchContext['permissions'];
              };
              if (!response.ok || !result.ok || result.userId !== freshUser.id || result.username !== freshUser.username) {
                localStorage.removeItem(SESSION_KEY);
                this.currentUser = null;
                this.activeBranch = null;
                return;
              }
              this.activeBranch = { ...result.branch, permissions: result.permissions };
            } catch {
              localStorage.removeItem(SESSION_KEY);
              this.currentUser = null;
              this.activeBranch = null;
              return;
            }
          }
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
    // Branch pilot permissions are authoritative ONLY from verified server session.
    // Never seed browser users, roles or permissions in MySQL-only mode.
    if (typeof window !== 'undefined' && window.location.port === '3127') {
      this.permissionsCache.clear();
      return;
    }
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

  getActiveBranch(): ActiveBranchContext | null {
    return this.activeBranch;
  }

  getBranchPermission(resource: ResourceScreen, action: PermissionAction): boolean {
    // No stored user/branch override means no access in the branch pilot.
    if (!this.activeBranch) return false;
    const row = this.activeBranch.permissions.find((p) => p.resource === resource);
    return row?.actions?.[action] === true;
  }

  getPermissionsFor(role: string, resource: ResourceScreen): Record<PermissionAction, boolean> | undefined {
    return this.permissionsCache.get(`${role}_${resource}`);
  }

  async login(
    username: string, passwordPlain: string, branch?: ActiveBranchContext,
    verified?: { userId:string; role:User['role'] },
  ): Promise<{ ok: boolean; user?: User }> {
    let user: User | undefined;
    if (window.location.port === '3127') {
      if (!branch || !verified?.userId) return { ok: false };
      // The server authenticated these credentials and selected this branch.
      // IndexedDB demo users must not override the verified MySQL account.
      user = {
        id: verified.userId, username:username.trim(), role:verified.role,
        passwordHash:'', fullNameAr:username.trim(), fullNameEn:username.trim(),
        active:true, createdAt:'',
      };
    } else {
      user = await usersRepository.getByUsername(username.trim());
      if (!user || !user.active || user.passwordHash !== passwordPlain) return { ok: false };
    }
    // Switching the browser identity must revoke any previous elevated
    // local branch-administrator session on the server.
    if (window.location.port === '3127') {
      // Browser identity must exactly match the server-verified branch identity.
      if (!branch) return { ok: false };
    } else {
      await this.revokeBranchPilotSession();
    }
    this.activeBranch = branch || null;
    this.currentUser = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    await this.logAudit('تسجيل دخول إلى النظام / User Sign-In', 'auth', user.id, `Username: ${user.username} (${user.role})`);
    return { ok: true, user };
  }

  async logout(): Promise<void> {
    if (this.currentUser) {
      await this.logAudit('تسجيل خروج / User Sign-Out', 'auth', this.currentUser.id, `Username: ${this.currentUser.username}`);
    }
    await this.revokeBranchPilotSession();
    this.currentUser = null;
    this.activeBranch = null;
    localStorage.removeItem(SESSION_KEY);
  }

  private async revokeBranchPilotSession(): Promise<void> {
    try {
      await fetch('/api/branch-pilot/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Branch pilot is an optional local-only module.
    }
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
