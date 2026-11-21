/**
 * Transactional MySQL store gateway for the 49 mapped data models.
 *
 * A single HTTP request may contain related writes. It is committed or rolled
 * back as one database transaction. Never accept SQL/table/column names from
 * the browser. Never read browser storage as an authoritative data source.
 *
 * This is not a substitute for the domain workflows required to post invoices,
 * finalize clinical reports or reconcile physical stock.
 */
import { randomBytes } from 'node:crypto';
import type { Express, Response } from 'express';
import mysql from 'mysql2/promise';
import { MYSQL_TABLES_CONFIG } from '../src/db/mysql-schema';
import { ownEffectiveBranchPermissions } from './branch-user-permissions';
import type { CrudSession } from './mysql-crud-routes';

const models=new Map(MYSQL_TABLES_CONFIG.map(m=>[m.dexieTable,m] as const));

const resources:Record<string,string>={
  patients:'patients',doctors:'doctors',doctorSpecialties:'doctorSpecialties',
  scientificDepartments:'scientificDepartments',sampleTubes:'sampleTubes',
  tests:'tests',testParameters:'testParameters',requests:'requests',
  requestItems:'requests',samples:'samples',results:'results',
  invoices:'invoices',invoiceItems:'invoices',payments:'payments',
  expenses:'expenses',commissions:'commissions',inventoryItems:'inventory',
  inventoryLots:'inventory',stockMovements:'inventory',testBOMs:'inventory',
  stockTakingSessions:'inventory',suppliers:'purchases',
  purchaseInvoices:'purchases',returnNotes:'purchases',
  chartOfAccounts:'accounts',journalEntries:'journalEntries',
  costCenters:'accounts',periodLocks:'erpAccounting',
  cashboxSessions:'cashbox',dailyClosings:'cashbox',employees:'employees',
  microscopyScans:'results',aiImageAnalyses:'results',
  aiRecognitionFindings:'results',aiCorrections:'results',
  criticalValueLogs:'results',cultureResults:'microbiology',
  antibioticsCatalog:'microbiology',qcControlLots:'qualityControl',
  qcRuns:'qualityControl',homeVisits:'homeVisits',
  corporateContracts:'corporateContracts',
  referenceLabPartners:'requests',labToLabDispatches:'requests',
};
type Operation='add'|'edit'|'delete';
type Command={store:string;operation:Operation;id:string;record?:Record<string,unknown>};
const MAX_TX=100;
const MAX_BYTES=2_000_000;
const safeId=(value:unknown):value is string=>
  typeof value==='string' && value.length>0 && value.length<=64 &&
  !/[\x00-\x1f]/.test(value);
