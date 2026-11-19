import 'dotenv/config';
import mysql from 'mysql2/promise';

const database = process.env.MYSQL_DATABASE || '';
const host = process.env.MYSQL_HOST || '127.0.0.1';

async function main() {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,54}_(test|demo)$/.test(database) ||
      !['127.0.0.1', 'localhost', '::1'].includes(host) ||
      process.env.TLAB_SANDBOX_SEED !== 'CONFIRM_SYNTHETIC_DEMO_DATA') {
    throw new Error('Demo seeding requires explicit confirmation, local MySQL and a *_test/_demo schema.');
  }
  if (['TLAB_ENABLE_LEGACY_API', 'MYSQL_AUTO_SYNC', 'TLAB_ENABLE_UNSAFE_BULK_IMPORT',
      'TLAB_ENABLE_SNAPSHOT_PULL'].some(key => process.env[key] === 'true')) {
    throw new Error('Refusing demo data with unsafe import or sync flags.');
  }
  const db = await mysql.createConnection({
    host, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database, connectTimeout: 8000, multipleStatements: false,
  });
  try {
    await db.beginTransaction();
    try {
      // Dedicated demo catalog only; never mix with existing real or hand-entered tests.
      for (const table of ['lab_tests', 'test_parameters',
        'inventory_items', 'chart_of_accounts', 'period_locks']) {
        const [rows] = await db.query<mysql.RowDataPacket[]>(
          'SELECT COUNT(*) AS qty FROM ' + table,
        );
        if (Number(rows[0]?.qty || 0) !== 0) {
          throw new Error('The ' + table + ' table is not empty; no demo data was inserted.');
        }
      }
      const tests = [
        ['demo_lab_test_1','DEMO_T1','تجريبي فقط — تحليل رقم 1','Demo Test One', '25.00'],
        ['demo_lab_test_2','DEMO_T2','تجريبي فقط — تحليل رقم 2','Demo Test Two', '40.00'],
        ['demo_lab_test_3','DEMO_T3','تجريبي فقط — تحليل رقم 3','Demo Test Three', '65.00'],
      ];
      for (const [id,code,ar,en,price] of tests) {
        await db.execute(
          'INSERT INTO lab_tests (id, code, name_ar, name_en, price, active) VALUES (?, ?, ?, ?, ?, 1)',
          [id,code,ar,en,price],
        );
      }
      const parameters = [
        ['demo_param_1','demo_lab_test_1','DEMO_P1','بارامتر وهمي رقم 1'],
        ['demo_param_2','demo_lab_test_1','DEMO_P2','بارامتر وهمي رقم 2'],
        ['demo_param_3','demo_lab_test_2','DEMO_P3','بارامتر وهمي رقم 3'],
        ['demo_param_4','demo_lab_test_3','DEMO_P4','بارامتر وهمي رقم 4'],
      ];
      for (const [id,testId,code,name] of parameters) {
        await db.execute(
          'INSERT INTO test_parameters (id, test_id, code, name_ar, unit, result_type, is_calculated, active) ' +
          'VALUES (?, ?, ?, ?, ?, ?, 0, 1)',
          [id,testId,code,name,'DEMO-UNIT','numeric'],
        );
      }
      for (const [id,code,label] of [
        ['demo_reagent_1','DEMO_REAGENT_1','كاشف تجريبي 1 — لا يستخدم طبيًا'],
        ['demo_reagent_2','DEMO_REAGENT_2','كاشف تجريبي 2 — لا يستخدم طبيًا'],
      ]) {
        await db.execute(
          'INSERT INTO inventory_items (id, code, name_ar, current_stock, active) VALUES (?, ?, ?, 0, 1)',
          [id,code,label],
        );
      }
      for (const [id,code,label,type] of [
        ['demo_coa_asset','DEMO1000','حساب تجريبي للأصول','asset'],
        ['demo_coa_revenue','DEMO4000','حساب تجريبي للإيرادات','revenue'],
      ]) {
        await db.execute(
          'INSERT INTO chart_of_accounts (id, code, name_ar, type, balance) VALUES (?, ?, ?, ?, 0)',
          [id,code,label,type],
        );
      }
      const month = new Date().toISOString().slice(0,7);
      await db.execute(
        'INSERT INTO period_locks (id, period_month, locked) VALUES (?, ?, 0)',
        ['demo_period_' + month.replace('-', '_'),month],
      );
      await db.commit();
      console.log('Inserted synthetic demo catalog: 3 tests / 4 parameters / 2 reagents / 2 accounts.');
      console.log('No patients, valid medical ranges, official invoices, financial postings or real stock were created.');
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally { await db.end(); }
}
main().catch(error => {
  console.error('DEMO SEED BLOCKED: ' + (error instanceof Error ? error.message : 'unknown failure'));
  process.exitCode = 1;
});
