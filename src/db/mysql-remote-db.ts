/**
 * Browser-side database facade for the Windows MySQL edition.
 * No Dexie instance is created and no IndexedDB APIs are accessed on port 3127.
 * Every query is fulfilled by authenticated MySQL APIs. Multi-table writes
 * invoked through db.transaction are sent as one server transaction.
 */
import { MYSQL_TABLES_CONFIG } from './mysql-schema';
import type { MedicalLabDatabase } from './database';

type Item=Record<string,unknown>&{id:string};
type Command={store:string;operation:'add'|'edit'|'delete';id:string;record?:Item;expectedRevision?:string};
const names=new Set(MYSQL_TABLES_CONFIG.map(x=>x.dexieTable));
type Transaction={commands:Command[];snapshots:Map<string,Item[]>};
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error);}
async function http<T>(endpoint:string,method:'GET'|'POST',body?:unknown):Promise<T>{
  const response=await fetch('/api/branch-pilot/'+endpoint,{
    method,credentials:'same-origin',cache:'no-store',
    ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
  });
  let data:Record<string,unknown>;
  try{data=await response.json() as Record<string,unknown>;}
  catch{throw new Error('MYSQL_INVALID_RESPONSE');}
  if(!response.ok||data.ok!==true||data.source!=='mysql')
    throw new Error(String(data.error||'MYSQL_UNAVAILABLE'));
  return data as T;
}
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;
function compareValue(a:unknown,b:unknown):number{
  if(typeof a==='number'&&typeof b==='number')return a-b;
  return String(a??'').localeCompare(String(b??''),'en',{numeric:true});
}
export function createMysqlRemoteDatabase():MedicalLabDatabase {
  let active:Transaction|null=null;
  const cache=new Map<string,unknown>();
  const revisions=new Map<string,Record<string,string>>();
  const load=async(name:string):Promise<Item[]>=>{
    if(active?.snapshots.has(name))return clone(active.snapshots.get(name)!);
    const response=await http<{records:Item[];revisions:Record<string,string>}>('unified/'+encodeURIComponent(name),'GET');
    if(!Array.isArray(response.records)||!response.revisions || typeof response.revisions!=='object')
      throw new Error('MYSQL_BAD_RECORDS');
    revisions.set(name,response.revisions);
    const rows=clone(response.records);
    active?.snapshots.set(name,clone(rows));
    return rows;
  };
  const write=async(commands:Command[]):Promise<void>=>{
    if(!commands.length)return;
    await http('unified/transaction','POST',{commands});
  };
  const mutate=async(command:Command):Promise<string>=>{
    const current=await load(command.store);
    const idx=current.findIndex(row=>row.id===command.id);
    if(command.operation==='add'&&idx>=0)throw new Error('DUPLICATE_RECORD_ID');
    if(command.operation!=='add'&&idx<0)throw new Error('RECORD_NOT_FOUND');
    if(command.operation!=='add'){
      command.expectedRevision=revisions.get(command.store)?.[command.id];
      if(!command.expectedRevision)throw new Error('MYSQL_REVISION_REQUIRED');
    }
    if(active){
      const previous=active.commands.findIndex(x=>x.store===command.store&&x.id===command.id);
      if(previous>=0){
        const old=active.commands[previous];
        if(old.expectedRevision)command.expectedRevision=old.expectedRevision;
        if(old.operation==='add'&&command.operation==='edit'){
          command.operation='add';
          command.expectedRevision=undefined;
        }
        if(old.operation==='add'&&command.operation==='delete'){
          active.commands.splice(previous,1);
          current.splice(idx,1);
          active.snapshots.set(command.store,current);
          return command.id;
        }
        active.commands.splice(previous,1);
      }
      active.commands.push(clone(command));
      if(command.operation==='delete')current.splice(idx,1);
      else if(idx>=0)current[idx]=clone(command.record!);
      else current.push(clone(command.record!));
      active.snapshots.set(command.store,current);
    }else await write([command]);
    return command.id;
  };
  type Predicate=(item:Item)=>boolean;
  function collection(name:string,pred:Predicate=()=>true,sort?:{field:string;desc:boolean},
     offset=0,limit=Infinity){
    const fetchRows=async()=>{
      let rows=(await load(name)).filter(pred);
      if(sort)rows.sort((a,b)=>compareValue(a[sort.field],b[sort.field])*(sort.desc?-1:1));
      return rows.slice(offset,offset+limit);
    };
    const obj={
      toArray:fetchRows,
      first:async()=>(await fetchRows())[0],
      last:async()=>{const rows=await fetchRows();return rows[rows.length-1];},
      count:async()=>(await fetchRows()).length,
      each:async(fn:(item:Item)=>void|Promise<void>)=>{
        for(const item of await fetchRows())await fn(item);
      },
      sortBy:async(field:string)=>(await fetchRows()).sort((a,b)=>compareValue(a[field],b[field])),
      primaryKeys:async()=>(await fetchRows()).map(x=>x.id),
      reverse:()=>collection(name,pred,sort?{field:sort.field,desc:!sort.desc}:sort,offset,limit),
      offset:(n:number)=>collection(name,pred,sort,Math.max(0,n),limit),
      limit:(n:number)=>collection(name,pred,sort,offset,Math.max(0,n)),
      and:(fn:Predicate)=>collection(name,x=>pred(x)&&fn(x),sort,offset,limit),
      filter:(fn:Predicate)=>collection(name,x=>pred(x)&&fn(x),sort,offset,limit),
      delete:async()=>{
        const rows=await fetchRows();
        for(const row of rows)await mutate({store:name,id:row.id,operation:'delete'});
        return rows.length;
      },
      modify:async(change:Partial<Item>|((item:Item)=>void))=>{
        const rows=await fetchRows();
        for(const row of rows){
          const next=clone(row);
          if(typeof change==='function')change(next);else Object.assign(next,change);
          await mutate({store:name,id:row.id,operation:'edit',record:next});
        }
        return rows.length;
      },
    };
    return obj;
  }
  function table(name:string){
    if(!names.has(name))throw new Error('MYSQL_UNKNOWN_STORE_'+name);
    if(cache.has(name))return cache.get(name);
    const where=(field:string)=>{
      const wrap=(pred:Predicate)=>collection(name,pred);
      const api={
        equals:(value:unknown)=>wrap(x=>x[field]===value),
        anyOf:(...values:unknown[])=>{
          const flattened=values.length===1&&Array.isArray(values[0])?values[0]:values;
          return wrap(x=>flattened.includes(x[field]));
        },
        startsWith:(value:string)=>wrap(x=>String(x[field]??'').startsWith(value)),
        startsWithIgnoreCase:(value:string)=>wrap(x=>String(x[field]??'').toLocaleLowerCase().startsWith(value.toLocaleLowerCase())),
        equalsIgnoreCase:(value:string)=>wrap(x=>String(x[field]??'').toLocaleLowerCase()===value.toLocaleLowerCase()),
        above:(value:unknown)=>wrap(x=>compareValue(x[field],value)>0),
        below:(value:unknown)=>wrap(x=>compareValue(x[field],value)<0),
        between:(a:unknown,b:unknown,includeA=true,includeB=false)=>
          wrap(x=>(includeA?compareValue(x[field],a)>=0:compareValue(x[field],a)>0)&&
            (includeB?compareValue(x[field],b)<=0:compareValue(x[field],b)<0)),
      };
      return api;
    };
    const result={
      name,
      schema:{name,primKey:{keyPath:'id'},indexes:[]},
      toArray:()=>load(name),
      get:async(key:unknown)=> (await load(name)).find(x=>x.id===key),
      count:async()=>(await load(name)).length,
      put:async(record:Item)=>{
        if(!record||typeof record.id!=='string')throw new Error('MYSQL_ID_REQUIRED');
        const existing=(await load(name)).find(x=>x.id===record.id);
        return mutate({store:name,id:record.id,operation:existing?'edit':'add',record});
      },
      add:async(record:Item)=>{
        if(!record||typeof record.id!=='string')throw new Error('MYSQL_ID_REQUIRED');
        return mutate({store:name,id:record.id,operation:'add',record});
      },
      update:async(id:string,changes:Partial<Item>)=>{
        const prior=(await load(name)).find(x=>x.id===id);
        if(!prior)return 0;
        await mutate({store:name,id,operation:'edit',record:{...prior,...changes}});
        return 1;
      },
      delete:async(id:string)=>{await mutate({store:name,id,operation:'delete'});},
      bulkPut:async(records:Item[])=>{
        const created:Command[]=[];
        const prior=await load(name);
        for(const record of records){
          if(!record||typeof record.id!=='string')throw new Error('MYSQL_ID_REQUIRED');
          const present=prior.some(x=>x.id===record.id);
          const expectedRevision=present?revisions.get(name)?.[record.id]:undefined;
          if(present&&!expectedRevision)throw new Error('MYSQL_REVISION_REQUIRED');
          created.push({store:name,id:record.id,operation:present?'edit':'add',record,expectedRevision});
        }
        if(active){
          for(const cmd of created)await mutate(cmd);
        }else await write(created);
        return records[records.length-1]?.id;
      },
      bulkAdd:async(records:Item[])=>{
        if(active){
          for(const item of records)await mutate({store:name,id:item.id,operation:'add',record:item});
        }else await write(records.map(item=>({store:name,id:item.id,operation:'add',record:item})));
        return records[records.length-1]?.id;
      },
      bulkDelete:async(ids:string[])=>{
        if(active){for(const id of ids)await mutate({store:name,id,operation:'delete'});}
        else{
          await load(name);
          await write(ids.map(id=>({store:name,id,operation:'delete',
            expectedRevision:revisions.get(name)?.[id]})));
        }
      },
      clear:async()=>{throw new Error('MYSQL_MASS_DELETE_FORBIDDEN');},
      where,filter:(fn:Predicate)=>collection(name,fn),
      orderBy:(field:string)=>collection(name,()=>true,{field,desc:false}),
      toCollection:()=>collection(name),
    };
    cache.set(name,result);return result;
  }
  const txn=async(...args:unknown[])=>{
    const callback=args.at(-1);
    if(typeof callback!=='function')throw new Error('MYSQL_TRANSACTION_CALLBACK_REQUIRED');
    const mode=args[0];
    if(active){
      // Nested domain operations participate in the outer server-side atomic batch.
      if(args[0]==='r'||args[0]==='rw')
        return await (callback as ()=>Promise<unknown>)();
      throw new Error('MYSQL_TRANSACTION_MODE_UNSUPPORTED');
    }
    if(mode!=='rw'&&mode!=='r')throw new Error('MYSQL_TRANSACTION_MODE_UNSUPPORTED');
    active={commands:[],snapshots:new Map()};
    try{
      const result=await (callback as ()=>Promise<unknown>)();
      const staged=active.commands;
      if(mode==='r'&&staged.length)throw new Error('MYSQL_READ_ONLY_TRANSACTION_WRITE');
      await write(staged);
      return result;
    }catch(e){throw new Error(errorMessage(e));}
    finally{active=null;}
  };
  const api={
    transaction:txn,table,
    tables:[...names].map(name=>table(name)),
    open:async()=>undefined,
    close:()=>undefined,
    isOpen:()=>true,
    name:'T-Lab MySQL API',
  };
  return new Proxy(api as unknown as MedicalLabDatabase,{
    get(target,property){
      if(typeof property!=='string')return Reflect.get(target,property);
      if(property in api)return (api as Record<string,unknown>)[property];
      if(names.has(property))return table(property);
      throw new Error('MYSQL_UNKNOWN_DATABASE_OPERATION_'+property);
    },
  });
}
