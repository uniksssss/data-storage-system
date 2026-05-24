import type { EvictionPolicy } from '../eviction-policy/eviction-policy.service';
import type { CachePolicy, CacheRecordMeta } from '../types';
import type { UsageTracker } from '../usage-tracker/usage-tracker.service';
import type { GetCacheRecordResult } from './cache-client.types';
import type { ICacheMetrics } from './dependencies/cache-metrics.interface';
import type { ISerializer } from './dependencies/serializer.interface';
import type { IStorageDriver } from './dependencies/storage-driver.interface';

export class CacheClient {
  private readonly evictionPolicy: EvictionPolicy;
  private readonly usageTracker: UsageTracker;
  private readonly storage: IStorageDriver;
  private readonly serializer: ISerializer;
  private readonly metrics: ICacheMetrics | undefined;

  constructor(
    evictionPolicy: EvictionPolicy,
    usageTracker: UsageTracker,
    storage: IStorageDriver,
    serializer: ISerializer,
    metrics?: ICacheMetrics,
  ) {
    this.evictionPolicy = evictionPolicy;
    this.usageTracker = usageTracker;
    this.storage = storage;
    this.serializer = serializer;
    this.metrics = metrics;
  }

  async init(): Promise<void> {
    const snapshot = await this.storage.getMeta();
    this.usageTracker.bootstrap(snapshot);
  }

  async set<T>(namespace: string, key: string, data: T, policy: CachePolicy): Promise<void> {
    const now = Date.now();

    const encoded = await this.serializer.encode(data);
    const newSize = encoded.byteLength;

    const existingMeta = this.usageTracker.getMeta(namespace)?.[key] ?? null;
    const oldSize = existingMeta?.size ?? 0;

    const { total: quota } = await this.storage.estimateQuota();
    const usage = this.usageTracker.getUsage();

    if (this.evictionPolicy.shouldEvict({ usage: usage - oldSize, quota, newRecordSize: newSize })) {
      const overflow = usage - oldSize + newSize - this.evictionPolicy.maxAllowedBytes(quota);
      await this.evict(namespace, overflow);
    }

    const meta: CacheRecordMeta = {
      createdAt: existingMeta?.createdAt ?? now,
      updatedAt: now,
      accessedAt: now,
      accessCount: existingMeta?.accessCount ?? 0,
      size: newSize,
      policy,
    };

    await this.storage.set<Uint8Array>(namespace, key, encoded, meta);
    this.usageTracker.onSet(namespace, key, meta);
  }

  async get<T>(namespace: string, key: string): Promise<GetCacheRecordResult<T>> {
    const record = await this.storage.get<Uint8Array>(namespace, key);

    if (!record || !record.data) {
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

    const partial: Partial<CacheRecordMeta> = {
      accessedAt: now,
      accessCount: record.meta.accessCount + 1,
    };

    void this.storage.updateMeta(namespace, key, partial).catch(() => {});
    this.usageTracker.onUpdate(namespace, key, partial);

    return {
      data: await this.serializer.decode<T>(record.data),
      meta: { ...record.meta, ...partial },
      isFresh,
      isStale,
      isExpired,
    };
  }

  async getExpired<T>(namespace: string, key: string) {
    const record = await this.storage.get<Uint8Array>(namespace, key);

    if (!record || !record.data) {
      return null;
    }

    return {
      data: await this.serializer.decode<T>(record.data),
      meta: record.meta,
      isExpired: true,
    };
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.storage.delete(namespace, key);
    this.usageTracker.onDelete(namespace, key);
  }

  async clear(namespace: string): Promise<void> {
    await this.storage.clear(namespace);
    this.usageTracker.onClear(namespace);
  }

  private async evict(namespace: string, budgetBytes: number): Promise<void> {
    const victims = await this.evictionPolicy.pickVictims(budgetBytes, () =>
      Promise.resolve(this.usageTracker.getMeta(namespace) ?? {}),
    );

    let evicted = 0;
    for (const key of victims) {
      const deleted = await this.storage.delete(namespace, key);
      if (deleted.length > 0) {
        this.usageTracker.onDelete(namespace, key);
        evicted += deleted.length;
      }
    }

    if (evicted > 0) {
      this.metrics?.recordEviction(evicted);
    }
  }
}
