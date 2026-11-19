import {randomBytes} from 'node:crypto';
import type {Express,Request,Response} from 'express';
import type {Connection,RowDataPacket} from 'mysql2/promise';
import type {IdentityResolver,ServerIdentity} from './patient-domain';
import {BranchRegistry} from './branch-registry';
import {ServerPermissionStore} from './server-permissions';

const valid=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v);
const keyValid=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(v);
const token=()=>randomBytes(16).toString('hex');
function quantityMilli(v:unknown){
  const s=String(v);
  if(!/^(0|[1-9]\d{0,7})(?:\.\d{1,3})?$/.test(s))throw Error('Invalid quantity');
  const [whole,fraction='']=s.split('.');
  const n=Number(whole)*1000+Number((fraction+'000').slice(0,3));
  if(!Number.isSafeInteger(n)||n<1||n>10000000000)throw Error('Invalid amount');
  return n;
}
type BalanceRow=RowDataPacket&{quantity_milli:number|string};
type TransferRow=RowDataPacket&{
  id:string;from_branch:string;to_branch:string;item_id:string;
  lot_code:string;quantity_milli:number|string;status:string;initiated_by:string;
  idempotency_key:string;
};
export class BranchStockTransferPilotStore {
  constructor(private readonly connect:()=>Promise<Connection>){}
  async ensureTables(){
    const db=await this.connect();
    try {
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_demo_stock ('+
        'branch_id VARCHAR(40) NOT NULL,item_id VARCHAR(64) NOT NULL,'+
        'lot_code VARCHAR(64) NOT NULL,quantity_milli BIGINT NOT NULL DEFAULT 0,'+
        'PRIMARY KEY(branch_id,item_id,lot_code)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
      await db.query('CREATE TABLE IF NOT EXISTS secure_branch_demo_transfers ('+
        'id VARCHAR(64) NOT NULL PRIMARY KEY,from_branch VARCHAR(40) NOT NULL,'+
        'to_branch VARCHAR(40) NOT NULL,item_id VARCHAR(64) NOT NULL,'+
        'lot_code VARCHAR(64) NOT NULL,quantity_milli BIGINT NOT NULL,'+
        'status VARCHAR(32) NOT NULL,initiated_by VARCHAR(64) NOT NULL,'+
        'received_by VARCHAR(64) NULL,idempotency_key VARCHAR(100) NOT NULL,'+
        'created_at DATETIME NOT NULL,received_at DATETIME NULL,'+
        'UNIQUE KEY uq_demo_transfer_key (from_branch,idempotency_key),'+
        'KEY idx_demo_transfer_origin (from_branch,status),'+
        'KEY idx_demo_transfer_dest (to_branch,status)'+
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
    }finally{await db.end();}
  }
  async seedSynthetic(branchId:string,itemId:string,lotCode:string,qty:unknown){
    if(!valid(branchId)||!valid(itemId)||!valid(lotCode))throw Error('Bad stock identities');
    const amount=quantityMilli(qty);
    const db=await this.connect();
    try {
      const [item]=await db.execute<RowDataPacket[]>(
        'SELECT id FROM inventory_items WHERE id=? AND active=1 LIMIT 1',[itemId]);
      if(item.length!==1)throw Error('Item not in shared catalog');
      await db.execute('INSERT INTO secure_branch_demo_stock '+
        '(branch_id,item_id,lot_code,quantity_milli) VALUES (?,?,?,?)',
        [branchId,itemId,lotCode,amount]);
      return {branchId,itemId,lotCode,quantityMilli:amount,demoOnly:true};
    }finally{await db.end();}
  }
  async initiate(from:string,to:string,item:string,lot:string,qty:unknown,key:string,actorId:string) {
    if(!valid(from)||!valid(to)||from===to||!valid(item)||!valid(lot)||!valid(actorId)||!keyValid(key))
      throw Error('Invalid transfer');
    const amount=quantityMilli(qty);
    const db=await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [existing]=await db.execute<TransferRow[]>(
          'SELECT id,from_branch,to_branch,item_id,lot_code,quantity_milli,initiated_by '+
          'FROM secure_branch_demo_transfers WHERE from_branch=? AND idempotency_key=? FOR UPDATE',
          [from,key]);
        if(existing.length){
          const prior=existing[0];
          if(prior.to_branch!==to||prior.item_id!==item||prior.lot_code!==lot||
            Number(prior.quantity_milli)!==amount||prior.initiated_by!==actorId)
            throw Error('Idempotency conflict');
          await db.commit();
          return {transferId:prior.id,replayed:true,status:'in_transit' as const,demoOnly:true};
        }
        const [stock]=await db.execute<BalanceRow[]>(
          'SELECT quantity_milli FROM secure_branch_demo_stock '+
          'WHERE branch_id=? AND item_id=? AND lot_code=? FOR UPDATE',[from,item,lot]);
        if(stock.length!==1||Number(stock[0].quantity_milli)<amount)throw Error('Insufficient stock');
        const [dest]=await db.execute<RowDataPacket[]>(
          'SELECT id FROM secure_lab_branches WHERE id=? AND active=1 LIMIT 1',[to]);
        if(dest.length!==1)throw Error('Inactive destination');
        await db.execute('UPDATE secure_branch_demo_stock '+
          'SET quantity_milli=quantity_milli-? WHERE branch_id=? AND item_id=? AND lot_code=?',
          [amount,from,item,lot]);
        const transferId='brtransfer_'+token();
        await db.execute('INSERT INTO secure_branch_demo_transfers '+
          '(id,from_branch,to_branch,item_id,lot_code,quantity_milli,status,initiated_by,'+
          'idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())',
          [transferId,from,to,item,lot,amount,'in_transit',actorId,key]);
        await db.commit();
        return {transferId,replayed:false,status:'in_transit' as const,demoOnly:true};
      }catch(e){await db.rollback();throw e;}
    }finally{await db.end();}
  }
  async receive(transferId:string,destBranch:string,actorId:string) {
    if(!valid(transferId)||!valid(destBranch)||!valid(actorId))throw Error('Invalid transfer');
    const db=await this.connect();
    try {
      await db.beginTransaction();
      try{
        const [rows]=await db.execute<TransferRow[]>(
          'SELECT id,from_branch,to_branch,item_id,lot_code,quantity_milli,status,initiated_by '+
          'FROM secure_branch_demo_transfers WHERE id=? AND to_branch=? FOR UPDATE',
          [transferId,destBranch]);
        if(rows.length!==1){await db.rollback();return {status:'not_found' as const};}
        const transfer=rows[0];
        if(transfer.initiated_by===actorId){await db.rollback();return {status:'same_actor' as const};}
        if(transfer.status!=='in_transit'){await db.rollback();return {status:'already_processed' as const};}
        await db.execute('INSERT INTO secure_branch_demo_stock '+
          '(branch_id,item_id,lot_code,quantity_milli) VALUES (?,?,?,?) '+
          'ON DUPLICATE KEY UPDATE quantity_milli=quantity_milli+VALUES(quantity_milli)',
          [destBranch,transfer.item_id,transfer.lot_code,Number(transfer.quantity_milli)]);
        await db.execute('UPDATE secure_branch_demo_transfers '+
          'SET status=?,received_by=?,received_at=NOW() WHERE id=? AND to_branch=?',
          ['received',actorId,transferId,destBranch]);
        await db.commit();
        return {status:'received' as const,demoOnly:true};
      }catch(e){await db.rollback();throw e;}
    }finally{await db.end();}
  }
  async levels(branchId:string){
    const db=await this.connect();
    try{
      const [rows]=await db.execute<RowDataPacket[]>(
        'SELECT item_id,lot_code,quantity_milli FROM secure_branch_demo_stock '+
        'WHERE branch_id=? ORDER BY item_id,lot_code LIMIT 100',[branchId]);
      return rows.map(row=>({itemId:String(row.item_id),lotCode:String(row.lot_code),
        quantityMilli:Number(row.quantity_milli)}));
    }finally{await db.end();}
  }
}
export function installBranchStockTransferPilotRoutes(app:Express,stock:BranchStockTransferPilotStore,
  branches:BranchRegistry,grants:ServerPermissionStore,identity:IdentityResolver) {
  const secure=(handler:(req:Request,res:Response,actor:ServerIdentity)=>Promise<void>)=>
    async(req:Request,res:Response)=>{
      const actor=await identity(req);if(!actor)return res.status(401).json({ok:false});
      if(process.env.TLAB_MULTIBRANCH_MODE!=='true')return res.status(503).json({ok:false});
      try{
        if(!(await branches.isAllowed(actor,req.params.branchId)))return res.status(404).json({ok:false});
        await handler(req,res,actor);
      }catch{return res.status(503).json({ok:false});}
    };
  app.get('/api/v3/branches/:branchId/demo-stock',secure(async(req,res,actor)=>{
    if(!(await grants.can(actor.role,'inventoryMovements','view')))
      {res.status(403).json({ok:false});return;}
    res.json({ok:true,demoOnly:true,levels:await stock.levels(req.params.branchId)});
  }));
  app.post('/api/v3/branches/:branchId/demo-stock/bootstrap',secure(async(req,res,actor)=>{
    if(actor.role!=='Developer'||process.env.TLAB_ENABLE_DEMO_STOCK!=='true'||
       !/_(test|demo)$/.test(process.env.MYSQL_DATABASE||'')){
      res.status(403).json({ok:false});return;
    }
    try{
      if(Object.keys(req.body||{}).sort().join(',')!=='itemId,lotCode,quantity')
        throw Error('Unexpected fields');
      res.status(201).json({ok:true,
        level:await stock.seedSynthetic(req.params.branchId,req.body.itemId,
          req.body.lotCode,req.body.quantity)});
    }catch{res.status(422).json({ok:false});}
  }));
  app.post('/api/v3/branches/:branchId/demo-stock/transfers',secure(async(req,res,actor)=>{
    if(!['Chemist','Owner'].includes(actor.role)||
       !(await grants.can(actor.role,'inventoryMovements','add'))) {
      res.status(403).json({ok:false});return;
    }
    try{
      if(Object.keys(req.body||{}).sort().join(',')!=='idempotencyKey,itemId,lotCode,quantity,toBranchId')
        throw Error('Unexpected fields');
      const outcome=await stock.initiate(req.params.branchId,req.body.toBranchId,
        req.body.itemId,req.body.lotCode,req.body.quantity,req.body.idempotencyKey,actor.userId);
      res.status(outcome.replayed?200:201).json({ok:true,...outcome});
    }catch{res.status(409).json({ok:false,error:'Demo stock transfer unavailable or insufficient'});}
  }));
  app.post('/api/v3/branches/:branchId/demo-stock/transfers/:id/receive',secure(async(req,res,actor)=>{
    if(!['Chemist','Owner'].includes(actor.role)||
       !(await grants.can(actor.role,'inventoryMovements','add'))) {
      res.status(403).json({ok:false});return;
    }
    try{
      const outcome=await stock.receive(req.params.id,req.params.branchId,actor.userId);
      if(outcome.status==='not_found'){res.status(404).json({ok:false});return;}
      if(outcome.status==='same_actor'){res.status(403).json({ok:false});return;}
      if(outcome.status==='already_processed'){res.status(409).json({ok:false});return;}
      res.json({ok:true,...outcome});
    }catch{res.status(422).json({ok:false});}
  }));
}
