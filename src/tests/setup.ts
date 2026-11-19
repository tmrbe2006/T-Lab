import 'fake-indexeddb/auto';
import { afterEach, beforeAll } from 'vitest';

// تنظيف IndexedDB قبل كل اختبار
beforeAll(() => {
  // إعداد البيئة الاختبارية
});

afterEach(() => {
  // مسح localStorage
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

// محاكاة window.matchMedia
if (typeof window !== 'undefined') Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
