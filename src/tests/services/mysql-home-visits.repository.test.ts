import { afterEach, describe, expect, it, vi } from 'vitest';
import { mysqlHomeVisitsRepository } from '../../repositories/home-visits.mysql.repository';

afterEach(()=>vi.unstubAllGlobals());
describe('Home visits MySQL-only API contract',()=>{
  it('loads branch-scoped rows exclusively from the MySQL endpoint',async()=>{
    const visit={id:'hv_1',patientId:'pt_1',status:'scheduled'};
    const fetchMock=vi.fn().mockResolvedValue({
      ok:true,json:async()=>({ok:true,source:'mysql',visits:[visit]}),
    });
    vi.stubGlobal('fetch',fetchMock);
    expect(await mysqlHomeVisitsRepository.getAll()).toEqual([visit]);
    expect(fetchMock).toHaveBeenCalledWith('/api/branch-pilot/home-visits',expect.objectContaining({
      method:'GET',credentials:'same-origin',cache:'no-store',
    }));
  });
  it('fails closed when the backend is unavailable',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('connection lost')));
    await expect(mysqlHomeVisitsRepository.getAll()).rejects.toThrow('connection lost');
  });
  it('rejects successful responses that are not explicitly MySQL-sourced',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({
      ok:true,json:async()=>({ok:true,source:'browser',visits:[]}),
    }));
    await expect(mysqlHomeVisitsRepository.getAll()).rejects.toThrow('HOME_VISITS_NOT_MYSQL');
  });
  it('uses a transactional server write instead of browser storage',async()=>{
    const fetchMock=vi.fn().mockResolvedValue({
      ok:true,json:async()=>({ok:true,source:'mysql'}),
    });
    vi.stubGlobal('fetch',fetchMock);
    await mysqlHomeVisitsRepository.save({id:'hv_1'} as never,true);
    expect(fetchMock).toHaveBeenCalledWith('/api/branch-pilot/home-visits/hv_1',expect.objectContaining({method:'PUT'}));
  });
});
