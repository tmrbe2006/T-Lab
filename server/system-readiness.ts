import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver } from './patient-domain';

// This is a technical readiness check, NOT an approval for clinical operation.
const REQUIRED_TABLES = [
  'patients', 'lab_requests', 'request_items', 'samples', 'lab_tests',
  'test_parameters', 'lab_results', 'inventory_items', 'inventory_lots',
  'secure_auth_users', 'secure_role_permissions', 'secure_record_versions',
  'secure_patient_audit', 'secure_lab_audit', 'secure_invoice_drafts',
  'secure_stock_operations', 'secure_stock_receipts', 'secure_stock_qc_reviews', 'secure_journal_drafts', 'secure_journal_draft_lines',
] as const;

export interface ReadinessReport {
  databaseConnected: boolean;
  mysqlVersion: string | null;
  schemaTablesPresent: number;
  schemaTablesExpected: number;
  missingTables: string[];
  productionStaticAssets: boolean;
  backgroundLegacySyncDisabled: boolean;
  unsafeBulkImportDisabled: boolean;
  snapshotPullDisabled: boolean;
  autoSchemaBootstrapDisabled: boolean;
  developerPasswordConfigured: boolean;
  status: 'technical_checks_passed' | 'attention_required';
  clinicalReleaseApproved: false;
}

export async function computeReadiness(connect: () => Promise<Connection>): Promise<ReadinessReport> {
  const base: ReadinessReport = {
    databaseConnected: false,
    mysqlVersion: null,
    schemaTablesPresent: 0,
    schemaTablesExpected: REQUIRED_TABLES.length,
    missingTables: [...REQUIRED_TABLES],
    productionStaticAssets: process.argv.includes('--static-dist'),
    backgroundLegacySyncDisabled: process.env.MYSQL_AUTO_SYNC !== 'true',
    unsafeBulkImportDisabled: process.env.TLAB_ENABLE_UNSAFE_BULK_IMPORT !== 'true',
    snapshotPullDisabled: process.env.TLAB_ENABLE_SNAPSHOT_PULL !== 'true',
    autoSchemaBootstrapDisabled: process.env.TLAB_ALLOW_SCHEMA_BOOTSTRAP !== 'true',
    developerPasswordConfigured: (process.env.TLAB_ADMIN_PASSWORD || '').length >= 16,
    status: 'attention_required',
    clinicalReleaseApproved: false,
  };
  let conn: Connection | undefined;
  try {
    conn = await connect();
    const [versions] = await conn.query<RowDataPacket[]>('SELECT VERSION() AS version');
    const version = String(versions[0]?.version || '');
    base.mysqlVersion = version || null;
    const [tableRows] = await conn.query<RowDataPacket[]>('SHOW TABLES');
    const tableNames = new Set(tableRows.map(row => String(Object.values(row)[0])));
    base.missingTables = REQUIRED_TABLES.filter(table => !tableNames.has(table));
    base.schemaTablesPresent = REQUIRED_TABLES.length - base.missingTables.length;
    base.databaseConnected = true;
  } catch {
    // Fail closed. Never expose MySQL passwords, hostnames or exception details.
  } finally {
    try { if (conn) await conn.end(); } catch { /* ignore closing failure */ }
  }
  if (base.databaseConnected && base.missingTables.length === 0 &&
      base.backgroundLegacySyncDisabled && base.unsafeBulkImportDisabled &&
      base.snapshotPullDisabled && base.autoSchemaBootstrapDisabled &&
      base.productionStaticAssets && base.developerPasswordConfigured) {
    base.status = 'technical_checks_passed';
  }
  return base;
}

export function installReadinessRoutes(
  app: Express, connect: () => Promise<Connection>, identity: IdentityResolver
): void {
  app.get('/api/v2/admin/readiness', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    if (actor.role !== 'Developer') return res.status(403).json({ ok: false });
    const report = await computeReadiness(connect);
    return res.json({ ok: true, report });
  });
}
