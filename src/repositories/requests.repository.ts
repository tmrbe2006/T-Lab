import { db } from '../db/database';
import type { LabRequest, LabResult, ParameterResultValue, RequestItem, Sample, TestParameter } from '../types';

function buildInitialResultValues(prms: TestParameter[], fallbackNameAr: string, fallbackNameEn: string, testId: string): ParameterResultValue[] {
  if (prms.length === 0) {
    return [
      {
        parameterId: `prm_auto_${testId}`,
        parameterNameAr: fallbackNameAr,
        parameterNameEn: fallbackNameEn,
        value: 'Normal',
        unit: '',
        normalRange: 'Normal',
        flag: 'normal',
      },
    ];
  }

  return prms
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((p) => {
      if (p.resultType === 'select' || p.resultType === 'text' || p.resultType === 'boolean') {
        const textVal = p.options && p.options.length > 0 ? p.options[0] : p.normalRangeText || 'Normal';
        return {
          parameterId: p.id,
          parameterNameAr: p.nameAr,
          parameterNameEn: p.nameEn,
          value: textVal,
          unit: p.unit || '',
          normalRange: p.normalRangeText || 'Normal',
          flag: 'normal' as const,
        };
      }
      const midVal =
        p.normalMaleMin !== undefined && p.normalMaleMax !== undefined && p.normalMaleMax > 0
          ? Number(((p.normalMaleMin + p.normalMaleMax) / 2).toFixed(p.decimalPlaces ?? 1))
          : 0;
      return {
        parameterId: p.id,
        parameterNameAr: p.nameAr,
        parameterNameEn: p.nameEn,
        value: midVal,
        unit: p.unit || '',
        normalRange: p.normalRangeText || `${p.normalMaleMin} - ${p.normalMaleMax}`,
        flag: 'normal' as const,
      };
    });
}

