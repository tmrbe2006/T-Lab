import { db } from '../db/database';
import type { Patient } from '../types';

export class PatientsRepository {
  async getAll(): Promise<Patient[]> {
    return db.patients.toArray();
  }

  async getById(id: string): Promise<Patient | undefined> {
    return db.patients.get(id);
  }

  async save(patient: Patient): Promise<string> {
    return db.patients.put(patient);
  }

  async delete(id: string): Promise<void> {
    await db.patients.delete(id);
  }
}

export const patientsRepository = new PatientsRepository();
