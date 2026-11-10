import { db } from '../db/database';
import type { Doctor, DoctorCommission } from '../types';

export class DoctorsRepository {
  async getAll(): Promise<Doctor[]> {
    return db.doctors.toArray();
  }

  async getById(id: string): Promise<Doctor | undefined> {
    return db.doctors.get(id);
  }

  async save(doctor: Doctor): Promise<string> {
    return db.doctors.put(doctor);
  }

  async delete(id: string): Promise<void> {
    await db.doctors.delete(id);
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
