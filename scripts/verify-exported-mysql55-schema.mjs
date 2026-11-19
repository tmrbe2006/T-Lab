import {readFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
const sql=readFileSync('sql/tlab_multibranch_mysql55_schema.sql','utf8');
const commands=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n')
  .split(';').map(cmd=>cmd.trim()).filter(Boolean);
if(commands.length<40)throw Error('Unexpectedly incomplete schema export');
for(const cmd of commands){
  if(!/^(SET NAMES utf8|CREATE DATABASE IF NOT EXISTS tlab_local_test|USE tlab_local_test|CREATE TABLE IF NOT EXISTS)/i.test(cmd)){
    throw Error('Rejected unexpected SQL: '+cmd.slice(0,90));
  }
}
const db=await mysql.createConnection({
  host:process.env.MYSQL_HOST||'127.0.0.1',
  port:Number(process.env.MYSQL_PORT||3306),
  user:process.env.MYSQL_USER||'root',
  password:process.env.MYSQL_PASSWORD||'',
  multipleStatements:false,
});
try{
  const [already]=await db.query('SHOW DATABASES LIKE ?', ['tlab_local_test']);
  if((already as unknown[]).length)throw Error('Refusing to load schema into a non-fresh database');
  for(const command of commands)await db.query(command);
  const [rows]=await db.query('SHOW TABLES');
  const tables=(rows as Array<Record<string,unknown>>).map(r=>String(Object.values(r)[0]));
  const expected=commands.filter(s=>/^CREATE TABLE IF NOT EXISTS/i.test(s)).length;
  if(tables.length!==expected)throw Error('Mismatch: '+tables.length+' vs '+expected);
  for(const table of ['secure_branch_patients','secure_branch_requests','secure_branch_samples',
    'secure_auth_users','secure_branch_lab_audit','secure_role_permissions']){
    if(!tables.includes(table))throw Error('Missing required '+table);
  }
  const [live]=await db.query('SELECT COUNT(*) AS n FROM secure_branch_patients');
  if(Number((live as Array<{n:number}>)[0].n)!==0)throw Error('Schema populated real patient data');
  console.log('PASS: '+tables.length+' MySQL 5.5 DDL tables in isolated, empty tlab_local_test.');
}finally{await db.end();}
