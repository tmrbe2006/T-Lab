import { allMySQLStoreRows, useMySQLStore } from '../repositories/mysql-all-stores.read';

/**
 * Migration compatibility facade for legacy Dexie read methods.
 * In Windows MySQL-only pilot all reads are remote (with branch permissions).
 * Writes are deliberately blocked rather than silently persisted in IndexedDB.
 * It does not provide atomic financial writes; dedicated server commands are required.
 */
const STORE_NAMES=[
  'patients','doctorSpecialties','doctors','scientificDepartments','sampleTubes',
  'tests','testParameters','requests','requestItems','samples','results',
  'invoices','invoiceItems','payments','expenses','commissions',
  'inventoryItems','inventoryLots','stockMovements','testBOMs','stockTakingSessions',
  'suppliers','purchaseInvoices','returnNotes','chartOfAccounts','journalEntries',
  'costCenters','periodLocks','cashboxSessions','dailyClosings','employees',
  'users','roles','permissions','settings','auditLogs','microscopyScans',
  'aiImageAnalyses','aiRecognitionFindings','aiCorrections','criticalValueLogs',
  'cultureResults','antibioticsCatalog','qcControlLots','qcRuns','homeVisits',
  'corporateContracts','referenceLabPartners','labToLabDispatches',
] as const;

type AnyRecord=Record<string,unknown>;
const compare=(a:unknown,b:unknown)=>a===b || (a!=null&&b!=null&&String(a)===String(b));
const field=(r:AnyRecord,name:string)=>r[name];
function blockWrite():never { throw new Error('MYSQL_ONLY_WRITE_REQUIRES_AUTHORIZED_ATOMIC_API'); }

function remoteQuery(store:string,predicate:(row:AnyRecord)=>boolean=()=>true) {
  let ordering:string|null=null;
  let inverted=false,skip=0,take:number|null=null;
  const query={
    async toArray():Promise<AnyRecord[]>{
      let rows=(await allMySQLStoreRows<AnyRecord>(store)).filter(predicate);
      if(ordering)rows=rows.sort((a,b)=>String(field(a,ordering!)??'').localeCompare(String(field(b,ordering!)??''),undefined,{numeric:true}));
      if(inverted)rows.reverse();
      return rows.slice(skip,take===null?undefined:skip+take);
    },
    async count(){return (await query.toArray()).length;},
    async first(){return (await query.toArray())[0];},
    async last(){return (await query.toArray()).at(-1);},
    async sortBy(name:string){return (await query.toArray()).sort((a,b)=>String(a[name]??'').localeCompare(String(b[name]??''),undefined,{numeric:true}));},
    async keys(){return (await query.toArray()).map(row=>row.id);},
    async primaryKeys(){return (await query.toArray()).map(row=>row.id);},
    async each(callback:(record:AnyRecord)=>void){for(const row of await query.toArray())callback(row);},
    filter(fn:(row:AnyRecord)=>boolean){return remoteQuery(store,row=>predicate(row)&&fn(row));},
    and(fn:(row:AnyRecord)=>boolean){return remoteQuery(store,row=>predicate(row)&&fn(row));},
    orderBy(name:string){ordering=name;return query;},
    reverse(){inverted=!inverted;return query;},
    offset(n:number){skip=Math.max(0,n);return query;},
    limit(n:number){take=Math.max(0,n);return query;},
    distinct(){return query;},
    modify:blockWrite,
    delete:blockWrite,
  };
  return query;
}
function where(store:string,key:string){
  const make=(p:(v:unknown)=>boolean)=>remoteQuery(store,r=>p(field(r,key)));
  return {
    equals:(v:unknown)=>make(x=>compare(x,v)),
    equalsIgnoreCase:(v:unknown)=>make(x=>String(x??'').toLowerCase()===String(v??'').toLowerCase()),
    anyOf:(...values:unknown[])=>make(x=>(Array.isArray(values[0])?values[0] as unknown[]:values).some(y=>compare(x,y))),
    noneOf:(...values:unknown[])=>make(x=>!(Array.isArray(values[0])?values[0] as unknown[]:values).some(y=>compare(x,y))),
    above:(v:unknown)=>make(x=>String(x??'')>String(v)),
    below:(v:unknown)=>make(x=>String(x??'')<String(v)),
    aboveOrEqual:(v:unknown)=>make(x=>String(x??'')>=String(v)),
    belowOrEqual:(v:unknown)=>make(x=>String(x??'')<=String(v)),
    between:(a:unknown,b:unknown,includeLower=true,includeUpper=false)=>make(x=>
      (includeLower?String(x??'')>=String(a):String(x??'')>String(a)) &&
      (includeUpper?String(x??'')<=String(b):String(x??'')<String(b))),
    startsWith:(v:string)=>make(x=>String(x??'').startsWith(v)),
    startsWithIgnoreCase:(v:string)=>make(x=>String(x??'').toLowerCase().startsWith(v.toLowerCase())),
  };
}
const tableCache=new Map<string,Record<string,unknown>>();
function mysqlTable(name:string):Record<string,unknown>{
  if(!STORE_NAMES.includes(name as typeof STORE_NAMES[number]))throw new Error('UNKNOWN_MYSQL_TABLE');
  const cached=tableCache.get(name);if(cached)return cached;
  const api={
    name,
    toArray:()=>allMySQLStoreRows<AnyRecord>(name),
    get:async(id:string|Record<string,unknown>)=> (await allMySQLStoreRows<AnyRecord>(name)).find(row=>
      typeof id==='string'?compare(row.id,id):
      Object.entries(id).every(([k,v])=>compare(row[k],v))),
    count:async()=> (await allMySQLStoreRows<AnyRecord>(name)).length,
    where:(column:string|Record<string,unknown>)=>typeof column==='string'?where(name,column):
      remoteQuery(name,row=>Object.entries(column).every(([k,v])=>compare(row[k],v))),
    filter:(fn:(row:AnyRecord)=>boolean)=>remoteQuery(name,fn),
    orderBy:(key:string)=>remoteQuery(name).orderBy(key),
    toCollection:()=>remoteQuery(name),
    put:blockWrite,add:blockWrite,bulkPut:blockWrite,bulkAdd:blockWrite,
    update:blockWrite,delete:blockWrite,bulkDelete:blockWrite,clear:blockWrite,
  };
  tableCache.set(name,api);return api;
}
export function mysqlOnlyDatabaseProxy<T extends object>(legacy:T):T{
  return new Proxy(legacy,{
    get(target,prop,receiver){
      if(!useMySQLStore())return Reflect.get(target,prop,receiver);
      if(typeof prop==='string' && STORE_NAMES.includes(prop as typeof STORE_NAMES[number]))
        return mysqlTable(prop);
      if(prop==='table')return (store:string)=>mysqlTable(store);
      if(prop==='tables')return STORE_NAMES.map(mysqlTable);
      if(prop==='transaction')return async(mode:string,...args:unknown[])=>{
        if(mode!=='r')blockWrite();
        const callback=args.at(-1);
        if(typeof callback!=='function')throw new Error('INVALID_MYSQL_TRANSACTION');
        return (callback as ()=>Promise<unknown>)();
      };
      if(prop==='open')return async()=>receiver;
      if(prop==='isOpen')return ()=>true;
      if(prop==='close')return ()=>undefined;
      if(prop==='delete')return blockWrite;
      return Reflect.get(target,prop,receiver);
    }
  });
}
