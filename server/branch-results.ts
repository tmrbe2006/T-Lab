import { randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { BranchRegistry } from './branch-registry';
import { ServerPermissionStore } from './server-permissions';

const validId=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(s);
const uid=()=>randomBytes(16).toString('hex');
type ResultRow=RowDataPacket&{id:string;entered_by:string;status:string;version:number};
type InputValue={parameterId:string;value:string};
function checkedValues(body:unknown):InputValue[]{
  if(!Array.isArray(body)||body.length<1||body.length>60)throw Error('Invalid parameter count');
  if(body.some(row=>!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).sort().join(',')!=='parameterId,value'||
    !validId(row.parameterId)||typeof row.value!=='string'||row.value.length>120||
    !row.value.trim()||/[\u0000-\u001f]/.test(row.value)))throw Error('Invalid result');
  const ids=body.map(row=>row.parameterId);
  if(new Set(ids).size!==ids.length)throw Error('Duplicate parameter');
  return body as InputValue[];
}

export class BranchPreliminaryResultsStore {
  constructor(private readonly connect:()=>Promise<Connection>){}
  async ensureTables() {
    const db=await this.connect();
    try{
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_result_drafts ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL,'+
        'request_id VARCHAR(64) NOT NULL, test_id VARCHAR(64) NOT NULL,'+
        'status VARCHAR(32) NOT NULL, version INT NOT NULL DEFAULT 1,'+
        'entered_by VARCHAR(64) NOT NULL, reviewer_id VARCHAR(64) NULL,'+
        'reviewed_at DATETIME NULL, created_at DATETIME NOT NULL,'+
        'UNIQUE KEY uq_branch_draft_test (branch_id,request_id,test_id),'+
        'KEY idx_branch_result_request (branch_id,request_id)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_result_values ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL,'+
        'draft_id VARCHAR(64) NOT NULL, parameter_id VARCHAR(64) NOT NULL,'+
        'result_text VARCHAR(120) NOT NULL,'+
        'UNIQUE KEY uq_branch_draft_parameter (draft_id,parameter_id),'+
        'KEY idx_branch_result_values (branch_id,draft_id)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_result_review_audit ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL,'+
        'draft_id VARCHAR(64) NOT NULL, actor_id VARCHAR(64) NOT NULL,'+
        'operation VARCHAR(32) NOT NULL, version INT NOT NULL, created_at DATETIME NOT NULL,'+
        'KEY idx_branch_result_audit (branch_id,draft_id)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
    }finally{await db.end();}
  }
  async create(branchId:string,requestId:string,testId:string,body:unknown,actor:ServerIdentity){
    if(!validId(branchId)||!validId(requestId)||!validId(testId))throw Error('Invalid ID');
    const values=checkedValues(body);
    const db=await this.connect();
    try{
      await db.beginTransaction();
      try{
        const [request]=await db.execute<RowDataPacket[]>(
          'SELECT id,status FROM secure_branch_requests WHERE branch_id=? AND id=? FOR UPDATE',
          [branchId,requestId]);
        if(request.length!==1||String(request[0].status)!=='sample_received')throw Error('Specimen not received');
        const [test]=await db.execute<RowDataPacket[]>(
          'SELECT id FROM secure_branch_request_items WHERE branch_id=? AND request_id=? AND test_id=?',
          [branchId,requestId,testId]);
        if(test.length!==1)throw Error('Test not ordered in this branch');
        for(const value of values){
          const [param]=await db.execute<RowDataPacket[]>(
            'SELECT id FROM test_parameters WHERE id=? AND test_id=? AND active=1 AND is_calculated=0 LIMIT 1',
            [value.parameterId,testId]);
          if(param.length!==1)throw Error('Parameter not in requested test');
        }
        const id='brresult_'+uid();
        await db.execute(
          'INSERT INTO secure_branch_result_drafts '+
          '(id,branch_id,request_id,test_id,status,version,entered_by,created_at) '+
          'VALUES (?,?,?,?,?,1,?,NOW())',
          [id,branchId,requestId,testId,'awaiting_internal_review',actor.userId]);
        for(const value of values){
          await db.execute(
            'INSERT INTO secure_branch_result_values '+
            '(id,branch_id,draft_id,parameter_id,result_text) VALUES (?,?,?,?,?)',
            ['brval_'+uid(),branchId,id,value.parameterId,value.value.trim()]);
        }
        await db.execute(
          'INSERT INTO secure_branch_result_review_audit '+
          '(id,branch_id,draft_id,actor_id,operation,version,created_at) '+
          'VALUES (?,?,?,?,?,1,NOW())',
          ['brrev_'+uid(),branchId,id,actor.userId,'draft_entered']);
        await db.commit();
        return {id,branchId,requestId,testId,status:'awaiting_internal_review',version:1,
          clinicallyApproved:false,reportIssued:false};
      }catch(error){await db.rollback();throw error;}
    }finally{await db.end();}
  }
  async review(branchId:string,draftId:string,version:unknown,decision:unknown,actor:ServerIdentity) {
    if(!validId(branchId)||!validId(draftId)||!Number.isInteger(version)||
       (version as number)<1||!['accept','reject'].includes(String(decision))){
      throw Error('Invalid review');
    }
    const db=await this.connect();
    try{
      await db.beginTransaction();
      try{
        const [rows]=await db.execute<ResultRow[]>(
          'SELECT id,entered_by,status,version FROM secure_branch_result_drafts '+
          'WHERE branch_id=? AND id=? FOR UPDATE',[branchId,draftId]);
        if(rows.length!==1){await db.rollback();return {status:'not_found' as const};}
        const row=rows[0];
        if(row.entered_by===actor.userId){await db.rollback();return {status:'same_actor' as const};}
        if(Number(row.version)!==version){await db.rollback();return {status:'conflict' as const};}
        if(row.status!=='awaiting_internal_review'){await db.rollback();return {status:'invalid_state' as const};}
        const next=Number(row.version)+1;
        const newStatus=decision==='accept'?'internally_reviewed':'requires_repeat';
        await db.execute(
          'UPDATE secure_branch_result_drafts SET status=?,version=?,reviewer_id=?,reviewed_at=NOW() '+
          'WHERE branch_id=? AND id=? AND version=?',
          [newStatus,next,actor.userId,branchId,draftId,version]);
        await db.execute(
          'INSERT INTO secure_branch_result_review_audit '+
          '(id,branch_id,draft_id,actor_id,operation,version,created_at) '+
          'VALUES (?,?,?,?,?,?,NOW())',
          ['brrev_'+uid(),branchId,draftId,actor.userId,newStatus,next]);
        await db.commit();
        return {status:'ok' as const,state:newStatus,version:next,
          clinicallyApproved:false as const,reportIssued:false as const};
      }catch(error){await db.rollback();throw error;}
    }finally{await db.end();}
  }
  async list(branchId:string,requestId:string){
    const db=await this.connect();
    try{
      const [rows]=await db.execute<RowDataPacket[]>(
        'SELECT id,test_id,status,version,entered_by,reviewer_id FROM secure_branch_result_drafts '+
        'WHERE branch_id=? AND request_id=? ORDER BY id LIMIT 60',[branchId,requestId]);
      return rows.map(row=>({
        id:String(row.id),testId:String(row.test_id),status:String(row.status),
        version:Number(row.version),enteredBy:String(row.entered_by),
        reviewerId:row.reviewer_id?String(row.reviewer_id):null,
        clinicallyApproved:false,reportIssued:false,
      }));
    }finally{await db.end();}
  }
}
export function installBranchResultRoutes(app:Express,store:BranchPreliminaryResultsStore,
  branches:BranchRegistry,permissions:ServerPermissionStore,identity:IdentityResolver){
  const guard=(action:'view'|'add'|'edit',handler:
    (req:Request,res:Response,actor:ServerIdentity)=>Promise<void>)=>
    async(req:Request,res:Response)=>{
      const actor=await identity(req);if(!actor)return res.status(401).json({ok:false});
      if(process.env.TLAB_MULTIBRANCH_MODE!=='true')return res.status(503).json({ok:false});
      try{
        if(!(await permissions.can(actor.role,'results',action)))return res.status(403).json({ok:false});
        if(!(await branches.isAllowed(actor,req.params.branchId)))return res.status(404).json({ok:false});
        await handler(req,res,actor);
      }catch{return res.status(503).json({ok:false});}
    };
  app.post('/api/v3/branches/:branchId/requests/:requestId/results/drafts',
    guard('add',async(req,res,actor)=>{
      try{
        if(Object.keys(req.body||{}).sort().join(',')!=='testId,values')
          throw Error('Unexpected body');
        const draft=await store.create(req.params.branchId,req.params.requestId,
          req.body.testId,req.body.values,actor);
        res.status(201).json({ok:true,draft});
      }catch{res.status(422).json({ok:false,error:'Result parameters or specimen invalid'});}
    }));
  app.get('/api/v3/branches/:branchId/requests/:requestId/results/drafts',
    guard('view',async(req,res)=>{
      if(!validId(req.params.requestId)){res.status(400).json({ok:false});return;}
      res.json({ok:true,drafts:await store.list(req.params.branchId,req.params.requestId)});
    }));
  app.post('/api/v3/branches/:branchId/results/drafts/:id/review',
    guard('edit',async(req,res,actor)=>{
      // Independent qualified Chemist/Owner review; no medical approval or issued report.
      if(!['Chemist','Owner'].includes(actor.role)){res.status(403).json({ok:false});return;}
      try{
        if(Object.keys(req.body||{}).sort().join(',')!=='decision,version')
          throw Error('Unexpected body');
        const outcome=await store.review(req.params.branchId,req.params.id,
          req.body.version,req.body.decision,actor);
        if(outcome.status==='not_found'){res.status(404).json({ok:false});return;}
        if(outcome.status==='same_actor'){res.status(403).json({ok:false});return;}
        if(outcome.status==='conflict'||outcome.status==='invalid_state'){
          res.status(409).json({ok:false});return;
        }
        res.json({ok:true,...outcome});
      }catch{res.status(422).json({ok:false});}
    }));
}
