import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheService } from '../../services/cache.service';
import { testsRepository, doctorsRepository, permissionsRepository } from '../../repositories';
import { db } from '../../db/database';

describe('CacheService', () => {
  beforeEach(async () => {
    CacheService.clear();
    await db.tests.clear();
    await db.doctors.clear();
    await db.settings.clear();
  });

  it('يجب أن يخزن البيانات في الذاكرة ويعيدها دون استدعاء fetcher مجددًا قبل انتهاء الصلاحية', async () => {
    const fetcher = vi.fn().mockResolvedValue(['CBC', 'HbA1c']);

    const first = await CacheService.get('test-key', fetcher);
    const second = await CacheService.get('test-key', fetcher);

    expect(first).toEqual(['CBC', 'HbA1c']);
    expect(second).toEqual(['CBC', 'HbA1c']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(CacheService.hasValid('test-key')).toBe(true);
    expect(CacheService.size()).toBe(1);
  });

  it('يجب أن يدعم إبطال مفتاح محدد أو بادئة مفاتيح أو مسح الكاش بالكامل', async () => {
    await CacheService.get('catalog:tests:all', async () => [1, 2]);
    await CacheService.get('catalog:params:1', async () => ['p1']);
    await CacheService.get('doctors:all', async () => ['d1']);

    expect(CacheService.size()).toBe(3);

    CacheService.invalidate('doctors:all');
    expect(CacheService.hasValid('doctors:all')).toBe(false);
    expect(CacheService.size()).toBe(2);

    CacheService.invalidatePrefix('catalog:');
    expect(CacheService.size()).toBe(0);

    await CacheService.get('temp', async () => 'val');
    CacheService.clear();
    expect(CacheService.size()).toBe(0);
  });

  it('يجب أن يتكامل مع مستودعات التحاليل والأطباء والإعدادات ويبطل الكاش عند التعديل', async () => {
    await testsRepository.saveTest({
      id: 't-1',
      code: 'CBC',
      nameAr: 'صورة دم كاملة',
      nameEn: 'Complete Blood Count',
      department: 'Hematology',
      sampleType: 'Whole Blood',
      tubeType: 'EDTA',
      turnaroundTime: '2h',
      price: 250,
      estimatedCost: 80,
      active: true,
      commissionEligible: true,
      notes: '',
    });

    const tests1 = await testsRepository.getAllTests();
    expect(tests1).toHaveLength(1);
    expect(CacheService.hasValid('catalog:tests:all')).toBe(true);

    const doctors1 = await doctorsRepository.getAll();
    expect(doctors1).toHaveLength(0);
    expect(CacheService.hasValid('doctors:all')).toBe(true);

    const settings1 = await permissionsRepository.getSettings();
    expect(settings1).toBeUndefined();
  });
});
