import 'dotenv/config';
import mysql from 'mysql2/promise';
import { MYSQL_TABLES_CONFIG, buildCreateTableSQL } from '../src/db/mysql-schema';
import { StaffAccountStore } from '../server/staff-accounts';
import { ServerPermissionStore } from '../server/server-permissions';
import { PatientDomainStore } from '../server/patient-domain';
import { LabWorkflowStore } from '../server/lab-workflow';
import { InvoiceDraftStore } from '../server/invoice-drafts';
import { SafeInventoryStore } from '../server/safe-inventory';
import { StockReceiptStore } from '../server/stock-receiving';
import { StockQcReviewStore } from '../server/stock-qc-review';
import { JournalDraftStore } from '../server/journal-drafts';
import { BranchRegistry } from '../server/branch-registry';
import { BranchPatientStore } from '../server/branch-patient-domain';
import { BranchLabWorkflowStore } from '../server/branch-lab-workflow';
import { BranchPreliminaryResultsStore } from '../server/branch-results';

async function main(): Promise<void> {
  const dbName = process.env.MYSQL_DATABASE || '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.MYSQL_HOST || '127.0.0.1')) {
    throw new Error('Refusing to initialize a remote MySQL host from the local sandbox tool.');
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,54}_(test|demo)$/.test(dbName) ||
      process.env.TLAB_SANDBOX_INIT !== 'CONFIRM_EMPTY_TEST_DATABASE' ||
      (process.env.TLAB_ADMIN_PASSWORD || '').length < 16) {
    throw new Error('Refusing schema initialization: requires *_test or *_demo database name, explicit confirmation and strong Developer password.');
  }
  if (process.env.TLAB_ENABLE_LEGACY_API === 'true' ||
      process.env.TLAB_ENABLE_UNSAFE_BULK_IMPORT === 'true' ||
      process.env.TLAB_ENABLE_SNAPSHOT_PULL === 'true' ||
      process.env.MYSQL_AUTO_SYNC === 'true') {
    throw new Error('Refusing initialization with unsafe legacy SQL or sync settings.');
  }
  const baseConfig = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: dbName,
    connectTimeout: 7000,
    multipleStatements: false,
  };
  if (!baseConfig.user || !Number.isInteger(baseConfig.port) ||
      baseConfig.port < 1 || baseConfig.port > 65535) throw new Error('Invalid MySQL configuration');
  // Do not create a schema automatically: the operator must explicitly create a
  // new, empty test schema in MySQL Workbench before running this script.
  const conn = await mysql.createConnection(baseConfig);
  try {
    const [existing] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES');
    if (existing.length) {
      throw new Error('Test database is NOT EMPTY. Refusing to initialize or overwrite any table.');
    }
    const [versions] = await conn.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
    const version = String(versions[0]?.version || '');
    if (!/^5\.5\.|^8\./.test(version)) {
      throw new Error('MySQL version not in tested set (5.5 or 8.x).');
    }
    console.log('Initializing ONLY the empty sandbox schema: ' + dbName + ' (MySQL ' + version + ')');
    for (const mapping of MYSQL_TABLES_CONFIG) {
      await conn.query(buildCreateTableSQL(mapping));
    }
  } finally { await conn.end(); }

  const connect = () => mysql.createConnection(baseConfig);
  for (const store of [
    new StaffAccountStore(connect), new ServerPermissionStore(connect),
    new PatientDomainStore(connect), new LabWorkflowStore(connect),
    new InvoiceDraftStore(connect), new SafeInventoryStore(connect),
    new StockReceiptStore(connect), new StockQcReviewStore(connect),
    new JournalDraftStore(connect), new BranchRegistry(connect), new BranchPatientStore(connect), new BranchLabWorkflowStore(connect), new BranchPreliminaryResultsStore(connect),
  ]) {
    if ('ensureTables' in store && typeof store.ensureTables === 'function') {
      await store.ensureTables();
    } else if ('ensureTable' in store && typeof store.ensureTable === 'function') {
      await store.ensureTable();
    }
  }
  const verify = await connect();
  try {
    const [tables] = await verify.query<mysql.RowDataPacket[]>('SHOW TABLES');
    console.log('Sandbox initialized with ' + tables.length +
      ' tables. No user/password seed, patient data, or production schema was imported.');
    console.log('Production sync and legacy bulk endpoints MUST remain disabled.');
  } finally { await verify.end(); }
}
main().catch(error => {
  console.error('Sandbox initialization stopped: ' + (error instanceof Error ? error.message : 'unknown failure'));
  process.exitCode = 1;
});
