import { afterEach, describe, expect, it, vi } from 'vitest';
import { permissionsRepository } from '../../repositories/permissions.repository';
import { authService } from '../../auth/auth.service';
import type { AuditLog } from '../../types';

afterEach(()=>vi.unstubAllGlobals());
const log:AuditLog={
 id:'local_attempt_1',userId:'client_claim',username:'client_claim',role:'Developer',
 action:'تسجيل دخول إلى النظام / User Sign-In',screen:'auth',
 recordId:'usr_dev',timestamp:'2026-11-21 10:00:00',details:'Sign-in',
};
describe('MySQL-only branch-pilot authentication audit',()=>{
 it('records an audit via authenticated server, not local IndexedDB',async()=>{
  vi.stubGlobal('window',{location:{port:'3127'}});
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
   ok:true,source:'mysql',id:'server_audit_1'
  })}));
  vi.stubGlobal('fetch',fetcher);
  expect(await permissionsRepository.addAuditLog(log)).toBe('server_audit_1');
  const [path, options]=(fetcher.mock.calls as unknown as Array<[string,RequestInit]>)[0];
  expect(path).toBe('/api/branch-pilot/audit-log');
  expect(options.credentials).toBe('same-origin');
  const body=JSON.parse(String(options.body));
  expect(body).toEqual({
   action:log.action, screen:'auth', recordId:log.recordId, details:log.details,
  });
  expect(JSON.stringify(body)).not.toContain('client_claim');
 });
 it('accepts a server verified developer sign-in after MySQL audit succeeds',async()=>{
  vi.stubGlobal('window',{location:{port:'3127'}});
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
   ok:true,source:'mysql',id:'server_audit_2'
  })}));
  vi.stubGlobal('fetch',fetcher);
  const context={branchId:'branch_main',code:'BR-001',nameAr:'الفرع الرئيسي',permissions:[]};
  const login=await authService.login('developer','not-sent-to-audit',context,
   {userId:'usr_dev',role:'Developer'});
  expect(login.ok).toBe(true);
  expect(authService.getActiveBranch()?.branchId).toBe('branch_main');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('does not quietly fall back to IndexedDB when the audit API fails',async()=>{
  vi.stubGlobal('window',{location:{port:'3127'}});
  vi.stubGlobal('fetch',vi.fn(async()=>({
   ok:false,json:async()=>({ok:false,error:'MYSQL_UNAVAILABLE'}),
  })));
  await expect(permissionsRepository.addAuditLog(log)).rejects.toThrow('MYSQL_UNAVAILABLE');
 });
});
