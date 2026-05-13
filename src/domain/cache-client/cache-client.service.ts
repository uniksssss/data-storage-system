import type { EvictionPolicy } from '../eviction-policy/eviction-policy.service';
import type { CachePolicy, CacheRecordMeta } from '../types';
import type { UsageTracker } from '../usage-tracker/usage-tracker.service';
import type {
  CacheRecordEffectivenessStats,
  CacheStats,
  GetCacheRecordResult,
  NamespaceCacheStats,
} from './cache-client.types';
import type { ISerializer } from './dependencies/serializer.interface';
import type { IStorageDriver } from './dependencies/storage-driver.interface';

export class CacheClient {
  private evictionPolicy: EvictionPolicy;
  private usageTracker: UsageTracker;
  private cacheStats: CacheStats = {};
  private storage: IStorageDriver;
  private serializer: ISerializer;

  constructor(
    evictionPolicy: EvictionPolicy,
    usageTracker: UsageTracker,
    storage: IStorageDriver,
    serializer: ISerializer,
  ) {
    this.evictionPolicy = evictionPolicy;
    this.usageTracker = usageTracker;
    this.storage = storage;
    this.serializer = serializer;
  }

  async set<T>(namespace: string, key: string, data: T, policy: CachePolicy): Promise<void> {
    const now = Date.now();

    const encoded = await this.serializer.encode(data);
    const newSize = encoded.byteLength;

    const existing = await this.storage.get<Uint8Array>(namespace, key);
    const oldSize = existing?.meta.size ?? 0;

    const usage = this.usageTracker.getUsage();
    const quota = 50000;

    const projectedUsage = usage - oldSize + newSize;
    console.log('SET:', key, {
      newSize,
      usage,
      projectedUsage,
    });

    if (
      this.evictionPolicy.shouldEvict({
        usage: usage - oldSize,
        quota,
        newRecordSize: newSize,
      })
    ) {
      const maxAllowed = 0.8 * quota;
      const bytesToFree = projectedUsage - maxAllowed;

      console.log('EVICTION TRIGGERED');

      await this.evict(namespace, bytesToFree);
    }

    const meta: CacheRecordMeta = {
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      accessCount: 0,
      size: newSize,
      policy,
    };

    await this.storage.set<Uint8Array>(namespace, key, encoded, meta);

    this.usageTracker.onSet(namespace, key, newSize);
  }

  async get<T>(namespace: string, key: string): Promise<GetCacheRecordResult<T>> {
    const record = await this.storage.get<Uint8Array>(namespace, key);

    if (!record) {
      return null;
    }

    if (!record.data) {
      return null;
    }

    const now = Date.now();
    const { ttl = 0, swr = 0 } = record.meta.policy;

    const age = now - record.meta.updatedAt;

    const isFresh = ttl === 0 ? true : age <= ttl;
    const isStale = ttl > 0 && age > ttl && age <= ttl + swr;
    const isExpired = ttl > 0 && age > ttl + swr;

    if (isExpired) {
      return {
        data: await this.serializer.decode<T>(record.data),
        meta: record.meta,
        isFresh: false,
        isStale: false,
        isExpired: true,
      };
    }

    const nextMeta: CacheRecordMeta = {
      ...record.meta,
      accessedAt: now,
      accessCount: record.meta.accessCount + 1,
    };

    await this.storage.set<Uint8Array>(namespace, key, record.data, nextMeta);

    const decoded = await this.serializer.decode<T>(record.data);

    return {
      data: decoded,
      meta: nextMeta,
      isFresh,
      isStale,
      isExpired,
    };
  }

  private async evict(namespace: string, budgetBytes: number): Promise<void> {
    console.log('EVICT START', { budgetBytes });
    const meta = this.usageTracker.getMeta(namespace);
    const victims = await this.evictionPolicy.pickVictims(budgetBytes, () => Promise.resolve(meta ?? {}));
    console.log('VICTIMS:', victims);

    this.prepareStats(namespace);
    let { size } = this.cacheStats[namespace];
    let evictedCount = 0;

    for (const key of victims) {
      const recordMeta = meta?.[key];

      if (!recordMeta) {
        continue;
      }

      await this.storage.delete(namespace, key);
      this.usageTracker.onDelete(namespace, key, recordMeta.size ?? 0);

      size -= recordMeta.size ?? 0;
      evictedCount += 1;

      this.prepareStats(namespace, key);
      this.cacheStats[namespace].effectiveness[key].evictions += 1;
    }

    this.updateStats(namespace, {
      size,
      count: this.cacheStats[namespace].count - evictedCount,
    });
  }

  private prepareStats(namespace: string, key?: string): void {
    if (!this.cacheStats?.[namespace]) {
      this.cacheStats[namespace] = { size: 0, count: 0, averageSize: 0, effectiveness: {} };
    }

    if (key && !this.cacheStats[namespace].effectiveness?.[key]) {
      this.cacheStats[namespace].effectiveness[key] = this.createEmptyRecordEffectivenessStats();
    }
  }

  private updateStats(namespace: string, { size, count }: Pick<NamespaceCacheStats, 'size' | 'count'>): void {
    this.prepareStats(namespace);

    this.cacheStats[namespace] = {
      ...this.cacheStats[namespace],
      size,
      count,
      averageSize: count > 1 ? size / count : 0,
    };
  }

  private createEmptyRecordEffectivenessStats(): CacheRecordEffectivenessStats {
    return {
      hits: 0,
      hitRate: 0,
      misses: 0,
      missRate: 0,
      evictions: 0,
    };
  }

  async getExpired<T>(namespace: string, key: string) {
    const record = await this.storage.get<Uint8Array>(namespace, key);

    if (!record) {
      return null;
    }

    const decoded = await this.serializer.decode<T>(record.data!);

    return {
      data: decoded,
      meta: record.meta,
      isExpired: true,
    };
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.storage.delete(namespace, key);
    this.usageTracker.onDelete(namespace, key, 0);
  }

  async clear(namespace: string): Promise<void> {
    await this.storage.clear(namespace);
  }
}
