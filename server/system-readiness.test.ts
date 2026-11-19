// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Connection } from 'mysql2/promise';
import express from 'express';
import { computeReadiness, installReadinessRoutes } from './system-readiness';

describe('Technical readiness endpoint', () => {
  const connect = async () => ({
    query: async (sql: string) => sql.startsWith('SELECT VERSION')
      ? [[{ version: '5.5.62' }], []]
      : [[
          ...['patients', 'lab_requests', 'request_items', 'samples', 'lab_tests',
            'test_parameters', 'lab_results', 'inventory_items', 'inventory_lots',
            'secure_auth_users', 'secure_role_permissions', 'secure_record_versions',
            'secure_patient_audit', 'secure_lab_audit', 'secure_invoice_drafts',
            'secure_stock_operations', 'secure_stock_receipts', 'secure_stock_qc_reviews', 'secure_journal_drafts', 'secure_journal_draft_lines', 'secure_lab_branches', 'secure_staff_branch_grants', 'secure_branch_patients', 'secure_branch_patient_audit'].map(name => ({ Tables_in_demo: name })),
        ], []],
    end: async () => {},
  }) as unknown as Connection;

  it('does not represent technical status as clinical approval', async () => {
    const report = await computeReadiness(connect);
    expect(report.databaseConnected).toBe(true);
    expect(report.mysqlVersion).toBe('5.5.62');
    expect(report.missingTables).toEqual([]);
    expect(report.clinicalReleaseApproved).toBe(false);
    expect(JSON.stringify(report)).not.toContain('MYSQL_PASSWORD');
  });

  it('fails closed if the MySQL server cannot be reached', async () => {
    const result = await computeReadiness(async () => { throw new Error('secret password leaked'); });
    expect(result.databaseConnected).toBe(false);
    expect(result.status).toBe('attention_required');
    expect(JSON.stringify(result)).not.toContain('secret password');
  });

  it('denies anonymous and non-Developer requests', async () => {
    const app = express();
    installReadinessRoutes(app, connect, async req => {
      const role = req.get('x-test-role');
      if (!role) return undefined;
      return { userId: 'test', username: 'test', role };
    });
    const server = await new Promise<import('node:http').Server>(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('No port');
      const url = 'http://127.0.0.1:' + addr.port + '/api/v2/admin/readiness';
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { 'x-test-role': 'Receptionist' } })).status).toBe(403);
      const developer = await fetch(url, { headers: { 'x-test-role': 'Developer' } });
      expect(developer.status).toBe(200);
      expect((await developer.json()).report.clinicalReleaseApproved).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
