/** Audited master-data MySQL writes, scoped by server session + branch. */
async function requestMaster<T>(store:string,method:'PUT'|'DELETE',payload?:unknown,id?:string):Promise<T>{
  const suffix=id?'/'+encodeURIComponent(id):'';
  const response=await fetch('/api/branch-pilot/mysql-master/'+encodeURIComponent(store)+suffix,{
    method,credentials:'same-origin',cache:'no-store',
    headers:payload===undefined?undefined:{'Content-Type':'application/json'},
    body:payload===undefined?undefined:JSON.stringify(payload),
  });
  let json:{ok?:boolean;source?:string;store?:string;error?:string};
  try{json=await response.json() as typeof json;}
  catch{throw new Error('MYSQL_MASTER_INVALID_RESPONSE');}
  if(!response.ok||json.ok!==true)throw new Error(json.error||'MYSQL_MASTER_WRITE_FAILED');
  if(json.source!=='mysql'||json.store!==store)throw new Error('MYSQL_MASTER_SOURCE_INVALID');
  return json as T;
}
export async function saveMySQLMaster(store:'doctorSpecialties'|'scientificDepartments'|'sampleTubes',record:unknown):Promise<void>{
  await requestMaster(store,'PUT',{record});
}
export async function archiveMySQLMaster(store:'doctorSpecialties'|'scientificDepartments'|'sampleTubes',id:string):Promise<void>{
  await requestMaster(store,'DELETE',undefined,id);
}
