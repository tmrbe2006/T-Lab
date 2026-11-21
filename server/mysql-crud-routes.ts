import { randomBytes, scryptSync } from 'node:crypto';
import type { Express, Response } from 'express';
import mysql from 'mysql2/promise';
import { MYSQL_TABLES_CONFIG } from '../src/db/mysql-schema';
import { ownBranchPermissions } from './branch-user-permissions';

export interface CrudSession {
  userId:string; role:string; username:string; branchId?:string;
}
type Conn=mysql.Connection;
type Action='view'|'add'|'edit'|'delete';
const stores:Record<string,{resource:string;active:boolean}>={
  corporateContracts:{resource:'corporateContracts',active:true},
  cultureResults:{resource:'microbiology',active:false},
  antibioticsCatalog:{resource:'microbiology',active:true},
  qcControlLots:{resource:'qualityControl',active:true},
  qcRuns:{resource:'qualityControl',active:false},
};
const mapping=new Map(MYSQL_TABLES_CONFIG.map(x=>[x.dexieTable,x]));
const allowedRoles=new Set(['Developer','Owner','Doctor','Chemist','Technician','Receptionist','Accountant']);
const idOK=(s:unknown):s is string=>typeof s==='string' && s.length>0 && s.length<=64 && !/[\x00-\x1f]/.test(s);
const bool=(v:unknown)=>v===true;
function failure(res:Response,error:unknown){
  const message=error instanceof Error?error.message:'MYSQL_OPERATION_FAILED';
  if(message==='FORBIDDEN'||message==='BRANCH_NOT_ASSIGNED')res.status(403);
  else if(message.startsWith('INVALID_')||message==='PASSWORD_MIN_8'||message==='PASSWORD_REQUIRED')res.status(400);
  else if(['DUPLICATE_USERNAME','RECORD_NOT_IN_BRANCH','LAST_DEVELOPER_PROTECTED','SELF_LOCKOUT','PROTECTED_DEVELOPER'].includes(message))res.status(409);
  else res.status(503);
  res.json({ok:false,error:message});
}
function parse(raw:unknown):Record<string,unknown>{
  try{
    const value:unknown=JSON.parse(String(raw||'{}'));
    return value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
  }catch{return {};}
}
async function audit(db:Conn,s:CrudSession,resource:string,id:string,operation:string,before:unknown,after:unknown){
  await db.execute(
    'INSERT INTO tlab_mutation_audit_v10(event_id,resource,record_id,branch_id,actor_id,operation,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())',
    [randomBytes(16).toString('hex'),resource,id,s.branchId!,s.userId,operation,
      before===undefined?null:JSON.stringify(before),after===undefined?null:JSON.stringify(after)]);
}
function hash(password:string):string{
  const salt=randomBytes(16).toString('hex');
  return ['scrypt',salt,scryptSync(password,salt,64).toString('hex')].join('$');
}
export function installMysqlCrudRoutes(app:Express,dbConnect:()=>Promise<Conn>):void{
  async function scoped<T>(res:Response,resource:string,action:Action,fn:(db:Conn,s:CrudSession)=>Promise<T>):Promise<T>{
    const s=res.locals.branchSession as CrudSession|undefined;
    if(!s?.branchId)throw new Error('FORBIDDEN');
    const db=await dbConnect();
    try{
      const [branches]=await db.execute<mysql.RowDataPacket[]>(
        s.role==='Developer'
          ? 'SELECT id FROM branches WHERE id=? AND active=1'
          : 'SELECT b.id FROM branches b JOIN user_branches ub ON ub.branch_id=b.id WHERE b.id=? AND b.active=1 AND ub.user_id=?',
        s.role==='Developer'?[s.branchId]:[s.branchId,s.userId]);
      if(!branches.length)throw new Error('BRANCH_NOT_ASSIGNED');
      const matrix=await ownBranchPermissions({
        execute:(sql,params)=>db.execute(sql,params as string[]),
      },s.userId,s.branchId);
      const right=matrix.find(x=>x.resource===resource);
      const grant=s.role==='Developer' ||
        (s.role==='Owner' ? (!right||right.actions[action]===true):right?.actions[action]===true);
      if(!grant)throw new Error('FORBIDDEN');
      return await fn(db,s);
    }finally{await db.end();}
  }
  const target=(store:string)=>{
    if(!stores[store]||!mapping.has(store))throw new Error('INVALID_STORE');
    return mapping.get(store)!;
  };
  app.get('/api/branch-pilot/stores/:store',async(req,res)=>{
    const store=String(req.params.store||'');
    try{
      const m=target(store);
      const records=await scoped(res,stores[store].resource,'view',async(db,s)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT t.* FROM `'+m.mysqlTable+'` t INNER JOIN mysql_store_branch_access a ON a.record_id=t.id AND a.store_name=? AND a.branch_id=? ORDER BY t.id',
          [store,s.branchId!]);
        return rows.map(row=>({...parse(row.raw_json),id:String(row.id)} as Record<string,unknown>))
          .filter(x=>x.active!==false && x.archived!==true);
      });
      res.json({ok:true,source:'mysql',store,records});
    }catch(e){failure(res,e);}
  });
  app.put('/api/branch-pilot/stores/:store/:id',async(req,res)=>{
    const store=String(req.params.store||'');
    try{
      const m=target(store),id=String(req.params.id||'');
      const r=req.body?.record as Record<string,unknown>|undefined;
      if(!idOK(id)||!r||Array.isArray(r)||r.id!==id||
          JSON.stringify(r).length>200000 ||
          Object.keys(r).some(x=>/password|secret|token/i.test(x)))
        throw new Error('INVALID_RECORD');
      if(store==='corporateContracts'){
        const co=Number(r.patientCoPayPercent),company=Number(r.companyCoveragePercent),
          discount=Number(r.discountPercent);
        if(!String(r.code||'').trim()||!String(r.nameAr||'').trim()||
          ![co,company,discount].every(Number.isFinite)||Math.abs(co+company-100)>0.001||
          co<0||co>100||company<0||company>100||discount<0||discount>100)
          throw new Error('INVALID_CONTRACT');
      }
      await scoped(res,stores[store].resource,'edit',async(db,s)=>{
        await db.beginTransaction();
        try{
          const [oldRows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT id,raw_json FROM `'+m.mysqlTable+'` WHERE id=? FOR UPDATE',[id]);
          const old=oldRows[0];
          if(old){
            const [allowed]=await db.execute<mysql.RowDataPacket[]>(
              'SELECT 1 AS yes FROM mysql_store_branch_access WHERE store_name=? AND record_id=? AND branch_id=?',
              [store,id,s.branchId!]);
            if(!allowed.length)throw new Error('RECORD_NOT_IN_BRANCH');
          }else{
            // Creation is checked independently from editing.
            const rights=await ownBranchPermissions({execute:(sql,params)=>
              db.execute(sql,params as string[])},s.userId,s.branchId!);
            const grant=rights.find(x=>x.resource===stores[store].resource);
            if(!(s.role==='Developer'||(s.role==='Owner'?
                (!grant||grant.actions.add===true):grant?.actions.add===true)))
              throw new Error('FORBIDDEN');
          }
          const columns=[...m.columns.map(c=>c.name),'raw_json'];
          const values=[...m.columns.map(c=>c.extract(r)),JSON.stringify(r)];
          if(old){
            const setters=columns.filter(c=>c!=='id');
            const updateValues=columns.flatMap((c,i)=>c==='id'?[]:[values[i]]);
            await db.execute('UPDATE `'+m.mysqlTable+'` SET '+
              setters.map(c=>'`'+c+'`=?').join(',')+' WHERE id=?',[...updateValues,id]);
          }else{
            await db.execute('INSERT INTO `'+m.mysqlTable+'` ('+
              columns.map(c=>'`'+c+'`').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')',values);
            await db.execute(
              'INSERT INTO mysql_store_branch_access(store_name,record_id,branch_id,created_at,created_by) VALUES(?,?,?,NOW(),?)',
              [store,id,s.branchId!,s.userId]);
          }
          await audit(db,s,store,id,old?'edit':'add',old?parse(old.raw_json):undefined,r);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,source:'mysql',store,id});
    }catch(e){failure(res,e);}
  });
  app.delete('/api/branch-pilot/stores/:store/:id',async(req,res)=>{
    const store=String(req.params.store||'');
    try{
      const m=target(store),id=String(req.params.id||'');
      if(!idOK(id))throw new Error('INVALID_ID');
      await scoped(res,stores[store].resource,'delete',async(db,s)=>{
        await db.beginTransaction();
        try{
          const [rows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT t.id,t.raw_json FROM `'+m.mysqlTable+'` t JOIN mysql_store_branch_access a ON a.store_name=? AND a.record_id=t.id AND a.branch_id=? WHERE t.id=? FOR UPDATE',
            [store,s.branchId!,id]);
          if(!rows.length)throw new Error('RECORD_NOT_IN_BRANCH');
          const before=parse(rows[0].raw_json);
          const after={...before,id,active:false,archived:true};
          await db.execute('UPDATE `'+m.mysqlTable+'` SET '+
            (stores[store].active?'active=0,':'')+'raw_json=? WHERE id=?',[JSON.stringify(after),id]);
          await audit(db,s,store,id,'archive',before,after);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,source:'mysql',store,id});
    }catch(e){failure(res,e);}
  });
  function adminSession(res:Response):CrudSession{
    const s=res.locals.branchSession as CrudSession|undefined;
    if(!s?.branchId||!['Developer','Owner'].includes(s.role))throw new Error('FORBIDDEN');
    return s;
  }
  app.get('/api/branch-pilot/user-records',async(_req,res)=>{
    try{
      const users=await scoped(res,'users','view',async(db)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          'SELECT id,username,full_name_ar,role,active,raw_json FROM users ORDER BY username');
        return rows.map(row=>{
          const raw=parse(row.raw_json);
          return {id:String(row.id),username:String(row.username),
            fullNameAr:String(row.full_name_ar||raw.fullNameAr||''),
            fullNameEn:String(raw.fullNameEn||''),role:String(row.role),
            employeeId:raw.employeeId||undefined,active:Number(row.active)===1,
            createdAt:String(raw.createdAt||''),passwordHash:''};
        });
      });
      adminSession(res);
      res.json({ok:true,source:'mysql',users});
    }catch(e){failure(res,e);}
  });
  app.get('/api/branch-pilot/employee-records',async(_req,res)=>{
    try{
      adminSession(res);
      const employees=await scoped(res,'employees','view',async(db,s)=>{
        const [rows]=await db.execute<mysql.RowDataPacket[]>(
          "SELECT e.id,e.code,e.name_ar,e.raw_json FROM employees e JOIN mysql_store_branch_access a ON a.store_name='employees' AND a.record_id=e.id AND a.branch_id=?",
          [s.branchId!]);
        return rows.map(row=>({...parse(row.raw_json),id:String(row.id),
          code:String(row.code),nameAr:String(row.name_ar)}));
      });
      res.json({ok:true,source:'mysql',employees});
    }catch(e){failure(res,e);}
  });
  app.put('/api/branch-pilot/user-records/:id',async(req,res)=>{
    try{
      const s=adminSession(res),id=String(req.params.id||'');
      const input=req.body?.record as Record<string,unknown>|undefined;
      if(!idOK(id)||!input||Array.isArray(input)||input.id!==id)throw new Error('INVALID_USER');
      const username=String(input.username||'').trim();
      const nameAr=String(input.fullNameAr||'').trim();
      const nameEn=String(input.fullNameEn||'').trim();
      const role=String(input.role||'');
      const password=String(input.passwordHash||'');
      const active=bool(input.active);
      if(!/^[A-Za-z0-9_.-]{1,64}$/.test(username)||!nameAr||nameAr.length>191||
         nameEn.length>191||!allowedRoles.has(role)||password.length>256 ||
         (password.length>0&&password.length<8))
         throw new Error('INVALID_USER');
      await scoped(res,'users','edit',async(db)=>{
        await db.beginTransaction();
        try{
          const [rows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT role,raw_json FROM users WHERE id=? FOR UPDATE',[id]);
          const existing=rows[0];
          const old=parse(existing?.raw_json);
          if(!existing&&!password)throw new Error('PASSWORD_REQUIRED');
          if(existing && id===s.userId && (!active||role!==String(existing.role)))
            throw new Error('SELF_LOCKOUT');
          if(s.role!=='Developer' && (role==='Developer'||existing?.role==='Developer'))
            throw new Error('FORBIDDEN');
          if(existing?.role==='Developer'&&!active)
            throw new Error('PROTECTED_DEVELOPER');
          if(!existing){
            const permissions=await ownBranchPermissions({execute:(sql,params)=>
              db.execute(sql,params as string[])},s.userId,s.branchId!);
            const rule=permissions.find(x=>x.resource==='users');
            if(!(s.role==='Developer'||(s.role==='Owner' ? (!rule||rule.actions.add===true):
              rule?.actions.add===true)))throw new Error('FORBIDDEN');
          }
          const [dups]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT id FROM users WHERE username=? AND id<>? LIMIT 1',[username,id]);
          if(dups.length)throw new Error('DUPLICATE_USERNAME');
          const credential=password?hash(password):String(old.passwordHash||'');
          if(!credential)throw new Error('PASSWORD_REQUIRED');
          const record={...old,id,username,fullNameAr:nameAr,fullNameEn:nameEn,
            role,passwordHash:credential,active,employeeId:input.employeeId||undefined,
            createdAt:String(old.createdAt||new Date().toISOString())};
          if(existing){
            await db.execute('UPDATE users SET username=?,full_name_ar=?,role=?,active=?,raw_json=? WHERE id=?',
              [username,nameAr,role,active?1:0,JSON.stringify(record),id]);
          }else{
            await db.execute('INSERT INTO users(id,username,full_name_ar,role,active,raw_json) VALUES(?,?,?,?,?,?)',
              [id,username,nameAr,role,active?1:0,JSON.stringify(record)]);
            await db.execute('INSERT INTO user_branches(user_id,branch_id,is_default) VALUES(?,?,1)',
              [id,s.branchId!]);
          }
          const scrub=(r:Record<string,unknown>)=>({...r,passwordHash:'[REDACTED]'});
          await audit(db,s,'users',id,existing?'edit':'add',existing?scrub(old):undefined,scrub(record));
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,source:'mysql',id});
    }catch(e){failure(res,e);}
  });
  app.delete('/api/branch-pilot/user-records/:id',async(req,res)=>{
    try{
      const s=adminSession(res),id=String(req.params.id||'');
      if(!idOK(id)||id===s.userId)throw new Error('INVALID_USER');
      await scoped(res,'users','delete',async(db)=>{
        await db.beginTransaction();
        try{
          const [rows]=await db.execute<mysql.RowDataPacket[]>(
            'SELECT role,raw_json FROM users WHERE id=? FOR UPDATE',[id]);
          if(!rows.length)throw new Error('INVALID_USER');
          if(rows[0].role==='Developer')throw new Error('PROTECTED_DEVELOPER');
          const original=parse(rows[0].raw_json);
          await db.execute('UPDATE users SET active=0,raw_json=? WHERE id=?',
            [JSON.stringify({...original,id,active:false}),id]);
          await audit(db,s,'users',id,'archive',
            {...original,passwordHash:'[REDACTED]'},undefined);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      });
      res.json({ok:true,source:'mysql',id});
    }catch(e){failure(res,e);}
  });
}
