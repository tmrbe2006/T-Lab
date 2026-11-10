import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineService } from '../../services/offline.service';

describe('OfflineService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('يجب أن يفعل ويعطل وضع عدم الاتصال الصريح بشكل صحيح', () => {
    expect(OfflineService.isExplicitOfflineForced()).toBe(false);

    OfflineService.enableOfflineMode();
    expect(OfflineService.isExplicitOfflineForced()).toBe(true);
    expect(OfflineService.isOfflineMode()).toBe(true);

    OfflineService.disableOfflineMode();
    expect(OfflineService.isExplicitOfflineForced()).toBe(false);
    // في بيئة الاختبار بدون مفتاح Gemini حقيقي، يظل النظام يعمل بأمان في وضع عدم الاتصال المحلي
    expect(OfflineService.isOfflineMode()).toBe(true);
  });
});
