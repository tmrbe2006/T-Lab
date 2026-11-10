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
    const perms: RolePermission[] = await permissionsRepository.getAllPermissions();
    this.permissionsCache.clear();
    for (const p of perms) {
      this.permissionsCache.set(`${p.role}_${p.resource}`, p.actions);
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
