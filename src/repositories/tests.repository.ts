import { db } from '../db/database';
import type { LabTest, TestParameter } from '../types';

export class TestsRepository {
  async getAllTests(): Promise<LabTest[]> {
    return db.tests.toArray();
  }

  async getTestById(id: string): Promise<LabTest | undefined> {
    return db.tests.get(id);
  }

  async saveTest(test: LabTest): Promise<string> {
    return db.tests.put(test);
  }

  async deleteTest(id: string): Promise<void> {
    await db.testParameters.where('testId').equals(id).delete();
    await db.tests.delete(id);
  }

  async getAllParameters(): Promise<TestParameter[]> {
    return db.testParameters.toArray();
  }

  async getParametersByTestId(testId: string): Promise<TestParameter[]> {
    const list = await db.testParameters.where('testId').equals(testId).toArray();
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async saveParameter(param: TestParameter): Promise<string> {
    return db.testParameters.put(param);
  }

  async deleteParameter(id: string): Promise<void> {
    await db.testParameters.delete(id);
  }
}

export const testsRepository = new TestsRepository();
