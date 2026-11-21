import { payDoctorCommission } from '../../services/doctor-payout.service';
import { accountingRepository } from '../../repositories/accounting.repository';
import { createManualInvoice } from '../../services/manual-invoice.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordInvoiceReceipt } from '../../services/payment-processing.service';
import { createManualJournal } from '../../services/manual-journal.service';

afterEach(()=>vi.unstubAllGlobals());
describe('MySQL finance transactional client routing',()=>{
  it('posts a receipt to the server instead of Dexie',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    const invoice={id:'i1'};
    const payment={id:'p1'};
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',invoice,payment
    })}));
    vi.stubGlobal('fetch',fetcher);
    const result=await recordInvoiceReceipt({
      invoiceId:'i1',payerType:'patient',amount:15,method:'cash',actor:'forged',
      notes:'integration',
    });
    expect(result.invoice).toEqual(invoice);
    expect(result.payment).toEqual(payment);
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('/api/branch-pilot/finance/receipt');
    expect(options.method).toBe('POST');
    expect(JSON.stringify(options.body)).not.toContain('forged');
  });
  it('returns server-created balanced journal instead of browser generated IDs',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    const entry={id:'mysql-j1',totalDebit:100,totalCredit:100};
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',entry
    })}));
    vi.stubGlobal('fetch',fetcher);
    expect((await createManualJournal({
      date:'2026-11-21',descriptionAr:'اختبار',debitCode:'1201',
      creditCode:'4101',amount:100,
    },'untrusted-client')).id).toBe('mysql-j1');
    expect(fetcher.mock.calls[0][0]).toBe('/api/branch-pilot/finance/manual-journal');
  });
  it('creates manual invoices through server-side MySQL transactional API',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    const invoice={id:'inv_man_1',invoiceNumber:'INV-M-X'};
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true,source:'mysql',invoice})}));
    vi.stubGlobal('fetch',fetcher);
    expect((await createManualInvoice({
      patientId:'pat_1',date:'2026-11-21',serviceName:'CBC',
      price:200,discountAmount:15,taxRate:0,
    },'spoofed')).id).toBe('inv_man_1');
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('/api/branch-pilot/finance/manual-invoice');
    expect(options.method).toBe('POST');
    expect(JSON.stringify(options.body)).not.toContain('spoofed');
  });
  it('posts doctor payout with its journal on MySQL only',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    const commission={id:'com_1',status:'paid'};
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({ok:true,source:'mysql',commission})}));
    vi.stubGlobal('fetch',fetcher);
    expect((await payDoctorCommission('com_1','2026-11-21','note','طبيب','Doctor','spoofed')).id)
      .toBe('com_1');
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('/api/branch-pilot/finance/doctor-payout');
    expect(JSON.stringify(options.body)).not.toContain('spoofed');
  });
  it('requests a server calculated daily closing, ignoring UI totals',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({
      ok:true,source:'mysql',closing:{id:'dc_branch_main_20261121'},
    })}));
    vi.stubGlobal('fetch',fetcher);
    const id=await accountingRepository.saveDailyClosing({
      id:'local_wrong',netCashInBox:999999,
    } as never);
    expect(id).toBe('dc_branch_main_20261121');
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('/api/branch-pilot/finance/daily-close');
    expect(JSON.stringify(options.body)).not.toContain('999999');
  });
  it('refuses payment completion on a server error',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'}});
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({ok:false,error:'FORBIDDEN'})})));
    await expect(recordInvoiceReceipt({
      invoiceId:'i1',payerType:'patient',amount:15,method:'cash',actor:'x',notes:'',
    })).rejects.toThrow('FORBIDDEN');
  });
});
