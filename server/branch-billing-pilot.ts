import {createHash,randomBytes} from 'node:crypto';
import type {Connection,RowDataPacket} from 'mysql2/promise';
import type {Express,Request,Response} from 'express';
import type {IdentityResolver,ServerIdentity} from './patient-domain';
import {BranchRegistry} from './branch-registry';
import {ServerPermissionStore} from './server-permissions';

const idOk=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(s);
const keyOk=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(s);
const uid=()=>randomBytes(16).toString('hex');
function toMinor(v:unknown) {
  const s=String(v);
  if(!/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(s))throw Error('Invalid amount');
  const [whole,frac='']=s.split('.');
  const amount=Number(whole)*100+Number((frac+'00').slice(0,2));
  if(!Number.isSafeInteger(amount)||amount>10000000000)throw Error('Out of range');
  return amount;
}
type InvoiceRow=RowDataPacket&{
  id:string;amount_minor:number|string;paid_minor:number|string;version:number;branch_id:string;
};
type PaymentRow=RowDataPacket&{
  id:string;invoice_id:string;amount_minor:number|string;content_digest:string;actor_id:string;
};
export class BranchBillingPilotStore {
  constructor(private readonly connect:()=>Promise<Connection>){}
  async ensureTables() {
    const db=await this.connect();
    try {
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_invoice_drafts ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY, branch_id VARCHAR(40) NOT NULL,'+
        'request_id VARCHAR(64) NOT NULL, amount_minor BIGINT NOT NULL,'+
        'paid_minor BIGINT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1,'+
        'created_by VARCHAR(64) NOT NULL,created_at DATETIME NOT NULL,'+
        'UNIQUE KEY uq_branch_invoice_request (branch_id,request_id),'+
        'KEY idx_branch_invoice_list (branch_id,id)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_mock_payments ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY,branch_id VARCHAR(40) NOT NULL,'+
        'invoice_id VARCHAR(64) NOT NULL,amount_minor BIGINT NOT NULL,'+
        'idempotency_key VARCHAR(100) NOT NULL,content_digest CHAR(64) NOT NULL,'+
        'actor_id VARCHAR(64) NOT NULL,created_at DATETIME NOT NULL,'+
        'UNIQUE KEY uq_branch_mock_payment_key (branch_id,idempotency_key),'+
        'KEY idx_branch_mock_payment_invoice (branch_id,invoice_id)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_billing_audit ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY,branch_id VARCHAR(40) NOT NULL,'+
        'invoice_id VARCHAR(64) NOT NULL,actor_id VARCHAR(64) NOT NULL,'+
        'operation VARCHAR(32) NOT NULL,created_at DATETIME NOT NULL,'+
        'KEY idx_branch_billing_audit (branch_id,invoice_id)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
    }finally{await db.end();}
  }
  async draft(branchId:string,requestId:string,actorId:string) {
    if(!idOk(branchId)||!idOk(requestId)||!idOk(actorId))throw Error('Bad identifiers');
    const db=await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [req]=await db.execute<RowDataPacket[]>(
          'SELECT id FROM secure_branch_requests WHERE branch_id=? AND id=? FOR UPDATE',
          [branchId,requestId]);
        if(req.length!==1)throw Error('Request does not belong to branch');
        const [lines]=await db.execute<RowDataPacket[]>(
          'SELECT price FROM secure_branch_request_items WHERE branch_id=? AND request_id=?',
          [branchId,requestId]);
        if(!lines.length)throw Error('No ordered lines');
        const total=lines.reduce((sum,row)=>sum+toMinor(row.price),0);
        if(!Number.isSafeInteger(total)||total>10000000000)throw Error('Total overflow');
        const id='brinv_'+uid();
        await db.execute(
          'INSERT INTO secure_branch_invoice_drafts '+
          '(id,branch_id,request_id,amount_minor,paid_minor,version,created_by,created_at) '+
          'VALUES (?,?,?,?,0,1,?,NOW())',
          [id,branchId,requestId,total,actorId]);
        await db.execute(
          'INSERT INTO secure_branch_billing_audit '+
          '(id,branch_id,invoice_id,actor_id,operation,created_at) VALUES (?,?,?,?,?,NOW())',
          ['brbill_'+uid(),branchId,id,actorId,'mock_draft_created']);
        await db.commit();
        return {id,branchId,requestId,amountMinor:total,paidMinor:0,
          officialInvoice:false,legalPaymentReceipt:false};
      }catch(error){await db.rollback();throw error;}
    }finally{await db.end();}
  }
  async mockCollect(branchId:string,invoiceId:string,amountText:unknown,key:string,actorId:string){
    if(!idOk(branchId)||!idOk(invoiceId)||!idOk(actorId)||!keyOk(key))throw Error('Invalid payment');
    const amount=toMinor(amountText);
    if(amount<=0)throw Error('Amount must be positive');
    const digest=createHash('sha256').update(JSON.stringify([invoiceId,amount])).digest('hex');
    const db=await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [replays]=await db.execute<PaymentRow[]>(
          'SELECT id,invoice_id,amount_minor,content_digest,actor_id '+
          'FROM secure_branch_mock_payments WHERE branch_id=? AND idempotency_key=? FOR UPDATE',
          [branchId,key]);
        if(replays.length) {
          const existing=replays[0];
          if(existing.invoice_id!==invoiceId||Number(existing.amount_minor)!==amount||
             existing.content_digest!==digest||existing.actor_id!==actorId)
            throw Error('Idempotency conflict');
          await db.commit();
          return {paymentId:existing.id,replayed:true,officialReceipt:false};
        }
        const [invoices]=await db.execute<InvoiceRow[]>(
          'SELECT id,branch_id,amount_minor,paid_minor,version FROM secure_branch_invoice_drafts '+
          'WHERE branch_id=? AND id=? FOR UPDATE',[branchId,invoiceId]);
        if(invoices.length!==1)throw Error('Invoice draft not in branch');
        const invoice=invoices[0];
        if(Number(invoice.paid_minor)+amount>Number(invoice.amount_minor))
          throw Error('Overpayment refused');
        const paymentId='brpay_'+uid();
        await db.execute('INSERT INTO secure_branch_mock_payments '+
          '(id,branch_id,invoice_id,amount_minor,idempotency_key,content_digest,actor_id,created_at) '+
          'VALUES (?,?,?,?,?,?,?,NOW())',
          [paymentId,branchId,invoiceId,amount,key,digest,actorId]);
        await db.execute('UPDATE secure_branch_invoice_drafts '+
          'SET paid_minor=paid_minor+?,version=version+1 WHERE branch_id=? AND id=?',
          [amount,branchId,invoiceId]);
        await db.execute('INSERT INTO secure_branch_billing_audit '+
          '(id,branch_id,invoice_id,actor_id,operation,created_at) VALUES (?,?,?,?,?,NOW())',
          ['brbill_'+uid(),branchId,invoiceId,actorId,'mock_collection']);
        await db.commit();
        return {paymentId,replayed:false,officialReceipt:false};
      }catch(error){await db.rollback();throw error;}
    }finally{await db.end();}
  }
  async list(branchId:string){
    const db=await this.connect();
    try {
      const [rows]=await db.execute<InvoiceRow[]>(
        'SELECT id,branch_id,request_id,amount_minor,paid_minor,version '+
        'FROM secure_branch_invoice_drafts WHERE branch_id=? ORDER BY id LIMIT 100',
        [branchId]);
      return rows.map(row=>({
        id:row.id,requestId:String(row.request_id),
        totalMinor:Number(row.amount_minor),paidMinor:Number(row.paid_minor),
        remainingMinor:Number(row.amount_minor)-Number(row.paid_minor),
        version:Number(row.version),officialInvoice:false,
      }));
    }finally{await db.end();}
  }
}

