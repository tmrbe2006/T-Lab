import { db } from '../db/database';
import { financeMySQLRows, inMySQLFinancePilot, requireMySQLFinancialWrite } from './mysql-finance.read';
import { CacheService } from '../services/cache.service';
import type { Doctor, DoctorCommission } from '../types';

async function mysqlDoctors():Promise<Doctor[]>{
  const response=await fetch('/api/branch-pilot/doctors',{credentials:'same-origin',cache:'no-store'});
  const data=await response.json() as {ok?:boolean;source?:string;doctors?:Doctor[];error?:string};
  if(!response.ok||data.ok!==true)throw new Error(data.error||'MYSQL_DOCTORS_UNAVAILABLE');
  if(data.source!=='mysql'||!Array.isArray(data.doctors))throw new Error('MYSQL_DOCTORS_RESPONSE_INVALID');
  return data.doctors;
}

const DOCTORS_CACHE_KEY = 'doctors:all';
const DOCTOR_BY_ID_PREFIX = 'doctors:id:';

export class DoctorsRepository {
  async getAll(): Promise<Doctor[]> {
    return inMySQLFinancePilot() ? mysqlDoctors() : CacheService.get(DOCTORS_CACHE_KEY, () => db.doctors.toArray());
  }

  async getById(id: string): Promise<Doctor | undefined> {
    return inMySQLFinancePilot() ? (await mysqlDoctors()).find(d=>d.id===id) : CacheService.get(`${DOCTOR_BY_ID_PREFIX}${id}`, () => db.doctors.get(id));
  }

  async save(doctor: Doctor): Promise<string> {
    requireMySQLFinancialWrite();
    const res = await db.doctors.put(doctor);
    CacheService.invalidate(DOCTORS_CACHE_KEY);
    CacheService.invalidate(`${DOCTOR_BY_ID_PREFIX}${doctor.id}`);
    return res;
  }

  async delete(id: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.doctors.delete(id);
    CacheService.invalidate(DOCTORS_CACHE_KEY);
    CacheService.invalidate(`${DOCTOR_BY_ID_PREFIX}${id}`);
  }

  async getAllCommissions(): Promise<DoctorCommission[]> {
    const list = inMySQLFinancePilot() ? await financeMySQLRows<DoctorCommission>('commissions') : await db.commissions.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveCommission(commission: DoctorCommission): Promise<string> {
    requireMySQLFinancialWrite();
    return db.commissions.put(commission);
  }

  async deleteCommissionByInvoiceId(invoiceId: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.commissions.where('invoiceId').equals(invoiceId).delete();
  }
}

export const doctorsRepository = new DoctorsRepository();
