import { db } from '../db/database';
import { allMySQLStoreRows, useMySQLStore, refuseUnmigratedMySQLWrite } from './mysql-all-stores.read';
import { buildGlobalCatalogRecords } from '../db/global-medical-tests';
import type { LabRequest, LabResult, ParameterResultValue, RequestItem, Sample, TestParameter } from '../types';

export function formatNumericRefRange(p: TestParameter, isFemale = false): string {
  const minVal = Number(isFemale && Number(p.normalFemaleMax) > 0 ? p.normalFemaleMin : p.normalMaleMin);
  const maxVal = Number(isFemale && Number(p.normalFemaleMax) > 0 ? p.normalFemaleMax : p.normalMaleMax);
  if (Number.isFinite(maxVal) && maxVal > 0) {
    if (!Number.isFinite(minVal) || minVal <= 0) {
      return `Up to ${maxVal}`;
    }
    const dec = p.decimalPlaces ?? (String(minVal).includes('.') || String(maxVal).includes('.') ? 2 : 0);
    const minStr = dec > 0 ? minVal.toFixed(dec) : String(minVal);
    const maxStr = dec > 0 ? maxVal.toFixed(dec) : String(maxVal);
    return `${minStr} - ${maxStr}`;
  }
  if (p.normalRangeText && p.normalRangeText.trim() !== '' && p.normalRangeText !== 'Normal') {
    return p.normalRangeText;
  }
  return 'Normal';
}