export class RequestsRepository {
  async getAllRequests(): Promise<LabRequest[]> {
    const list = await db.requests.toArray();
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRequestById(id: string): Promise<LabRequest | undefined> {
    return db.requests.get(id);
  }

  async getRequestItems(requestId: string): Promise<RequestItem[]> {
    return db.requestItems.where('requestId').equals(requestId).toArray();
  }

  async saveRequest(request: LabRequest, items: RequestItem[]): Promise<void> {
    await db.transaction('rw', [db.requests, db.requestItems], async () => {
      await db.requests.put(request);
      await db.requestItems.where('requestId').equals(request.id).delete();
      if (items.length > 0) {
        await db.requestItems.bulkPut(items);
      }
    });
    await this.ensureDraftResultsForAllRequests();
  }

  /**
   * Ensures every active LabRequest that has a received Sample (or newly created request)
   * has corresponding LabResult rows in `db.results` for each requested test (`RequestItem`),
   * so that patients whose samples are received always appear in Results Entry (`#/results`).
   */
  async ensureDraftResultsForAllRequests(): Promise<void> {
    const [requests, allRequestItems, allSamples, existingResults, allTests, allParams] = await Promise.all([
      db.requests.toArray(),
      db.requestItems.toArray(),
      db.samples.toArray(),
      db.results.toArray(),
      db.tests.toArray(),
      db.testParameters.toArray(),
    ]);

    if (requests.length === 0) return;

    const testMap = new Map(allTests.map((t) => [t.id, t]));
    const paramsByTestId = new Map<string, TestParameter[]>();
    for (const p of allParams) {
      if (p.active === false) continue;
      const list = paramsByTestId.get(p.testId) || [];
      list.push(p);
      paramsByTestId.set(p.testId, list);
    }

    const itemsByReqId = new Map<string, RequestItem[]>();
    for (const it of allRequestItems) {
      const list = itemsByReqId.get(it.requestId) || [];
      list.push(it);
      itemsByReqId.set(it.requestId, list);
    }

    const samplesByReqId = new Map<string, Sample[]>();
    for (const s of allSamples) {
      const list = samplesByReqId.get(s.requestId) || [];
      list.push(s);
      samplesByReqId.set(s.requestId, list);
    }

    const existingResultKeys = new Set(existingResults.map((r) => `${r.requestId}_${r.testId}`));
    const newResultsToInsert: LabResult[] = [];
    const newSamplesToInsert: Sample[] = [];
    const requestsToUpdate: LabRequest[] = [];

    for (const req of requests) {
      if (req.status === 'cancelled' || req.status === 'rejected') continue;

      const reqItems = itemsByReqId.get(req.id) || [];
      const reqSamples = samplesByReqId.get(req.id) || [];

      // If a request has no sample record yet, auto-create one as 'received'
      if (reqSamples.length === 0 && reqItems.length > 0) {
        const firstTest = testMap.get(reqItems[0].testId);
        const autoSample: Sample = {
          id: `smp_auto_${req.id}`,
          sampleCode: `SMP-${req.requestNumber.replace('REQ-', '')}`,
          requestId: req.id,
          patientId: req.patientId,
          sampleType: firstTest?.sampleType || 'Blood / Serum',
          tubeType: firstTest?.tubeType || 'Plain Tube (Red)',
          status: 'received',
          receivedAt: `${req.createdAt} 10:00`,
          receivedBy: req.createdBy || 'technician',
        };
        newSamplesToInsert.push(autoSample);
        reqSamples.push(autoSample);
      }

      const hasReceivedSample = reqSamples.some((s) => s.status === 'received');
      if (!hasReceivedSample) continue;

      // Sync request status from awaiting_sample -> sample_received when sample is received
      if (req.status === 'awaiting_sample' || req.status === 'draft') {
        req.status = 'sample_received';
        requestsToUpdate.push(req);
      }

      // Create missing LabResult records for each RequestItem in this request
      for (const item of reqItems) {
        const key = `${req.id}_${item.testId}`;
        if (existingResultKeys.has(key)) continue;

        const tst = testMap.get(item.testId);
        const prms = paramsByTestId.get(item.testId) || [];
        const initialValues = buildInitialResultValues(
          prms,
          tst?.nameAr || 'نتيجة التحليل',
          tst?.nameEn || 'Test Result',
          item.testId
        );

        const newResult: LabResult = {
          id: `res_${req.id}_${item.testId}`,
          requestId: req.id,
          testId: item.testId,
          patientId: req.patientId,
          status: 'draft',
          values: initialValues,
          enteredBy: req.createdBy || 'chemist',
          enteredAt: `${req.createdAt} 10:30`,
          notes: '',
        };
        newResultsToInsert.push(newResult);
        existingResultKeys.add(key);
      }
    }

    if (newSamplesToInsert.length > 0 || newResultsToInsert.length > 0 || requestsToUpdate.length > 0) {
      await db.transaction('rw', [db.samples, db.results, db.requests], async () => {
        if (newSamplesToInsert.length > 0) {
          await db.samples.bulkPut(newSamplesToInsert);
        }
        if (newResultsToInsert.length > 0) {
          await db.results.bulkPut(newResultsToInsert);
        }
        if (requestsToUpdate.length > 0) {
          await db.requests.bulkPut(requestsToUpdate);
        }
      });
    }
  }

  async deleteRequest(id: string): Promise<void> {
    await db.transaction('rw', [db.requests, db.requestItems, db.samples, db.results], async () => {
      await db.requestItems.where('requestId').equals(id).delete();
      await db.samples.where('requestId').equals(id).delete();
      await db.results.where('requestId').equals(id).delete();
      await db.requests.delete(id);
    });
  }

  async getAllSamples(): Promise<Sample[]> {
    return db.samples.toArray();
  }

  async saveSample(sample: Sample): Promise<string> {
    const res = await db.samples.put(sample);
    if (sample.status === 'received') {
      await this.ensureDraftResultsForAllRequests();
    }
    return res;
  }

  async deleteSample(id: string): Promise<void> {
    await db.samples.delete(id);
  }

  async getAllResults(): Promise<LabResult[]> {
    await this.ensureDraftResultsForAllRequests();
    const list = await db.results.toArray();
    return list.sort((a, b) => {
      // Put newly created request results (res_req_...) and recent enteredAt first
      const aIsNew = a.id.startsWith('res_req_') ? 1 : 0;
      const bIsNew = b.id.startsWith('res_req_') ? 1 : 0;
      if (aIsNew !== bIsNew) return bIsNew - aIsNew;
      return (b.enteredAt || '').localeCompare(a.enteredAt || '');
    });
  }

  async saveResult(result: LabResult): Promise<string> {
    if (!result.enteredAt) {
      result.enteredAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    }
    const savedId = await db.results.put(result);
    // Also update parent request status based on results progress
    try {
      const req = await db.requests.get(result.requestId);
      if (req && req.status !== 'cancelled' && req.status !== 'rejected') {
        const siblingResults = await db.results.where('requestId').equals(result.requestId).toArray();
        const allApproved = siblingResults.length > 0 && siblingResults.every((r) => r.status === 'approved');
        const anyPendingReview = siblingResults.some((r) => r.status === 'pending_review');
        const nextStatus: LabRequest['status'] = allApproved
          ? 'approved'
          : anyPendingReview
          ? 'awaiting_approval'
          : 'in_analysis';
        if (req.status !== nextStatus) {
          req.status = nextStatus;
          await db.requests.put(req);
        }
      }
    } catch {
      // ignore
    }
    return savedId;
  }

  async deleteResult(id: string): Promise<void> {
    await db.results.delete(id);
  }
}

export const requestsRepository = new RequestsRepository();