export function installBranchBillingPilotRoutes(app:Express,store:BranchBillingPilotStore,
  branches:BranchRegistry,permissions:ServerPermissionStore,identity:IdentityResolver) {
  const guard=(action:'view'|'add',fn:(req:Request,res:Response,actor:ServerIdentity)=>Promise<void>)=>
    async(req:Request,res:Response)=>{
      const actor=await identity(req);if(!actor)return res.status(401).json({ok:false});
      if(process.env.TLAB_MULTIBRANCH_MODE!=='true')return res.status(503).json({ok:false});
      try {
        if(!(await permissions.can(actor.role,'invoiceDrafts',action)))
          return res.status(403).json({ok:false});
        if(!(await branches.isAllowed(actor,req.params.branchId)))
          return res.status(404).json({ok:false});
        await fn(req,res,actor);
      }catch{return res.status(503).json({ok:false});}
    };
  app.post('/api/v3/branches/:branchId/billing/drafts',guard('add',async(req,res,actor)=>{
    try {
      if(Object.keys(req.body||{}).join(',')!=='requestId')throw Error('Unexpected request');
      res.status(201).json({ok:true,draft:await store.draft(req.params.branchId,req.body.requestId,actor.userId)});
    }catch{res.status(422).json({ok:false,error:'Invalid request or draft already exists'});}
  }));
  app.get('/api/v3/branches/:branchId/billing/drafts',guard('view',async(req,res)=>{
    res.json({ok:true,drafts:await store.list(req.params.branchId),nonOfficial:true});
  }));
  app.post('/api/v3/branches/:branchId/billing/mock-payments',guard('add',async(req,res,actor)=>{
    if(!['Accountant','Owner'].includes(actor.role)){res.status(403).json({ok:false});return;}
    try{
      if(Object.keys(req.body||{}).sort().join(',')!=='amount,idempotencyKey,invoiceId')
        throw Error('Unexpected body');
      const payment=await store.mockCollect(req.params.branchId,req.body.invoiceId,
        req.body.amount,req.body.idempotencyKey,actor.userId);
      res.status(payment.replayed?200:201).json({ok:true,payment,officialReceipt:false});
    }catch{res.status(409).json({ok:false,error:'Mock payment invalid or exceeds draft total'});}
  }));
}
