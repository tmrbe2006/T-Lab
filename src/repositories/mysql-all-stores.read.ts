/**
 * Complete MySQL-only read transport for the 49 mapped T-Lab stores.
 * Fetches all pages; server validates the selected branch and permissions.
 * Never silently falls back to IndexedDB/localStorage or dummy records.
 */
export const MYSQL_PILOT_PORT='3127';
export function useMySQLStore():boolean {
  return typeof window!=='undefined' && window.location.port===MYSQL_PILOT_PORT;
}
export async function allMySQLStoreRows<T>(store:string):Promise<T[]> {
  const records:T[]=[];
  const pageSize=200;
  let offset=0;
  let declaredTotal:number|null=null;
  do {
    const response=await fetch('/api/branch-pilot/mysql-store/'+encodeURIComponent(store)+
      '?limit='+pageSize+'&offset='+offset,{credentials:'same-origin',cache:'no-store'});
    let data:{ok?:boolean;source?:string;store?:string;total?:number;records?:T[];error?:string};
    try{data=await response.json() as typeof data;}
    catch{throw new Error('MYSQL_STORE_INVALID_RESPONSE');}
    if(!response.ok||data.ok!==true)throw new Error(data.error||'MYSQL_STORE_UNAVAILABLE');
    if(data.source!=='mysql'||data.store!==store||!Array.isArray(data.records)||
      !Number.isSafeInteger(data.total)||Number(data.total)<0)
      throw new Error('MYSQL_STORE_UNTRUSTED_RESPONSE');
    if(declaredTotal===null)declaredTotal=Number(data.total);
    if(data.total!==declaredTotal)throw new Error('MYSQL_STORE_CHANGED_DURING_READ');
    if(data.records.length>pageSize||(!data.records.length && offset<declaredTotal))
      throw new Error('MYSQL_STORE_INCOMPLETE_PAGE');
    records.push(...data.records);
    offset+=data.records.length;
    if(records.length>1000000)throw new Error('MYSQL_STORE_RESULT_TOO_LARGE');
  }while(offset<(declaredTotal??0));
  return records;
}
export function refuseUnmigratedMySQLWrite():void {
  if(useMySQLStore())throw new Error('MYSQL_WRITE_REQUIRES_ATOMIC_SERVER_API');
}
