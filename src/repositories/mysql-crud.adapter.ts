/**
 * T-Lab MySQL repository adapter for migrated clinical/corporate screens.
 * The local browser store is never touched in the port-3127 installation.
 * Server checks the logged-in user, selected branch and action permissions.
 */
import type { Table } from 'dexie';

export const useMySQLCrud=()=>typeof window!=='undefined'&&window.location.port==='3127';
const allowed=['corporateContracts','cultureResults','antibioticsCatalog','qcControlLots','qcRuns'] as const;
type Store=typeof allowed[number];
function base(store:Store,id?:string):string {
  return '/api/branch-pilot/stores/'+encodeURIComponent(store)+(id?'/'+encodeURIComponent(id):'');
}
async function request<T>(store:Store,method:'GET'|'PUT'|'DELETE',id?:string,record?:unknown):Promise<T>{
  const response=await fetch(base(store,id),{method,cache:'no-store',credentials:'same-origin',
    ...(record===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify({record})})});
  let data:{ok?:boolean;source?:string;store?:string;records?:T;error?:string;id?:string};
  try{data=await response.json() as typeof data;}catch{throw new Error('MYSQL_INVALID_RESPONSE');}
  if(!response.ok||data.ok!==true)throw new Error(data.error||'MYSQL_OPERATION_FAILED');
  if(data.source!=='mysql'||data.store!==store)throw new Error('MYSQL_UNTRUSTED_RESPONSE');
  return (method==='GET'?data.records:data.id) as T;
}
export function connectedStore<T extends {id:string}>(legacy:Table<T,string>,store:Store):Table<T,string>{
  if(!useMySQLCrud())return legacy;
  const getAll=()=>request<T[]>(store,'GET');
  const put=async(rec:T)=>{await request<string>(store,'PUT',rec.id,rec);return rec.id;};
  const archive=async(id:string)=>{await request<string>(store,'DELETE',id);};
  const where=(column:string)=>{
    const equals=(value:unknown)=>{
      const getRows=async()=> (await getAll()).filter(row=>String((row as Record<string,unknown>)[column])===String(value));
      return {toArray:getRows,first:async()=>(await getRows())[0],
        count:async()=>(await getRows()).length,
        delete:async()=>{const matching=await getRows();for(const record of matching)await archive(record.id);return matching.length;}};
    };
    return {equals};
  };
  const api={
    toArray:getAll,get:async(id:string)=>(await getAll()).find(x=>x.id===id),
    put,add:put,delete:archive,
    bulkPut:async(rows:T[])=>{
      if(store!=='qcRuns')throw new Error('MYSQL_BULK_REQUIRES_TRANSACTIONAL_ENDPOINT');
      if(!rows.length)return undefined;
      const response=await fetch(base(store)+'/bulk',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({records:rows}),
      });
      const data=await response.json() as Record<string,unknown>;
      if(!response.ok||data.ok!==true||data.source!=='mysql'||data.store!==store)
        throw new Error(String(data.error||'MYSQL_BULK_WRITE_FAILED'));
      return rows[rows.length-1].id;
    },
    where,update:async(id:string,patch:Partial<T>)=>{
      const existing=(await getAll()).find(x=>x.id===id);
      if(!existing)return 0;
      await put({...existing,...patch});return 1;
    },
  };
  // The migrated pages use this subset only. Unsupported Dexie calls must
  // fail visibly rather than silently persisting data in IndexedDB.
  return new Proxy(legacy,{get(target,property,receiver){
    if(typeof property==='string' && property in api)
      return (api as Record<string,unknown>)[property];
    if(typeof property==='string' && ['transaction','clear','bulkDelete'].includes(property))
      throw new Error('MYSQL_OPERATION_REQUIRES_DEDICATED_API');
    return Reflect.get(target,property,receiver);
  }}) as Table<T,string>;
}
