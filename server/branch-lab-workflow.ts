import { randomBytes } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore, type SecureAction } from './server-permissions';
import { BranchRegistry } from './branch-registry';

const goodId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
const token = () => randomBytes(16).toString('hex');
type RequestRow = RowDataPacket & {
  id: string; branch_id: string; patient_id: string; status: string; version: number;
  request_number: string; created_by: string;
};

export class BranchLabWorkflowStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTables(): Promise<void> {
    const db = await this.connect();
    try {
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_branch_requests (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL, ' +
        'patient_id VARCHAR(64) NOT NULL, request_number VARCHAR(64) NOT NULL, ' +
        'status VARCHAR(32) NOT NULL, version INT NOT NULL DEFAULT 1, ' +
        'created_by VARCHAR(64) NOT NULL, created_at DATETIME NOT NULL, ' +
        'UNIQUE KEY uq_branch_request_no (branch_id, request_number), ' +
        'KEY idx_branch_requests (branch_id,status,id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_branch_request_items (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL, ' +
        'request_id VARCHAR(64) NOT NULL, test_id VARCHAR(64) NOT NULL, ' +
        'price DECIMAL(12,2) NOT NULL, ' +
        'UNIQUE KEY uq_branch_request_test (request_id,test_id),' +
        'KEY idx_branch_test_items (branch_id,request_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_branch_samples (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL, ' +
        'request_id VARCHAR(64) NOT NULL, sample_type VARCHAR(80) NOT NULL, ' +
        'received_by VARCHAR(64) NOT NULL, received_at DATETIME NOT NULL, ' +
        'UNIQUE KEY uq_branch_received_request (branch_id,request_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_branch_lab_audit (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL, ' +
        'request_id VARCHAR(64) NOT NULL, actor_id VARCHAR(64) NOT NULL, ' +
        'action VARCHAR(32) NOT NULL, version INT NOT NULL, created_at DATETIME NOT NULL, ' +
        'KEY idx_branch_request_audit (branch_id,request_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
    } finally { await db.end(); }
  }
  async catalogue() {
    const db = await this.connect();
    try {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT id,code,name_ar,price FROM lab_tests WHERE active=1 ORDER BY id LIMIT 100',
      );
      return rows.map(row=>({
        id:String(row.id),code:String(row.code),name:String(row.name_ar),price:String(row.price),
      }));
    } finally { await db.end(); }
  }
  async list(branchId: string,cursor: string,limit:number) {
    if(!goodId(branchId)||(cursor&&!goodId(cursor))||!Number.isInteger(limit)||limit<1||limit>50) {
      throw new Error('Bad pagination');
    }
    const db=await this.connect();
    try {
      const [rows]=await db.execute<RequestRow[]>(
        'SELECT id,patient_id,request_number,status,version FROM secure_branch_requests ' +
        'WHERE branch_id=? AND id>? ORDER BY id LIMIT ?', [branchId,cursor,limit],
      );
      return {
        items: rows.map(r=>({
          id:r.id,patientId:r.patient_id,requestNumber:r.request_number,
          status:r.status,version:Number(r.version),
        })),
        nextCursor:rows.length===limit?rows[rows.length-1].id:null,
      };
    } finally{await db.end();}
  }
  async create(branchId:string,patientId:unknown,testIds:unknown,actor:ServerIdentity) {
    if(!goodId(branchId)||!goodId(patientId)||!Array.isArray(testIds)||
       testIds.length<1||testIds.length>30||testIds.some(x=>!goodId(x))||
       new Set(testIds).size!==testIds.length)throw Error('Invalid test or patient');
    const db=await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [patient]=await db.execute<RowDataPacket[]>(
          'SELECT id FROM secure_branch_patients WHERE branch_id=? AND id=? AND active=1 FOR UPDATE',
          [branchId,patientId],
        );
        if(patient.length!==1)throw Error('Patient not in branch');
        const tests:{id:string;price:string}[]=[];
        for(const testId of testIds) {
          const [rows]=await db.execute<RowDataPacket[]>(
            'SELECT id,price,active FROM lab_tests WHERE id=? LIMIT 1',[testId],
          );
          if(rows.length!==1||Number(rows[0].active)!==1||
            !Number.isFinite(Number(rows[0].price))||Number(rows[0].price)<0) {
            throw Error('Invalid catalog test');
          }
          tests.push({id:String(testId),price:String(rows[0].price)});
        }
        const id='brreq_'+token(),requestNumber='BR-'+id.slice(-16).toUpperCase();
        await db.execute(
          'INSERT INTO secure_branch_requests ' +
          '(id,branch_id,patient_id,request_number,status,version,created_by,created_at) ' +
          'VALUES (?,?,?,?,?,1,?,NOW())',
          [id,branchId,patientId,requestNumber,'awaiting_sample',actor.userId],
        );
        for(const test of tests) {
          await db.execute(
            'INSERT INTO secure_branch_request_items ' +
            '(id,branch_id,request_id,test_id,price) VALUES (?,?,?,?,?)',
            ['britem_'+token(),branchId,id,test.id,test.price],
          );
        }
        await db.execute(
          'INSERT INTO secure_branch_lab_audit ' +
          '(id,branch_id,request_id,actor_id,action,version,created_at) ' +
          'VALUES (?,?,?,?,?,1,NOW())',
          ['braudit_'+token(),branchId,id,actor.userId,'create_request'],
        );
        await db.commit();
        return {id,branchId,patientId,requestNumber,status:'awaiting_sample' as const,
          version:1,items:tests};
      }catch(error){await db.rollback();throw error;}
    }finally{await db.end();}
  }
  async receive(branchId:string,requestId:string,expectedVersion:unknown,sampleType:unknown,
    actor:ServerIdentity) {
    if(!goodId(branchId)||!goodId(requestId)||!Number.isInteger(expectedVersion)||
       (expectedVersion as number)<1||typeof sampleType!=='string'||
       !/^[A-Za-z0-9 _-]{1,80}$/.test(sampleType))throw Error('Invalid specimen');
    const db=await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [requests]=await db.execute<RequestRow[]>(
          'SELECT id,patient_id,status,version FROM secure_branch_requests ' +
          'WHERE id=? AND branch_id=? FOR UPDATE',[requestId,branchId],
        );
        if(requests.length!==1){await db.rollback();return {status:'not_found' as const};}
        const row=requests[0];
        if(Number(row.version)!==expectedVersion){
          await db.rollback();return {status:'conflict' as const,version:Number(row.version)};
        }
        if(row.status!=='awaiting_sample'){
          await db.rollback();return {status:'invalid_state' as const};
        }
        const sampleId='brsample_'+token();
        await db.execute(
          'INSERT INTO secure_branch_samples ' +
          '(id,branch_id,request_id,sample_type,received_by,received_at) ' +
          'VALUES (?,?,?,?,?,NOW())',
          [sampleId,branchId,requestId,sampleType,actor.userId],
        );
        await db.execute(
          'UPDATE secure_branch_requests SET status=?,version=version+1 WHERE branch_id=? AND id=?',
          ['sample_received',branchId,requestId],
        );
        await db.execute(
          'INSERT INTO secure_branch_lab_audit ' +
          '(id,branch_id,request_id,actor_id,action,version,created_at) ' +
          'VALUES (?,?,?,?,?,?,NOW())',
          ['braudit_'+token(),branchId,requestId,actor.userId,'sample_received',Number(row.version)+1],
        );
        await db.commit();
        return {status:'ok' as const,sampleId,requestVersion:Number(row.version)+1};
      }catch(error){await db.rollback();throw error;}
    }finally{await db.end();}
  }
}
export function installBranchLabWorkflowRoutes(app:Express,workflow:BranchLabWorkflowStore,
  branches:BranchRegistry,permissions:ServerPermissionStore,identity:IdentityResolver):void {
  const guard=(resource:string,action:SecureAction,
    handler:(req:Request,res:Response,actor:ServerIdentity)=>Promise<void>)=>
    async(req:Request,res:Response)=>{
      const actor=await identity(req);
      if(!actor)return res.status(401).json({ok:false});
      if(process.env.TLAB_MULTIBRANCH_MODE!=='true')
        return res.status(503).json({ok:false,error:'Multi-branch mode not activated'});
      try{
        if(!(await permissions.can(actor.role,resource,action)))
          return res.status(403).json({ok:false});
        if(!(await branches.isAllowed(actor,req.params.branchId)))
          return res.status(404).json({ok:false});
        await handler(req,res,actor);
      }catch{
        return res.status(503).json({ok:false,error:'Branch-scoped laboratory operation unavailable'});
      }
    };
  app.get('/api/v3/branches/:branchId/catalogue',guard('requests','view',async(_req,res)=>{
    res.json({ok:true,items:await workflow.catalogue()});
  }));
  app.get('/api/v3/branches/:branchId/requests',guard('requests','view',async(req,res)=>{
    const cursor=typeof req.query.cursor==='string'?req.query.cursor:'';
    const limit=req.query.limit===undefined?30:Number(req.query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>50||(cursor&&!goodId(cursor))){
      res.status(400).json({ok:false});return;
    }
    res.json({ok:true,...await workflow.list(req.params.branchId,cursor,limit)});
  }));
  app.post('/api/v3/branches/:branchId/requests',guard('requests','add',async(req,res,actor)=>{
    try{
      if(Object.keys(req.body||{}).sort().join(',')!=='patientId,testIds')
        throw Error('Unexpected request');
      const record=await workflow.create(req.params.branchId,req.body.patientId,req.body.testIds,actor);
      res.status(201).json({ok:true,request:record});
    }catch{res.status(422).json({ok:false,error:'Patient or catalogue not valid for selected branch'});}
  }));
  app.post('/api/v3/branches/:branchId/requests/:id/receive',guard('samples','add',async(req,res,actor)=>{
    try{
      if(Object.keys(req.body||{}).sort().join(',')!=='sampleType,version')throw Error('Unexpected fields');
      const result=await workflow.receive(req.params.branchId,req.params.id,
        req.body.version,req.body.sampleType,actor);
      if(result.status==='not_found'){res.status(404).json({ok:false});return;}
      if(result.status==='conflict'){res.status(409).json({ok:false,...result});return;}
      if(result.status==='invalid_state'){res.status(409).json({ok:false});return;}
      res.json({ok:true,...result});
    }catch{res.status(422).json({ok:false,error:'Invalid or duplicate specimen'});}
  }));
}
