import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectedStore } from '../../repositories/mysql-crud.adapter';
import { usersRepository } from '../../repositories/users.repository';
import { db } from '../../db/database';

afterEach(()=>vi.unstubAllGlobals());
function pilot(){vi.stubGlobal('window',{location:{port:'3127'}});}
describe('MySQL screen CRUD on Windows',()=>{
  it('reads contracts from MySQL without querying IndexedDB',async()=>{
    pilot();
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',store:'corporateContracts',
      records:[{id:'cnt_1',code:'INS-01',nameAr:'تجربة',active:true}],
    })}));
    vi.stubGlobal('fetch',fetcher);
    const values=await connectedStore(db.corporateContracts,'corporateContracts').toArray();
    expect(values.map(x=>x.id)).toEqual(['cnt_1']);
    expect(fetcher.mock.calls[0][0]).toContain('/api/branch-pilot/stores/corporateContracts');
  });
  it('saves an edited contract with PUT, never Dexie',async()=>{
    pilot();
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',store:'corporateContracts',id:'cnt_1',
    })}));
    vi.stubGlobal('fetch',fetcher);
    await connectedStore(db.corporateContracts,'corporateContracts').put({
      id:'cnt_1',code:'INS-01',nameAr:'Test',nameEn:'Test',category:'insurance',
      discountPercent:5,patientCoPayPercent:20,companyCoveragePercent:80,
      currentBalance:0,creditLimit:1000,contactPerson:'',phone:'',active:true,notes:'',
    });
    const [url,args]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('/api/branch-pilot/stores/corporateContracts/cnt_1');
    expect(args.method).toBe('PUT');
  });
  it('archives with DELETE server request',async()=>{
    pilot();
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',store:'cultureResults',id:'c1',
    })}));
    vi.stubGlobal('fetch',fetcher);
    await connectedStore(db.cultureResults,'cultureResults').delete('c1');
    expect(fetcher.mock.calls[0][0]).toBe('/api/branch-pilot/stores/cultureResults/c1');
    expect((fetcher.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
  it('uses one transactional endpoint for QC bulk recalculation',async()=>{
    pilot();
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',store:'qcRuns',count:2,
    })}));
    vi.stubGlobal('fetch',fetcher);
    await connectedStore(db.qcRuns,'qcRuns').bulkPut([{id:'qc_1'},{id:'qc_2'}] as never);
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/branch-pilot/stores/qcRuns/bulk');
  });
  it('never exposes passwords from the MySQL users response',async()=>{
    pilot();
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',users:[{id:'u1',username:'doctor',role:'Doctor',passwordHash:''}],
    })})));
    const users=await usersRepository.getAllUsers();
    expect(users[0].passwordHash).toBe('');
  });
  it('rejects unauthorized or invalid server replies rather than local fallback',async()=>{
    pilot();
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({
      ok:false,error:'FORBIDDEN',
    })})));
    await expect(connectedStore(db.corporateContracts,'corporateContracts').toArray())
      .rejects.toThrow('FORBIDDEN');
  });
});
