/**
 * Export non-destructive MySQL 5.5 schema from actual source definitions.
 * Only for a new empty tlab_local_test database. Never import into live data.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import type {Connection} from 'mysql2/promise';
import {MYSQL_TABLES_CONFIG,buildCreateTableSQL} from '../src/db/mysql-schema';
import {StaffAccountStore} from '../server/staff-accounts';
import {ServerPermissionStore} from '../server/server-permissions';
import {PatientDomainStore} from '../server/patient-domain';
import {LabWorkflowStore} from '../server/lab-workflow';
import {InvoiceDraftStore} from '../server/invoice-drafts';
import {SafeInventoryStore} from '../server/safe-inventory';
import {StockReceiptStore} from '../server/stock-receiving';
import {StockQcReviewStore} from '../server/stock-qc-review';
import {JournalDraftStore} from '../server/journal-drafts';
import {BranchRegistry} from '../server/branch-registry';
import {BranchPatientStore} from '../server/branch-patient-domain';
import {BranchLabWorkflowStore} from '../server/branch-lab-workflow';

const statements=new Map<string,string>();
function collect(sql:string) {
  const query=sql.trim().replace(/;\s*$/,'');
  const hit=/^CREATE TABLE IF NOT EXISTS\s+[^A-Za-z0-9_]?([A-Za-z0-9_]+)[^A-Za-z0-9_]?[\s]*\(/i.exec(query);
  if(!hit)throw Error('Schema exporter rejected non-CREATE statement: '+query.slice(0,70));
  if(statements.has(hit[1]))throw Error('Duplicate table '+hit[1]);
  if(/\b(DROP|TRUNCATE|REPLACE|DELETE|UPDATE)\b/i.test(query))throw Error('Destructive statement');
  statements.set(hit[1],query+';');
}
for(const m of MYSQL_TABLES_CONFIG)collect(buildCreateTableSQL(m));
const fake={
  query:async(sql:string)=>{collect(sql);return [[],[]];},
  execute:async()=>[[],[]],
  end:async()=>{},
} as unknown as Connection;
const connect=async()=>fake;
async function main() {
  const stores=[
    new StaffAccountStore(connect),new ServerPermissionStore(connect),
    new PatientDomainStore(connect),new LabWorkflowStore(connect),
    new InvoiceDraftStore(connect),new SafeInventoryStore(connect),
    new StockReceiptStore(connect),new StockQcReviewStore(connect),
    new JournalDraftStore(connect),new BranchRegistry(connect),
    new BranchPatientStore(connect),new BranchLabWorkflowStore(connect),
  ];
  for(const store of stores) {
    if('ensureTables' in store && typeof store.ensureTables==='function')await store.ensureTables();
    else if('ensureTable' in store && typeof store.ensureTable==='function')await store.ensureTable();
  }
  const lines=[
    '-- T-Lab MySQL 5.5 complete CURRENT-CODE schema for disposable multi-branch SANDBOX.',
    '-- This file is NOT a complete clinical/finance/offline product release.',
    '-- IMPORTANT: old public/tlab_db_complete_v7.sql destroys existing data. DO NOT use it for migration.',
    '-- Create an EMPTY local MySQL database named tlab_local_test. Do not run on production.',
    '-- No DROP, TRUNCATE, destructive REPLACE, patients, passwords or data are included.',
    'SET NAMES utf8;',
    'CREATE DATABASE IF NOT EXISTS tlab_local_test DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;',
    'USE tlab_local_test;',
    ...Array.from(statements.entries()).flatMap(([table,sql])=>['','-- '+table,sql]),
  ];
  const file=resolve('sql/tlab_multibranch_mysql55_schema.sql');
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,lines.join('\n')+'\n','utf8');
  console.log('Wrote '+statements.size+' tables to '+file);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
