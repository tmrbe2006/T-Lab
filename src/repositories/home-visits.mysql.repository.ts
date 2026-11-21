import type { HomeVisitRecord } from '../types';

/** MySQL-authoritative home visit access for the isolated port 3127 pilot. */
const endpoint='/api/branch-pilot/home-visits';
async function request<T>(path:string, method='GET', body?:unknown):Promise<T>{
  const response=await fetch(endpoint+path,{
    method,credentials:'same-origin',cache:'no-store',
    headers:body===undefined?undefined:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  let json: {ok?:boolean;error?:string;source?:string;visits?:HomeVisitRecord[]};
  try{json=await response.json() as typeof json;}
  catch{throw new Error('MYSQL_HOME_VISITS_RESPONSE_INVALID');}
  if(!response.ok || json.ok!==true)throw new Error(json.error||'MYSQL_HOME_VISITS_UNAVAILABLE');
  if(json.source!=='mysql')throw new Error('HOME_VISITS_NOT_MYSQL');
  return json as T;
}
export const mysqlHomeVisitsRepository={
  async getAll():Promise<HomeVisitRecord[]>{
    const data=await request<{ok:true;source:'mysql';visits:HomeVisitRecord[]}>('');
    if(!Array.isArray(data.visits))throw new Error('MYSQL_HOME_VISITS_RESPONSE_INVALID');
    return data.visits;
  },
  async save(visit:HomeVisitRecord,existing=false):Promise<void>{
    await request(existing?'/'+encodeURIComponent(visit.id):'',existing?'PUT':'POST',{visit});
  },
  async archive(id:string):Promise<void>{
    await request('/'+encodeURIComponent(id),'DELETE');
  },
};
