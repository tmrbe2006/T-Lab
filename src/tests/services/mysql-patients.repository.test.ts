import { afterEach, describe, expect, it, vi } from 'vitest';
import { patientsRepository } from '../../repositories/patients.repository';
import { db } from '../../db/database';
import type { Patient } from '../../types';

const original:Patient = {
  id:'pat_mysql_1',code:'PAT-1001',name:'MySQL Patient',nameEn:'',
  phone:'010',gender:'male',birthDate:'1990-01-01',age:36,
  nationalId:'',address:'',notes:'',hasDefaultDiscount:false,
  defaultDiscountType:'none',defaultDiscountValue:0,active:true,
  createdAt:'2026-11-20',
};
const respond = (status:number, data:unknown) => ({
  ok:status>=200 && status<300,status,
  json:async()=>data,
});
afterEach(()=>vi.unstubAllGlobals());

describe('live MySQL patients are never read from browser fallback in branch pilot',()=>{
  it('fails closed without a MySQL server and never writes a second browser copy',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'},localStorage:{getItem:()=>null}});
    const fetchMock=vi.fn().mockRejectedValue(new Error('SERVER_UNAVAILABLE'));
    vi.stubGlobal('fetch',fetchMock);
    await expect(patientsRepository.getAll()).rejects.toThrow('SERVER_UNAVAILABLE');
    expect(fetchMock).toHaveBeenCalled();
    expect(()=>db.patients.put(original)).toThrow('MYSQL_ONLY_WRITE_REQUIRES_AUTHORIZED_ATOMIC_API');
  });

  it('loads authoritative server records for the verified branch',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'},localStorage:{getItem:()=> 'mysql'}});
    const fetchMock=vi.fn().mockResolvedValue(respond(200,{ok:true,source:'mysql',patients:[original]}));
    vi.stubGlobal('fetch',fetchMock);
    expect(await patientsRepository.getAll()).toEqual([original]);
    expect(fetchMock).toHaveBeenCalledWith('/api/branch-pilot/patients',{
      method:'GET',credentials:'same-origin',cache:'no-store',headers:undefined,body:undefined,
    });
  });
  it('rejects missing migration and never substitutes an empty local list',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'},localStorage:{getItem:()=> 'mysql'}});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(respond(409,{ok:false,error:'PATIENT_BRANCH_MIGRATION_REQUIRED'})));
    await expect(patientsRepository.getAll()).rejects.toThrow('PATIENT_BRANCH_MIGRATION_REQUIRED');
  });
  it('rejects malformed or non-MySQL success responses',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'},localStorage:{getItem:()=> 'mysql'}});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(respond(200,{ok:true,patients:[original]})));
    await expect(patientsRepository.getAll()).rejects.toThrow('MYSQL_PATIENTS_RESPONSE_INVALID');
  });
  it('posts a new record to MySQL without writing to IndexedDB',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'},localStorage:{getItem:()=> 'mysql'}});
    const fetchMock=vi.fn().mockResolvedValueOnce(respond(200,{ok:true,source:'mysql',patients:[]}))
      .mockResolvedValueOnce(respond(201,{ok:true,patient:original}));
    vi.stubGlobal('fetch',fetchMock);
    expect(await patientsRepository.save(original)).toBe(original.id);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/branch-pilot/patients');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });
  it('edits an existing patient only via authenticated branch server API',async()=>{
    vi.stubGlobal('window',{location:{port:'3127'},localStorage:{getItem:()=> 'mysql'}});
    const fetchMock=vi.fn().mockResolvedValueOnce(respond(200,{ok:true,source:'mysql',patients:[original]}))
      .mockResolvedValueOnce(respond(200,{ok:true}));
    vi.stubGlobal('fetch',fetchMock);
    await patientsRepository.save({...original,name:'Updated'});
    expect(fetchMock.mock.calls[1][0]).toBe('/api/branch-pilot/patients/pat_mysql_1');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });
});