function buildInitialResultValues(
  prms: TestParameter[],
  _fallbackNameAr: string,
  fallbackNameEn: string,
  testId: string,
  isFemale = false
): ParameterResultValue[] {
  const cleanFallbackEn = (fallbackNameEn || 'Test Result').trim();
  if (prms.length === 0) {
    return [
      {
        parameterId: `prm_auto_${testId}`,
        parameterNameAr: cleanFallbackEn,
        parameterNameEn: cleanFallbackEn,
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
      const cleanParamEn = (p.nameEn || p.nameAr || cleanFallbackEn).trim();
      if (p.resultType === 'select' || p.resultType === 'text' || p.resultType === 'boolean') {
        const textVal = p.options && p.options.length > 0 ? p.options[0] : p.normalRangeText || 'Negative';
        return {
          parameterId: p.id,
          parameterNameAr: cleanParamEn,
          parameterNameEn: cleanParamEn,
          value: textVal,
          unit: p.unit && p.unit !== '-' ? p.unit : '',
          normalRange: p.normalRangeText || 'Negative',
          flag: 'normal' as const,
        };
      }
      const minVal = Number(isFemale && Number(p.normalFemaleMax) > 0 ? p.normalFemaleMin : p.normalMaleMin) || 0;
      const maxVal = Number(isFemale && Number(p.normalFemaleMax) > 0 ? p.normalFemaleMax : p.normalMaleMax) || 0;
      const midVal =
        maxVal > 0
          ? Number(((minVal + maxVal) / 2).toFixed(p.decimalPlaces ?? 1))
          : 0;
      return {
        parameterId: p.id,
        parameterNameAr: cleanParamEn,
        parameterNameEn: cleanParamEn,
        value: midVal,
        unit: p.unit || '',
        normalRange: formatNumericRefRange(p, isFemale),
        flag: 'normal' as const,
      };
    });
}

export class RequestsRepository {
  async getAllRequests(): Promise<LabRequest[]> {
    const list = useMySQLStore() ? await allMySQLStoreRows<LabRequest>('requests') : await db.requests.toArray();
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRequestById(id: string): Promise<LabRequest | undefined> {
    return useMySQLStore() ? (await this.getAllRequests()).find(x=>x.id===id) : db.requests.get(id);
  }

  async getRequestItems(requestId: string): Promise<RequestItem[]> {
    return useMySQLStore() ? (await allMySQLStoreRows<RequestItem>('requestItems')).filter(x=>x.requestId===requestId) : db.requestItems.where('requestId').equals(requestId).toArray();
  }

  async saveRequest(request: LabRequest, items: RequestItem[]): Promise<void> {
    refuseUnmigratedMySQLWrite();
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
   * and heals any results that were created with missing units or 'Normal' placeholder ranges.
   */
  async ensureDraftResultsForAllRequests(): Promise<void> {
    // Generating clinical results locally is forbidden in the MySQL pilot.
    if(useMySQLStore())return;
    const [requests, allRequestItems, allSamples, existingResults, allTests, allParams, allPatients] = await Promise.all([
      db.requests.toArray(),
      db.requestItems.toArray(),
      db.samples.toArray(),
      db.results.toArray(),
      db.tests.toArray(),
      db.testParameters.toArray(),
      db.patients.toArray(),
    ]);

    if (requests.length === 0 && existingResults.length === 0) return;

    const patientMap = new Map(allPatients.map((pt) => [pt.id, pt]));
    const testMap = new Map(allTests.map((t) => [t.id, t]));
    const paramsByTestId = new Map<string, TestParameter[]>();
    for (const p of allParams) {
      if (p.active === false) continue;
      const list = paramsByTestId.get(p.testId) || [];
      list.push(p);
      paramsByTestId.set(p.testId, list);
    }

    // Build global catalog fallback by test ID and test Code (e.g. 'FBS', 'CBC', 'UREA', 'CREAT', 'AST', 'ALT')
    const { tests: globalTests, testParameters: globalParams } = buildGlobalCatalogRecords();
    const globalTestByCode = new Map(globalTests.map((gt) => [gt.code.toUpperCase(), gt]));
    const globalParamsByTestId = new Map<string, TestParameter[]>();
    for (const gp of globalParams) {
      const list = globalParamsByTestId.get(gp.testId) || [];
      list.push(gp);
      globalParamsByTestId.set(gp.testId, list);
    }

    const paramsToPersist: TestParameter[] = [];
    const resolveParamsForTest = (testId: string): TestParameter[] => {
      const existing = paramsByTestId.get(testId);
      if (existing && existing.length > 0) return existing;

      const tst = testMap.get(testId);
      const codeUpper = tst?.code?.toUpperCase() || '';
      const matchedGlobalTest =
        globalTests.find((gt) => gt.id === testId) ||
        (codeUpper ? globalTestByCode.get(codeUpper) : undefined);

      if (matchedGlobalTest) {
        const gList = globalParamsByTestId.get(matchedGlobalTest.id) || [];
        if (gList.length > 0) {
          const cloned = gList.map((gp, idx) => ({
            ...gp,
            id: `${testId}_prm_${idx + 1}`,
            testId,
          }));
          paramsByTestId.set(testId, cloned);
          paramsToPersist.push(...cloned);
          return cloned;
        }
      }
      return [];
    };

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
    const resultsToHeal: LabResult[] = [];

    // Heal any existing results that had placeholder 'Normal' or missing unit or wrong critical flag
    for (const res of existingResults) {
      const prms = resolveParamsForTest(res.testId);
      if (prms.length === 0) continue;
      const pat = patientMap.get(res.patientId);
      const isFemale = pat?.gender === 'female';
      let changed = false;

      const updatedValues = res.values.map((v, idx) => {
        const matchedParam =
          prms.find((p) => p.id === v.parameterId) ||
          prms.find((p) => p.nameEn.toLowerCase() === v.parameterNameEn.toLowerCase()) ||
          prms[idx] ||
          prms[0];
        if (!matchedParam) return v;

        const hasArabicName = /[\u0600-\u06FF]/.test(v.parameterNameAr || '');
        const isPlaceholder =
          v.parameterId.startsWith('prm_auto_') ||
          hasArabicName ||
          !v.unit ||
          v.normalRange === 'Normal' ||
          v.normalRange === '';

        if (!isPlaceholder) return v;

        const cleanParamEn = (matchedParam.nameEn || v.parameterNameEn || matchedParam.code).trim();
        const nextUnit = matchedParam.unit && matchedParam.unit !== '-' ? matchedParam.unit : v.unit;
        const nextRange =
          matchedParam.resultType === 'numeric' || Number(matchedParam.normalMaleMax) > 0
            ? formatNumericRefRange(matchedParam, isFemale)
            : matchedParam.normalRangeText || v.normalRange;

        let nextFlag = v.flag;
        const parsedNum = Number(v.value);
        if (Number.isFinite(parsedNum) && (matchedParam.resultType === 'numeric' || Number(matchedParam.normalMaleMax) > 0)) {
          const minNorm = Number(isFemale && Number(matchedParam.normalFemaleMax) > 0 ? matchedParam.normalFemaleMin : matchedParam.normalMaleMin) || 0;
          const maxNorm = Number(isFemale && Number(matchedParam.normalFemaleMax) > 0 ? matchedParam.normalFemaleMax : matchedParam.normalMaleMax) || 0;
          const critLow = Number(matchedParam.criticalLow) || 0;
          const critHigh = Number(matchedParam.criticalHigh) || 0;

          if (critHigh > 0 && parsedNum >= critHigh) nextFlag = 'critical_high';
          else if (critLow > 0 && parsedNum <= critLow) nextFlag = 'critical_low';
          else if (maxNorm > 0 && parsedNum > maxNorm) nextFlag = 'high';
          else if (minNorm > 0 && parsedNum < minNorm) nextFlag = 'low';
          else nextFlag = 'normal';
        }

        changed = true;
        return {
          ...v,
          parameterId: matchedParam.id,
          parameterNameAr: cleanParamEn,
          parameterNameEn: cleanParamEn,
          unit: nextUnit,
          normalRange: nextRange,
          flag: nextFlag,
        };
      });

      if (changed) {
        resultsToHeal.push({
          ...res,
          values: updatedValues,
        });
      }
    }

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

      const pat = patientMap.get(req.patientId);
      const isFemale = pat?.gender === 'female';

      // Create missing LabResult records for each RequestItem in this request
      for (const item of reqItems) {
        const key = `${req.id}_${item.testId}`;
        if (existingResultKeys.has(key)) continue;

        const tst = testMap.get(item.testId);
        const prms = resolveParamsForTest(item.testId);
        const initialValues = buildInitialResultValues(
          prms,
          tst?.nameAr || 'نتيجة التحليل',
          tst?.nameEn || 'Test Result',
          item.testId,
          isFemale
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

    if (
      paramsToPersist.length > 0 ||
      newSamplesToInsert.length > 0 ||
      newResultsToInsert.length > 0 ||
      resultsToHeal.length > 0 ||
      requestsToUpdate.length > 0
    ) {
      await db.transaction('rw', [db.testParameters, db.samples, db.results, db.requests], async () => {
        if (paramsToPersist.length > 0) {
          await db.testParameters.bulkPut(paramsToPersist);
        }
        if (newSamplesToInsert.length > 0) {
          await db.samples.bulkPut(newSamplesToInsert);
        }
        if (newResultsToInsert.length > 0) {
          await db.results.bulkPut(newResultsToInsert);
        }
        if (resultsToHeal.length > 0) {
          await db.results.bulkPut(resultsToHeal);
        }
        if (requestsToUpdate.length > 0) {
          await db.requests.bulkPut(requestsToUpdate);
        }
      });
    }
  }

  async deleteRequest(id: string): Promise<void> {
    refuseUnmigratedMySQLWrite();
    await db.transaction('rw', [db.requests, db.requestItems, db.samples, db.results], async () => {
      await db.requestItems.where('requestId').equals(id).delete();
      await db.samples.where('requestId').equals(id).delete();
      await db.results.where('requestId').equals(id).delete();
      await db.requests.delete(id);
    });
  }

  async getAllSamples(): Promise<Sample[]> {
    return useMySQLStore() ? allMySQLStoreRows<Sample>('samples') : db.samples.toArray();
  }

  async saveSample(sample: Sample): Promise<string> {
    refuseUnmigratedMySQLWrite();
    const res = await db.samples.put(sample);
    if (sample.status === 'received') {
      await this.ensureDraftResultsForAllRequests();
    }
    return res;
  }

  async deleteSample(id: string): Promise<void> {
    refuseUnmigratedMySQLWrite();
    await db.samples.delete(id);
  }

  async getAllResults(): Promise<LabResult[]> {
    await this.ensureDraftResultsForAllRequests();
    const list = useMySQLStore() ? await allMySQLStoreRows<LabResult>('results') : await db.results.toArray();
    return list.sort((a, b) => {
      // Put newly created request results (res_req_...) and recent enteredAt first
      const aIsNew = a.id.startsWith('res_req_') ? 1 : 0;
      const bIsNew = b.id.startsWith('res_req_') ? 1 : 0;
      if (aIsNew !== bIsNew) return bIsNew - aIsNew;
      return (b.enteredAt || '').localeCompare(a.enteredAt || '');
    });
  }

  async saveResult(result: LabResult): Promise<string> {
    refuseUnmigratedMySQLWrite();
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
    refuseUnmigratedMySQLWrite();
    await db.results.delete(id);
  }
}

export const requestsRepository = new RequestsRepository();

