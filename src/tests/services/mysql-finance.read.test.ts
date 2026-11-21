import { afterEach, describe, expect, it, vi } from 'vitest';
import { financeMySQLRows, requireMySQLFinancialWrite } from '../../repositories/mysql-finance.read';

afterEach(()=>vi.unstubAllGlobals());
describe('MySQL financial source of truth',()=>{
  it('only accepts branch-scoped MySQL records from the server',async()=>{
    const fetchMock=vi.fn().mockResolvedValue({
      ok:true,json:async()=>({ok:true,source:'mysql',resource:'invoices',records:[{id:'inv_1'}]}),
    });
    vi.stubGlobal('fetch',fetchMock);
    expect(await financeMySQLRows('invoices')).toEqual([{id:'inv_1'}]);
    expect(fetchMock).toHaveBeenCalledWith('/api/branch-pilot/finance/invoices',
      expect.objectContaining({credentials:'same-origin',cache:'no-store',method:'GET'}));
  });
  it('rejects browser-backed and mismatched resource responses',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({
      ok:true,json:async()=>({ok:true,source:'browser',resource:'invoices',records:[]}),
    }));
    await expect(financeMySQLRows('invoices')).rejects.toThrow('MYSQL_FINANCE_SOURCE_INVALID');
  });
  it('fails visibly on database outage instead of using IndexedDB',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    await expect(financeMySQLRows('payments')).rejects.toThrow('offline');
  });
  it('blocks unported journal-affecting writes on Windows pilot',()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    expect(()=>requireMySQLFinancialWrite()).toThrow('MYSQL_FINANCE_WRITE_NOT_MIGRATED');
  });
});
