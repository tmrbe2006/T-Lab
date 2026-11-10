import { db } from '../db/database';
import { CacheService } from '../services/cache.service';
import type { Doctor, DoctorCommission } from '../types';

const DOCTORS_CACHE_KEY = 'doctors:all';
const DOCTOR_BY_ID_PREFIX = 'doctors:id:';

export class DoctorsRepository {
  async getAll(): Promise<Doctor[]> {
    return CacheService.get(DOCTORS_CACHE_KEY, () => db.doctors.toArray());
  }

  async getById(id: string): Promise<Doctor | undefined> {
    return CacheService.get(`${DOCTOR_BY_ID_PREFIX}${id}`, () => db.doctors.get(id));
  }

  async save(doctor: Doctor): Promise<string> {
    const res = await db.doctors.put(doctor);
    CacheService.invalidate(DOCTORS_CACHE_KEY);
    CacheService.invalidate(`${DOCTOR_BY_ID_PREFIX}${doctor.id}`);
    return res;
  }

  async delete(id: string): Promise<void> {
    await db.doctors.delete(id);
    CacheService.invalidate(DOCTORS_CACHE_KEY);
    CacheService.invalidate(`${DOCTOR_BY_ID_PREFIX}${id}`);
  }

  async getAllCommissions(): Promise<DoctorCommission[]> {
    const list = await db.commissions.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveCommission(commission: DoctorCommission): Promise<string> {
    return db.commissions.put(commission);
  }

  async deleteCommissionByInvoiceId(invoiceId: string): Promise<void> {
    await db.commissions.where('invoiceId').equals(invoiceId).delete();
  }
}

export const doctorsRepository = new DoctorsRepository();
