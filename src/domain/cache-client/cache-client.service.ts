import type { CachePolicy, CacheRecordMeta } from '../types';
import type { GetCacheRecordResult } from './cache-client.types';
import type { ISerializer } from './dependencies/serializer.interface';
import type { IStorageDriver } from './dependencies/storage-driver.interface';

export class CacheClient {
  private storage: IStorageDriver;
  private serializer: ISerializer;

  constructor(storage: IStorageDriver, serializer: ISerializer) {
    this.storage = storage;
    this.serializer = serializer;
  }

  async set<T>(namespace: string, key: string, data: T, policy: CachePolicy): Promise<void> {
    const now = Date.now();

    const meta: CacheRecordMeta = {
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      accessCount: 0,
      policy,
    };

    const encoded = await this.serializer.encode(data);

    await this.storage.set(namespace, key, encoded, meta);
  }

  async get<T>(namespace: string, key: string): Promise<GetCacheRecordResult<T>> {
    const record = await this.storage.get(namespace, key);

    if (!record) {
      return null;
    }

    const now = Date.now();
    const { ttl = 0, swr = 0 } = record.meta.policy;

    const age = now - record.meta.createdAt;

    const isFresh = ttl === 0 ? true : age <= ttl;
    const isStale = ttl > 0 && age > ttl && age <= ttl + swr;
    const isExpired = ttl > 0 && age > ttl + swr;

    if (isExpired) {
      await this.storage.delete(namespace, key);
      return null;
    }

    const nextMeta: CacheRecordMeta = {
      ...record.meta,
      accessedAt: now,
      accessCount: record.meta.accessCount + 1,
    };

    await this.storage.set(namespace, key, record.data, nextMeta);

    const decoded = await this.serializer.decode<T>(record.data);

    return {
      data: decoded,
      meta: nextMeta,
      isFresh,
      isStale,
    };
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.storage.delete(namespace, key);
  }

  async clear(namespace: string): Promise<void> {
    await this.storage.clear(namespace);
  }
}
