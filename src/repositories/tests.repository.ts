import { db } from '../db/database';
import { allMySQLStoreRows, useMySQLStore, refuseUnmigratedMySQLWrite } from './mysql-all-stores.read';
import { syncGlobalMedicalCatalog } from '../db/global-medical-tests';
import { CacheService } from '../services/cache.service';
import type { LabTest, TestParameter } from '../types';

const TESTS_CACHE_KEY = 'catalog:tests:all';
const PARAMS_ALL_CACHE_KEY = 'catalog:params:all';
const PARAM_BY_TEST_PREFIX = 'catalog:params:test:';

export class TestsRepository {
  async getAllTests(): Promise<LabTest[]> {
    if(!useMySQLStore()) await syncGlobalMedicalCatalog(false);
    return useMySQLStore() ? allMySQLStoreRows<LabTest>('tests') : CacheService.get(TESTS_CACHE_KEY, () => db.tests.toArray());
  }

  async getTestById(id: string): Promise<LabTest | undefined> {
    const all = await this.getAllTests();
    return useMySQLStore() ? all.find(t=>t.id===id) : all.find((t) => t.id === id) ?? (await db.tests.get(id));
  }

  async saveTest(test: LabTest): Promise<string> {
    refuseUnmigratedMySQLWrite();
    const res = await db.tests.put(test);
    CacheService.invalidate(TESTS_CACHE_KEY);
    return res;
  }

  async deleteTest(id: string): Promise<void> {
    refuseUnmigratedMySQLWrite();
    await db.testParameters.where('testId').equals(id).delete();
    await db.tests.delete(id);
    CacheService.invalidate(TESTS_CACHE_KEY);
    CacheService.invalidate(PARAMS_ALL_CACHE_KEY);
    CacheService.invalidate(`${PARAM_BY_TEST_PREFIX}${id}`);
  }

  async getAllParameters(): Promise<TestParameter[]> {
    await syncGlobalMedicalCatalog(false);
    return useMySQLStore() ? allMySQLStoreRows<TestParameter>('testParameters') : CacheService.get(PARAMS_ALL_CACHE_KEY, () => db.testParameters.toArray());
  }

  async getParametersByTestId(testId: string): Promise<TestParameter[]> {
    await syncGlobalMedicalCatalog(false);
    return CacheService.get(`${PARAM_BY_TEST_PREFIX}${testId}`, async () => {
      const list = useMySQLStore() ? (await this.getAllParameters()).filter(x=>x.testId===testId) : await db.testParameters.where('testId').equals(testId).toArray();
      return list.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }

  async saveParameter(param: TestParameter): Promise<string> {
    refuseUnmigratedMySQLWrite();
    const res = await db.testParameters.put(param);
    CacheService.invalidate(PARAMS_ALL_CACHE_KEY);
    CacheService.invalidate(`${PARAM_BY_TEST_PREFIX}${param.testId}`);
    return res;
  }

  async deleteParameter(id: string): Promise<void> {
    refuseUnmigratedMySQLWrite();
    await db.testParameters.delete(id);
    CacheService.invalidate(PARAMS_ALL_CACHE_KEY);
    CacheService.invalidatePrefix(PARAM_BY_TEST_PREFIX);
  }
}

export const testsRepository = new TestsRepository();
