/**
 * Import a verified T-Lab browser backup into an ISOLATED TEST MySQL database.
 *
 * Dry-run (no modifications):
 *   node --import tsx --env-file=.env scripts/import-browser-backup-to-mysql.ts backup.json
 *
 * Explicit import (ONLY tlab_multibranch_pilot):
 *   node --import tsx --env-file=.env scripts/import-browser-backup-to-mysql.ts backup.json --apply --confirm=IMPORT_INTO_TEST_DATABASE
 *
 * Always take and VERIFY an independent MySQL backup first.
 * Does not replace, update, delete or auto-resolve conflicting records.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { MYSQL_TABLES_CONFIG } from '../src/db/mysql-schema';

type Row = Record<string,unknown>;
type Backup = {
  format:string;counts:Record<string,number>;totalRows:number;
  tables:Record<string,unknown[]>;
};
function normalize(value:unknown):unknown{
  if(Array.isArray(value))return value.map(normalize);
  if(value && typeof value==='object'){
    const ordered:Record<string,unknown>={};
    for(const key of Object.keys(value as Row).sort())ordered[key]=normalize((value as Row)[key]);
    return ordered;
  }
  return value;
}
const signature=(row:unknown)=>createHash('sha256').update(JSON.stringify(normalize(row))).digest('hex');
const input=process.argv[2];
const apply=process.argv.includes('--apply');
const confirm=process.argv.includes('--confirm=IMPORT_INTO_TEST_DATABASE');
if(!input || (apply&&!confirm)){
  console.error('Usage: ... import-browser-backup-to-mysql.ts <backup.json> [--apply --confirm=IMPORT_INTO_TEST_DATABASE]');
  process.exit(2);
}
const database=String(process.env.MYSQL_DATABASE||'tlab_db');
if(!/^[A-Za-z0-9_]+$/.test(database)){
  throw new Error('INVALID_MYSQL_DATABASE');
}
if(apply && database!=='tlab_multibranch_pilot'){
  throw new Error('IMPORT_REFUSED: Only the isolated tlab_multibranch_pilot TEST schema can be modified.');
}
const backup=JSON.parse(fs.readFileSync(input,'utf8')) as Backup;
if(backup.format!=='tlab-indexeddb-readonly-backup-v1' ||
  !backup.tables || typeof backup.tables!=='object' ||
  MYSQL_TABLES_CONFIG.length!==49)throw new Error('INVALID_BACKUP_FORMAT_OR_MAPPING');
const tableKeys=MYSQL_TABLES_CONFIG.map(x=>x.dexieTable).sort();
if(JSON.stringify(Object.keys(backup.tables).sort())!==JSON.stringify(tableKeys)){
  throw new Error('BACKUP_NOT_EXACTLY_49_STORES');
}
const validated=new Map<string,Row[]>();
let total=0;
for(const config of MYSQL_TABLES_CONFIG){
  const rows=backup.tables[config.dexieTable];
  if(!Array.isArray(rows))throw new Error('MISSING_BACKUP_STORE: '+config.dexieTable);
  const ids=new Set<string>();
  const checked:Row[]=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('INVALID_RECORD: '+config.dexieTable);
    const obj=row as Row;
    if(typeof obj.id!=='string'||obj.id.length<1||obj.id.length>64||/[\\x00-\\x1f]/.test(obj.id))throw new Error('INVALID_ID: '+config.dexieTable);
    if(ids.has(obj.id))throw new Error('DUPLICATE_ID: '+config.dexieTable+':'+obj.id);
    ids.add(obj.id);
    checked.push(obj);
  }
  if(backup.counts?.[config.dexieTable]!==checked.length)throw new Error('BACKUP_COUNT_MISMATCH: '+config.dexieTable);
  total+=checked.length;
  validated.set(config.dexieTable,checked);
}
if(total!==backup.totalRows)throw new Error('BACKUP_TOTAL_COUNT_MISMATCH');
const connection=await mysql.createConnection({
  host:process.env.MYSQL_HOST||'127.0.0.1',
  port:Number(process.env.MYSQL_PORT||3306),
  user:process.env.MYSQL_USER||'root',
  password:process.env.MYSQL_PASSWORD||'',
  database,connectTimeout:8000,
});
const summary:Array<{store:string;browser:number;mysql:number;newRecords:number;identical:number;conflicts:number}>=[];
const pending:Array<{config:typeof MYSQL_TABLES_CONFIG[number];rows:Row[]}>=[];
try {
  await connection.beginTransaction();
  const [checkTable]=await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS matches FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='mysql_store_branch_access'");
  if(Number(checkTable[0]?.matches)!==1)throw new Error('APPLY_SQL_V8_FIRST_ON_RESTORED_TEST_COPY');
  let conflictCount=0;
  for(const config of MYSQL_TABLES_CONFIG){
    const rows=validated.get(config.dexieTable)!;
    const [stored]=await connection.query<mysql.RowDataPacket[]>(
      'SELECT id,raw_json FROM `'+config.mysqlTable+'` FOR UPDATE');
    const byId=new Map<string,Row>();
    for(const value of stored){
      let parsed:Row={};
      try {parsed=JSON.parse(String(value.raw_json||'{}')) as Row;}catch{ /* mismatches are flagged */ }
      byId.set(String(value.id),parsed);
    }
    const newcomers:Row[]=[];let identical=0,conflicts=0;
    for(const row of rows){
      const old=byId.get(row.id as string);
      if(old===undefined)newcomers.push(row);
      else if(signature(old)===signature(row))identical++;
      else{conflicts++;conflictCount++;}
    }
    summary.push({store:config.dexieTable,browser:rows.length,mysql:stored.length,
      newRecords:newcomers.length,identical,conflicts});
    pending.push({config,rows:newcomers});
  }
  console.table(summary);
  console.log('Total backup rows:',total,'| Conflicts:',conflictCount,'| Apply requested:',apply);
  if(conflictCount>0)throw new Error('CONFLICTS_BLOCK_IMPORT: Reconcile source and MySQL records manually; no changes were committed.');
  if(!apply){
    await connection.rollback();
    console.log('DRY_RUN_COMPLETE: no database changes.');
  }else{
    for(const {config,rows} of pending){
      const cols=[...config.columns.map(c=>c.name),'raw_json'];
      if(!cols.every(k=>/^[a-z_]+$/.test(k)))throw new Error('INVALID_COLUMN_MAPPING');
      const names=cols.map(k=>'`'+k+'`').join(',');
      const sql='INSERT INTO `'+config.mysqlTable+'` ('+names+') VALUES ('+cols.map(()=>'?').join(',')+')';
      for(const row of rows){
        const values=[...config.columns.map(c=>c.extract(row)),JSON.stringify(row)];
        await connection.execute(sql,values);
        await connection.execute(
          'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
          [config.dexieTable,String(row.id),'branch_main','verified_test_backup_import']);
      }
    }
    await connection.commit();
    console.log('TEST_IMPORT_COMMITTED: compare each table count and financial totals in Workbench.');
  }
}catch(error){
  await connection.rollback().catch(()=>undefined);
  throw error;
}finally{
  await connection.end();
}
