import { db } from '../db/database';
import type { LabRequest, LabResult, RequestItem, Sample } from '../types';

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
    return db.samples.put(sample);
  }

  async deleteSample(id: string): Promise<void> {
    await db.samples.delete(id);
  }

  async getAllResults(): Promise<LabResult[]> {
    return db.results.toArray();
  }

  async saveResult(result: LabResult): Promise<string> {
    return db.results.put(result);
  }

  async deleteResult(id: string): Promise<void> {
    await db.results.delete(id);
  }
}

export const requestsRepository = new RequestsRepository();
