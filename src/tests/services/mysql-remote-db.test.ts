import {createHash} from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMysqlRemoteDatabase } from '../../db/mysql-remote-db';

afterEach(()=>vi.unstubAllGlobals());
const reply=(value:Record<string,unknown>,status=200)=>({
  ok:status<400,status,json:async()=>value,
});
function fake(records:Record<string,Array<{id:string;[key:string]:unknown}>>){
  const requests:Array<{url:string;method:string;body:Record<string,unknown>|undefined}>=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
    const method=options.method||'GET';
    const body=options.body?JSON.parse(String(options.body)) as Record<string,unknown>:undefined;
    requests.push({url,method,body});
    if(method==='GET'){
      const name=url.split('/').at(-1)!;
      const rows=records[name]||[];
      const revisions=Object.fromEntries(rows.map(row=>[String(row.id),createHash('sha256').update(JSON.stringify(row)).digest('hex')]));
      return reply({ok:true,source:'mysql',store:name,records:rows,revisions});
    }
    return reply({ok:true,source:'mysql',count:((body?.commands as unknown[])||[]).length});
  }));
  return requests;
}
describe('Windows 3127 MySQL-only facade',()=>{
  it('reads rows through authenticated MySQL, not Dexie',async()=>{
    const requests=fake({inventoryItems:[{id:'i1',code:'REAG-1',stock:2}]});
    const db=createMysqlRemoteDatabase();
    expect((await db.inventoryItems.toArray())[0].code).toBe('REAG-1');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('/api/branch-pilot/unified/inventoryItems');
  });
  it('sends related inventory, purchase and journal changes as one atomic SQL request',async()=>{
    const requests=fake({suppliers:[],purchaseInvoices:[],journalEntries:[]});
    const db=createMysqlRemoteDatabase();
    await db.transaction('rw',db.suppliers,db.purchaseInvoices,db.journalEntries,async()=>{
      await db.suppliers.add({id:'sup1',code:'S1'} as never);
      await db.purchaseInvoices.add({id:'pi1',supplierId:'sup1'} as never);
      await db.journalEntries.add({id:'je1',lines:[]} as never);
    });
    const posts=requests.filter(x=>x.method==='POST');
    expect(posts).toHaveLength(1);
    expect((posts[0].body?.commands as unknown[])).toHaveLength(3);
    expect(posts[0].url).toContain('/unified/transaction');
  });
  it('does not send any mutation after client transaction throws',async()=>{
    const requests=fake({invoices:[],payments:[]});
    const db=createMysqlRemoteDatabase();
    await expect(db.transaction('rw',db.invoices,db.payments,async()=>{
      await db.invoices.add({id:'inv1'} as never);
      throw new Error('INVALID_DISCOUNT');
    })).rejects.toThrow('INVALID_DISCOUNT');
    expect(requests.filter(x=>x.method==='POST')).toHaveLength(0);
  });
  it('reads pending transaction changes before SQL commit',async()=>{
    fake({inventoryLots:[{id:'lot1',remainingQty:10}]});
    const db=createMysqlRemoteDatabase();
    await db.transaction('rw',db.inventoryLots,async()=>{
      const original=await db.inventoryLots.get('lot1');
      await db.inventoryLots.put({...original,remainingQty:5} as never);
      expect((await db.inventoryLots.get('lot1'))?.remainingQty).toBe(5);
    });
  });
  it('refuses connection errors without substituting browser data',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>reply({ok:false,error:'MYSQL_UNAVAILABLE'},503)));
    const db=createMysqlRemoteDatabase();
    await expect(db.results.toArray()).rejects.toThrow('MYSQL_UNAVAILABLE');
  });
  it('forbids mass deletion of a clinical store',async()=>{
    fake({results:[{id:'r1'}]});
    const db=createMysqlRemoteDatabase();
    await expect(db.results.clear()).rejects.toThrow('MYSQL_MASS_DELETE_FORBIDDEN');
  });
});
