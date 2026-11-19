import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
type ResultRow = RowDataPacket & { status: string; raw_json: string; patient_id: string; test_id: string };
type PatientRow = RowDataPacket & { gender: string | null; birth_date: string | null; age: number | null };
type ParameterRow = RowDataPacket & {
  id: string; unit: string | null; result_type: string | null;
  normal_male_min: string | null; normal_male_max: string | null;
  normal_female_min: string | null; normal_female_max: string | null;
  critical_low: string | null; critical_high: string | null;
};

/**
 * A deliberately conservative preflight. Existing legacy reference fields cannot
 * establish pediatric/pregnancy/specimen-specific clinical reference validation.
 * This method never authorizes clinical approval or patient-facing release.
 */
export class ClinicalPreflightStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async inspect(id: string, reviewerId: string) {
    if (!validId(id) || !validId(reviewerId)) throw new Error('Invalid identifiers');
    const db = await this.connect();
    try {
      const [results] = await db.execute<ResultRow[]>(
        'SELECT status, raw_json, patient_id, test_id FROM lab_results WHERE id = ? LIMIT 1', [id],
      );
      if (!results[0]) return null;
      const result = results[0];
      const reasons: string[] = [];
      if (result.status !== 'pending_review') reasons.push('RESULT_NOT_PENDING_REVIEW');
      let saved: Record<string, unknown> | null = null;
      try { saved = JSON.parse(String(result.raw_json || '')) as Record<string, unknown>; }
      catch { reasons.push('RESULT_SNAPSHOT_INVALID'); }
      if (!saved || saved.id !== id || !Array.isArray(saved.values) ||
          saved.patientId !== result.patient_id || saved.testId !== result.test_id) {
        reasons.push('RESULT_SNAPSHOT_INVALID');
      }
      if (saved?.enteredBy === reviewerId) reasons.push('INDEPENDENT_REVIEWER_REQUIRED');
      if (saved?.clinicalValidation !== 'NOT_REVIEWED') reasons.push('CLINICAL_SNAPSHOT_INCONSISTENT');

      const [patients] = await db.execute<PatientRow[]>(
        'SELECT gender, birth_date, age FROM patients WHERE id = ? LIMIT 1', [result.patient_id],
      );
      if (patients.length !== 1) reasons.push('PATIENT_NOT_FOUND');
      const patient = patients[0];
      if (patient && !['Male','Female','male','female','M','F'].includes(String(patient.gender))) {
        reasons.push('PATIENT_SEX_NOT_VALIDATED');
      }
      const birth = String(patient?.birth_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(birth + 'T00:00:00Z'))) {
        reasons.push('PATIENT_BIRTH_DATE_NOT_VALIDATED');
      }

      const [params] = await db.execute<ParameterRow[]>(
        'SELECT id, unit, result_type, normal_male_min, normal_male_max, normal_female_min, normal_female_max, critical_low, critical_high ' +
        'FROM test_parameters WHERE test_id = ? AND active = 1 AND is_calculated = 0',
        [result.test_id],
      );
      if (!params.length) reasons.push('NO_ACTIVE_PARAMETERS');
      const values = Array.isArray(saved?.values) ? saved.values as Array<{parameterId?: string}> : [];
      if (values.length !== params.length || params.some(p => !values.some(v => v.parameterId === p.id))) {
        reasons.push('PARAMETER_SET_MISMATCH');
      }
      if (params.some(p => !p.unit || String(p.unit).trim() === '')) reasons.push('PARAMETER_UNIT_UNVERIFIED');
      // Legacy schema contains generic male/female numeric limits but does not
      // capture a versioned, clinician-approved reference interval per age/specimen.
      reasons.push('AGE_AND_SPECIMEN_REFERENCE_INTERVALS_NOT_VALIDATED');
      reasons.push('CRITICAL_LIMIT_ESCALATION_NOT_VALIDATED');
      reasons.push('ANALYZER_QC_AND_SECOND_SIGNOFF_NOT_VALIDATED');
      return {
        resultId: id,
        status: 'blocked' as const,
        releaseAllowed: false as const,
        reasons: [...new Set(reasons)],
        referenceIntervalSource: 'legacy_unverified' as const,
      };
    } finally { await db.end(); }
  }
}

export function installClinicalPreflightRoutes(
  app: Express, store: ClinicalPreflightStore, grants: ServerPermissionStore, identity: IdentityResolver,
): void {
  app.get('/api/v2/results/:id/clinical-preflight', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await grants.can(actor.role, 'results', 'view'))) {
        return res.status(403).json({ ok: false });
      }
      if (!validId(req.params.id)) return res.status(400).json({ ok: false });
      const report = await store.inspect(req.params.id, actor.userId);
      if (!report) return res.status(404).json({ ok: false });
      return res.json({ ok: true, report });
    } catch {
      return res.status(503).json({ ok: false, error: 'Clinical preflight cannot be completed' });
    }
  });
}