const obj=(value:unknown):Record<string,unknown>=>{
  try {
    const parsed:unknown=JSON.parse(String(value||'{}'));
    return parsed && typeof parsed==='object' && !Array.isArray(parsed)?
      parsed as Record<string,unknown>:{};
  }catch{return {};}
};
const forbiddenRecordKeys=/^(?:passwordHash|password|secret|token|accessToken|apiKey)$/i;
function validateCommand(input:unknown):Command{
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new TypeError('INVALID_COMMAND');
  const m=input as Record<string,unknown>;
  const store=String(m.store||'');
  const op=String(m.operation||'');
  if(!models.has(store)||!resources[store]||!safeId(m.id)||
    !['add','edit','delete'].includes(op))throw new TypeError('INVALID_COMMAND');
  if(['patients','users','roles','permissions','settings','auditLogs'].includes(store))
    throw new TypeError('USE_DEDICATED_AUTHORIZED_API');
  if(op!=='delete'){
    const record=m.record;
    if(!record||typeof record!=='object'||Array.isArray(record)||
      (record as Record<string,unknown>).id!==m.id ||
      Object.keys(record).some(k=>forbiddenRecordKeys.test(k)))
      throw new TypeError('INVALID_RECORD');
    return {store,operation:op as Operation,id:m.id,record:record as Record<string,unknown>};
  }
  return {store,operation:'delete',id:m.id};
}
function validateDomain(c:Command,previous:Record<string,unknown>|null):void{
  const r=c.record;
  // Financial/clinical/legal history must never be physically deleted.
  if(c.operation==='delete'){
    if(['invoices','payments','journalEntries','results','commissions','stockMovements',
      'purchaseInvoices','dailyClosings','cashboxSessions','returnNotes','criticalValueLogs',
      'aiImageAnalyses','aiRecognitionFindings','aiCorrections','inventoryLots',
      'testParameters','requestItems','samples','requests'].includes(c.store))
      throw new Error('HISTORY_REQUIRES_REVERSAL_WORKFLOW');
    if(previous?.status==='posted'||previous?.status==='approved')
      throw new Error('HISTORY_REQUIRES_REVERSAL_WORKFLOW');
    return;
  }
  if(!r)throw new TypeError('INVALID_RECORD');
  for(const [key,val] of Object.entries(r)){
    if(typeof val==='number' && !Number.isFinite(val))throw new TypeError('INVALID_NUMBER');
    if(/(?:amount|price|total|tax|cost|qty|quantity|discount|balance|debit|credit)$/i.test(key) &&
      typeof val==='number' && val<0 && key!=='balance')
      throw new TypeError('INVALID_NEGATIVE_AMOUNT');
  }
  if(c.store==='journalEntries'){
    const lines=r.lines;
    if(!Array.isArray(lines)||lines.length<2)throw new TypeError('INVALID_JOURNAL_LINES');
    const sum=(k:'debit'|'credit')=>lines.reduce((total,line)=>{
      if(!line||typeof line!=='object')throw new TypeError('INVALID_JOURNAL_LINES');
      const n=Number((line as Record<string,unknown>)[k]||0);
      if(!Number.isFinite(n)||n<0)throw new TypeError('INVALID_JOURNAL_LINES');
      return total+Math.round(n*100);
    },0);
    const debit=sum('debit'),credit=sum('credit');
    if(debit!==credit||debit===0)throw new Error('UNBALANCED_JOURNAL');
    if(Math.round(Number(r.totalDebit||0)*100)!==debit||
       Math.round(Number(r.totalCredit||0)*100)!==credit)
      throw new Error('JOURNAL_TOTAL_MISMATCH');
  }
  if(c.store==='inventoryLots'){
    if(Number(r.remainingQty||0)>Number(r.receivedQty||r.quantity||0))
      throw new Error('LOT_REMAINING_EXCEEDS_RECEIVED');
  }
  if(c.store==='results'){
    const approved=['approved','released','final'];
    if(previous && approved.includes(String(previous.status||''))
       && JSON.stringify(previous)!==JSON.stringify(r))
      throw new Error('APPROVED_RESULT_REQUIRES_AMENDMENT');
  }
  if(c.store==='invoices' && previous &&
    ['posted','paid','closed'].includes(String(previous.status||'')) &&
    JSON.stringify(previous)!==JSON.stringify(r))
    throw new Error('POSTED_INVOICE_REQUIRES_CREDIT_NOTE');
}
function failure(res:Response,error:unknown):void{
  const message=error instanceof Error?error.message:'MYSQL_OPERATION_FAILED';
  if(message==='FORBIDDEN'||message==='BRANCH_NOT_ASSIGNED')
    res.status(403);
  else if(error instanceof TypeError)
    res.status(400);
  else if(message.endsWith('_NOT_IN_BRANCH')||message.startsWith('HISTORY_')||
    message.startsWith('POSTED_')||message.startsWith('APPROVED_')||
    message.startsWith('UNBALANCED_')||message.startsWith('JOURNAL_')||
    message.startsWith('LOT_')||message==='CONFLICT')
    res.status(409);
  else res.status(503);
  res.json({ok:false,error:message});
}
export function installUnifiedMySQLRoutes(app:Express,connect:()=>Promise<mysql.Connection>):void{
  const principal=(res:Response)=>{
    const s=res.locals.branchSession as CrudSession|undefined;
    if(!s?.branchId||!safeId(s.userId)||!safeId(s.branchId))
      throw new Error('FORBIDDEN');
    return s;
  };
  async function authorize(db:mysql.Connection,s:CrudSession,store:string,action:string){
    const [branches]=await db.execute<mysql.RowDataPacket[]>(
      s.role==='Developer'
       ? 'SELECT id FROM branches WHERE id=? AND active=1'
       : 'SELECT b.id FROM branches b INNER JOIN user_branches ub ON ub.branch_id=b.id WHERE b.id=? AND b.active=1 AND ub.user_id=?',
      s.role==='Developer'?[s.branchId!]:[s.branchId!,s.userId]);
    if(!branches.length)throw new Error('BRANCH_NOT_ASSIGNED');
    const permissions=await ownEffectiveBranchPermissions({
      execute:(sql,params)=>db.execute(sql,params as string[]),
    },s.userId,s.branchId!,s.role);
    const explicit=permissions.find(x=>x.resource===resources[store]);
    const allowed=s.role==='Developer' ||
      (s.role==='Owner' ? (!explicit || explicit.actions[action]===true)
       :explicit?.actions[action]===true);
    if(!allowed)throw new Error('FORBIDDEN');
  }
  app.get('/api/branch-pilot/unified/:store',async(req,res)=>{
    let db:mysql.Connection|undefined;
    try{
      const store=String(req.params.store||''),mapping=models.get(store);
      if(!mapping||!resources[store]||['users','roles','permissions','settings','auditLogs'].includes(store))
        throw new TypeError('INVALID_STORE');
      const session=principal(res);
      db=await connect();
      await authorize(db,session,store,'view');
      const [rows]=await db.execute<mysql.RowDataPacket[]>(
        'SELECT t.* FROM `'+mapping.mysqlTable+'` t INNER JOIN mysql_store_branch_access m '+
        'ON m.store_name=? AND m.record_id=t.id AND m.branch_id=? ORDER BY t.id',
        [store,session.branchId!]);
      res.json({ok:true,source:'mysql',store,records:rows.map(row=>({
        ...obj(row.raw_json),id:String(row.id),
      }))});
    }catch(e){failure(res,e);}
    finally{await db?.end();}
  });
  app.post('/api/branch-pilot/unified/transaction',async(req,res)=>{
    let db:mysql.Connection|undefined;
    try{
      const session=principal(res);
      const commands=req.body?.commands as unknown;
      if(!Array.isArray(commands)||commands.length===0||commands.length>MAX_TX||
        JSON.stringify(commands).length>MAX_BYTES)
        throw new TypeError('INVALID_TRANSACTION');
      const mutations=commands.map(validateCommand);
      const seen=new Set<string>();
      for(const m of mutations){
        const key=m.store+'/'+m.id;
        if(seen.has(key))throw new TypeError('DUPLICATE_TARGET_IN_TRANSACTION');
        seen.add(key);
      }
      db=await connect();
      await db.beginTransaction();
      try{
        const permissions=new Set<string>();
        for(const m of mutations){
          const perm=m.store+':'+m.operation;
          if(!permissions.has(perm)){
            await authorize(db,session,m.store,m.operation);
            permissions.add(perm);
          }
          const mapping=models.get(m.store)!;
          const [found]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT id,raw_json FROM `'+mapping.mysqlTable+'` WHERE id=? FOR UPDATE',[m.id]);
          const old=found[0] as mysql.RowDataPacket|undefined;
          if(m.operation==='add'&&old)throw new Error('CONFLICT');
          if(m.operation!=='add'&&!old)throw new Error('RECORD_NOT_IN_BRANCH');
          if(old){
            const [links]=await db.execute<mysql.RowDataPacket[]>(
              'SELECT branch_id FROM mysql_store_branch_access WHERE store_name=? AND record_id=?',
              [m.store,m.id]);
            if(!links.some(row=>String(row.branch_id)===session.branchId))
              throw new Error('RECORD_NOT_IN_BRANCH');
            if(links.length>1)throw new Error('SHARED_RECORD_REQUIRES_DEDICATED_API');
          }
          const prior=old?obj(old.raw_json):null;
          validateDomain(m,prior);
          let next:Record<string,unknown>|undefined=m.record;
          if(m.operation==='delete'){
            next={...prior,id:m.id,active:false,archived:true};
          }
          const fields=[...mapping.columns.map(x=>x.name),'raw_json'];
          const values=[...mapping.columns.map(x=>x.extract(next!)),JSON.stringify(next)];
          if(m.operation==='add'){
            await db.execute('INSERT INTO `'+mapping.mysqlTable+'` ('+
              fields.map(x=>'`'+x+'`').join(',')+') VALUES ('+
              fields.map(()=>'?').join(',')+')',values);
            await db.execute(
              'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES (?,?,?,NOW(),?)',
              [m.store,m.id,session.branchId!,session.userId]);
          }else if(m.operation==='delete'){
            // Never DELETE clinical, finance or inventory source records.
            const active=mapping.columns.find(x=>x.name==='active');
            await db.execute('UPDATE `'+mapping.mysqlTable+'` SET '+
              (active?'active=0,':'')+'raw_json=? WHERE id=?',
              [JSON.stringify(next),m.id]);
          }else{
            const set=fields.filter(x=>x!=='id');
            const vals=fields.flatMap((x,i)=>x==='id'?[]:[values[i]]);
            await db.execute('UPDATE `'+mapping.mysqlTable+'` SET '+
              set.map(x=>'`'+x+'`=?').join(',')+' WHERE id=?',[...vals,m.id]);
          }
          await db.execute(
            'INSERT INTO tlab_mutation_audit_v10(event_id,resource,record_id,branch_id,actor_id,operation,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())',
            [randomBytes(16).toString('hex'),m.store,m.id,session.branchId!,session.userId,
              m.operation,prior?JSON.stringify(prior):null,next?JSON.stringify(next):null]);
        }
        await db.commit();
      }catch(e){await db.rollback();throw e;}
      res.json({ok:true,source:'mysql',count:mutations.length});
    }catch(e){failure(res,e);}
    finally{await db?.end();}
  });
}
