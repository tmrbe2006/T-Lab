import { db } from '../db/database';
import type { Patient } from '../types';

/**
 * Compatibility recovery: old patients are in this browser's IndexedDB, while
 * some installations have an EMPTY MySQL patients table and no branch mapping.
 * The isolated Windows 3127 pilot must read MySQL only, and fail visibly when
 * MySQL is unavailable. Other installations retain legacy data until a
 * separately verified migration; do not delete the old browser database.
 */
const pilot = () => typeof window !== 'undefined' &&
  window.location.port === '3127';
async function mysqlPatients<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const result = await fetch('/api/branch-pilot/patients' + path, {
    method, credentials:'same-origin', cache:'no-store',
    headers: body===undefined ? undefined : {'Content-Type':'application/json'},
    body: body===undefined ? undefined : JSON.stringify(body),
  });
  let json: {ok?:boolean;error?:string;patients?:Patient[]};
  try { json = await result.json() as typeof json; }
  catch { throw new Error('MYSQL_PATIENTS_RESPONSE_INVALID'); }
  if(!result.ok || json.ok!==true) {
    throw new Error(json.error || 'MYSQL_PATIENTS_UNAVAILABLE');
  }
  return json as T;
}

export class PatientsRepository {
  async getAll(): Promise<Patient[]> {
    if (pilot()) {
      const response = await mysqlPatients<{ok:true;source:'mysql';patients:Patient[]}>('');
      if(response.source!=='mysql' || !Array.isArray(response.patients)) throw new Error('MYSQL_PATIENTS_RESPONSE_INVALID');
      return response.patients;
    }
    return db.patients.toArray();
  }

  async getById(id: string): Promise<Patient | undefined> {
    if(pilot()) return (await this.getAll()).find(p=>p.id===id);
    return db.patients.get(id);
  }

  async save(patient: Patient): Promise<string> {
    if(pilot()) {
      const exists=(await this.getById(patient.id))!==undefined;
      await mysqlPatients(exists ? '/' + encodeURIComponent(patient.id) : '', exists ? 'PUT' : 'POST', {patient});
      return patient.id;
    }
    return db.patients.put(patient);
  }

  async delete(id: string): Promise<void> {
    if(pilot()) {
      await mysqlPatients('/'+encodeURIComponent(id),'DELETE');
      return;
    }
    await db.patients.delete(id);
  }
}

export const patientsRepository = new PatientsRepository();
