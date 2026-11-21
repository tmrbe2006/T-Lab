import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/database';
import { allMySQLStoreRows } from '../../repositories/mysql-all-stores.read';
import { MYSQL_TABLES_CONFIG } from '../../db/mysql-schema';
afterEach(()=>vi.unstubAllGlobals());

function pilot(records:Record<string,unknown>[]) {
  vi.stubGlobal('window',{location:{port:'3127'}});
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    const store=String(url).split('/mysql-store/')[1]?.split('?')[0]||'';
    return {ok:true,json:async()=>({
      ok:true,source:'mysql',store,total:records.length,records,
    })};
  }));
}
describe('49 MySQL-authoritative stores',()=>{
  it('has a one-to-one mapping for all stores',()=>{
    expect(MYSQL_TABLES_CONFIG).toHaveLength(49);
    expect(new Set(MYSQL_TABLES_CONFIG.map(x=>x.dexieTable)).size).toBe(49);
    expect(new Set(MYSQL_TABLES_CONFIG.map(x=>x.mysqlTable)).size).toBe(49);
  });
  it('allows searching legacy table API through branch-checked MySQL',async()=>{
    pilot([{id:'r1',patientId:'p1',createdAt:'2026-01-01'},
           {id:'r2',patientId:'p2',createdAt:'2026-01-02'}]);
    expect((await db.requests.where('patientId').equals('p1').toArray()).map(x=>x.id))
      .toEqual(['r1']);
    expect(await db.requests.count()).toBe(2);
  });
  it('never persists an unported browser write',()=>{
    pilot([]);
    expect(()=>db.journalEntries.put({id:'j1'} as never)).toThrow('MYSQL_ONLY_WRITE_REQUIRES_AUTHORIZED_ATOMIC_API');
  });
  it('fails if the API returns browser records rather than MySQL',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    vi.stubGlobal('fetch',vi.fn(async()=>({
      ok:true,json:async()=>({ok:true,source:'browser',store:'patients',total:0,records:[]}),
    })));
    await expect(allMySQLStoreRows('patients')).rejects.toThrow('MYSQL_STORE_UNTRUSTED_RESPONSE');
  });
  it('fails visibly on connection loss',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('MySQL server stopped')));
    await expect(db.results.toArray()).rejects.toThrow('MySQL server stopped');
  });
});
