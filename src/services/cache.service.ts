// src/services/cache.service.ts
export class CacheService {
  private static cache = new Map<string, { data: any; expiry: number }>();
  private static TTL = 5 * 60 * 1000; // 5 دقائق

  static async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = this.TTL
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, expiry: Date.now() + ttl });
    return data;
  }

  static hasValid(key: string): boolean {
    const cached = this.cache.get(key);
    return Boolean(cached && cached.expiry > Date.now());
  }

  static invalidate(key: string): void {
    this.cache.delete(key);
  }

  static invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  static clear(): void {
    this.cache.clear();
  }

  static size(): number {
    return this.cache.size;
  }
}
