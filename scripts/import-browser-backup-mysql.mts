/**
 * One-time, explicit migration of an existing 49-store T-Lab backup to MySQL.
 * Default is DRY RUN. Existing MySQL IDs are never changed or overwritten.
 *
 * node --import tsx scripts/import-browser-backup-mysql.mts --file "backup.json"
 * node --import tsx scripts/import-browser-backup-mysql.mts --file "backup.json" --apply --verified-backup --actor developer --branch branch_main
 *
 * PRIVATE FILE: Contains patient, financial and possibly credential records.
 * Do not upload to GitHub, send to telemetry or commit to source control.
 */
import fs from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {MYSQL_TABLES_CONFIG} from '../src/db/mysql-schema';

dotenv.config();
const argumentsList=process.argv.slice(2);
const getArg=(key:string)=>{
  const index=argumentsList.indexOf('--'+key);
  return index<0 ? undefined : argumentsList[index+1];
};
const has=(key:string)=>argumentsList.includes('--'+key);
const source=getArg('file');
if(!source||!fs.existsSync(source))throw new Error('BACKUP_FILE_REQUIRED');
const apply=has('apply');
if(apply&&!has('verified-backup'))throw new Error('VERIFIED_MYSQL_BACKUP_REQUIRED');
const branchId=getArg('branch')||'branch_main';
const actorName=getArg('actor')||'developer';
if(!/^[A-Za-z0-9_.-]{1,64}$/.test(actorName)||
   !/^[A-Za-z0-9_.-]{1,64}$/.test(branchId))throw new Error('INVALID_IMPORT_IDENTITY');
const payload=JSON.parse(fs.readFileSync(source,'utf8')) as {
  format:string;tables:Record<string,unknown[]>;counts:Record<string,number>;totalRows:number;
};
if(payload.format!=='tlab-indexeddb-readonly-backup-v1'||!payload.tables||
   !payload.counts||typeof payload.tables!=='object')throw new Error('INVALID_BACKUP_FORMAT');
const mappings=MYSQL_TABLES_CONFIG;
if(mappings.length!==49||new Set(mappings.map(x=>x.dexieTable)).size!==49)
  throw new Error('MYSQL_SCHEMA_MAPPING_INCOMPLETE');
const known=new Set(mappings.map(x=>x.dexieTable));
if(Object.keys(payload.tables).some(x=>!known.has(x)))
  throw new Error('UNEXPECTED_BACKUP_STORE');
const numbers:Record<string,{backup:number;existing:number;missing:number}>={};
const safeRecords=new Map<string,Array<Record<string,unknown>>>();
let total=0;
for(const m of mappings){
  const rows=payload.tables[m.dexieTable];
  if(!Array.isArray(rows)||rows.length!==payload.counts[m.dexieTable])
    throw new Error('BACKUP_TABLE_COUNT_MISMATCH_'+m.dexieTable);
  const seen=new Set<string>();
  const normalized:Array<Record<string,unknown>>=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row))
      throw new Error('INVALID_BACKUP_RECORD_'+m.dexieTable);
    const data=row as Record<string,unknown>;
    const id=data.id;
    if(typeof id!=='string'||!id||id.length>64||seen.has(id))
      throw new Error('INVALID_OR_DUPLICATE_ID_'+m.dexieTable);
    seen.add(id);
    const clone=JSON.parse(JSON.stringify(data)) as Record<string,unknown>;
    if(m.dexieTable==='users'){
      const old=String(clone.passwordHash||'');
      if(old&&!old.startsWith('scrypt$')){
        const salt=randomBytes(16).toString('hex');
        clone.passwordHash=['scrypt',salt,scryptSync(old,salt,64).toString('hex')].join('$');
      }
    }
    normalized.push(clone);
  }
  safeRecords.set(m.dexieTable,normalized);
  total+=normalized.length;
}
if(total!==payload.totalRows)throw new Error('BACKUP_TOTAL_MISMATCH');
if(!process.env.MYSQL_DATABASE||!process.env.MYSQL_USER)
  throw new Error('MYSQL_ENV_CONFIG_REQUIRED');
const db=await mysql.createConnection({
  host:process.env.MYSQL_HOST||'127.0.0.1',
  port:Number(process.env.MYSQL_PORT||3306),
  user:process.env.MYSQL_USER,
  password:process.env.MYSQL_PASSWORD||'',
  database:process.env.MYSQL_DATABASE,
  connectTimeout:10000,
});
try{
  const [branches]=await db.execute<mysql.RowDataPacket[]>(
    'SELECT id FROM branches WHERE id=? AND active=1',[branchId]);
  if(!branches.length)throw new Error('IMPORT_BRANCH_NOT_FOUND');
  const [actors]=await db.execute<mysql.RowDataPacket[]>(
    "SELECT id FROM users WHERE username=? AND role='Developer' AND active=1",[actorName]);
  const actor=actors[0]?.id;
  if(!actor)throw new Error('IMPORT_ACTOR_MUST_BE_ACTIVE_DEVELOPER');
  for(const map of mappings){
    const rows=safeRecords.get(map.dexieTable)!;
    const existingIds=new Set<string>();
    for(let start=0;start<rows.length;start+=400){
      const ids=rows.slice(start,start+400).map(x=>String(x.id));
      if(!ids.length)continue;
      const [found]=await db.query<mysql.RowDataPacket[]>(
        'SELECT id FROM `'+map.mysqlTable+'` WHERE id IN ('+
          ids.map(()=>'?').join(',')+')',ids);
      found.forEach(x=>existingIds.add(String(x.id)));
    }
    numbers[map.dexieTable]={
      backup:rows.length,existing:existingIds.size,missing:rows.length-existingIds.size,
    };
  }
  console.log(JSON.stringify({
    mode:apply?'apply':'dry-run',schema:process.env.MYSQL_DATABASE,branch:branchId,
    totalBackupRows:total,totalMissing:Object.values(numbers).reduce((s,x)=>s+x.missing,0),
    stores:numbers,
  },null,2));
  if(!apply){
    console.log('DRY RUN ONLY: NO DATABASE ROWS WRITTEN');
  }else{
    await db.beginTransaction();
    try{
      const imported:Record<string,number>={};
      for(const m of mappings){
        const rows=safeRecords.get(m.dexieTable)!;
        const cols=[...m.columns.map(c=>c.name),'raw_json'];
        const query='INSERT INTO `'+m.mysqlTable+'` ('+
          cols.map(x=>'`'+x+'`').join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')';
        let count=0;
        for(const row of rows){
          const [old]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT id FROM `'+m.mysqlTable+'` WHERE id=? LIMIT 1',[row.id]);
          if(old.length)continue; // MySQL is canonical. Never overwrite real records.
          if(m.dexieTable==='users'){
            const username=String(row.username||'').trim();
            if(!/^[A-Za-z0-9_.-]{1,64}$/.test(username))
              throw new Error('INVALID_IMPORTED_USERNAME');
            const [duplicates]=await db.execute<mysql.RowDataPacket[]>(
              'SELECT id FROM users WHERE username=? LIMIT 1',[username]);
            if(duplicates.length)throw new Error('DUPLICATE_USERNAME_IMPORTED');
          }
          const values=[...m.columns.map(c=>c.extract(row)),JSON.stringify(row)];
          // Optional historical FKs use SQL NULL, not an invalid empty-string reference.
          const optionalFKs=new Set([
            'doctor_id','request_id','lot_id','ref_lab_id','supplier_id',
            'original_invoice_id',
          ]);
          for(let i=0;i<m.columns.length;i++){
            if(optionalFKs.has(m.columns[i].name)&&values[i]==='')
              values[i]=null;
          }
          await db.execute(query,values);
          await db.execute(
            'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
            [m.dexieTable,row.id,branchId,actor]);
          if(m.dexieTable==='users'&&row.id!==actor){
            await db.execute(
              'INSERT IGNORE INTO user_branches(user_id,branch_id,is_default) VALUES(?,?,1)',
              [row.id,branchId]);
          }
          await db.execute(
            'INSERT INTO tlab_mutation_audit_v10(event_id,resource,record_id,branch_id,actor_id,operation,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())',
            [randomBytes(16).toString('hex'),m.dexieTable,row.id,branchId,actor,
              'add',null,null]);
          count++;
        }
        imported[m.dexieTable]=count;
      }
      await db.commit();
      console.log('MYSQL_IMPORT_COMMITTED',JSON.stringify(imported));
    }catch(error){
      await db.rollback();
      console.error('MYSQL_IMPORT_ROLLED_BACK',error instanceof Error?error.message:String(error));
      process.exitCode=1;
    }
  }
}finally{
  await db.end();
}
