import type { CacheRecordMeta, CacheRecordsMeta } from '../types';
import { CacheError } from '../errors';
import type {
  GetStorageRecordResult,
  InitStorageDriverParams,
  IStorageDriver,
  StorageQuota,
  StoredRecord,
  StoredRecordPredicate,
} from '../cache-client/dependencies/storage-driver.interface';

type Entry = {
  data?: Uint8Array;
  meta: CacheRecordMeta;
};

function toBytes<T>(data: T): Uint8Array | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  throw new CacheError('InMemoryDriver accepts only Uint8Array/ArrayBuffer payload');
}

function testPredicate(predicate: StoredRecordPredicate, record: Omit<StoredRecord, 'data'>): boolean {
  if (typeof predicate === 'string') {
    return record.key === predicate;
  }

  if (Array.isArray(predicate)) {
    return predicate.includes(record.key);
  }

  if (predicate instanceof RegExp) {
    return predicate.test(record.key);
  }

  return predicate(record);
}

export class InMemoryDriver implements IStorageDriver {
  private store = new Map<string, Map<string, Entry>>();
  private maxStorageSize: number | undefined;
  private currentUsage = 0;

  init(params: InitStorageDriverParams = {}): Promise<void> {
    const rawLimit = params.maxStorageSize;
    if (Array.isArray(rawLimit)) {
      this.maxStorageSize = rawLimit[0];
    } else {
      this.maxStorageSize = rawLimit;
    }
    return Promise.resolve();
  }

  get<T>(namespace: string, key: string): Promise<GetStorageRecordResult<T>> {
    const entry = this.store.get(namespace)?.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      data: (entry.data ?? null) as T | null,
      meta: entry.meta,
    });
  }

  set<T>(namespace: string, key: string, data: T, meta: CacheRecordMeta): Promise<number> {
    const bytes = toBytes(data);
    const size = meta.size ?? bytes?.byteLength ?? 0;

    const nsMap = this.getOrCreateNamespace(namespace);
    const previous = nsMap.get(key);
    const previousSize = previous?.meta.size ?? previous?.data?.byteLength ?? 0;

    const projectedUsage = this.currentUsage - previousSize + size;
    if (this.maxStorageSize !== undefined && projectedUsage > this.maxStorageSize) {
      const err = new Error('InMemoryDriver quota exceeded');
      err.name = 'QuotaExceededError';
      return Promise.reject(err);
    }

    nsMap.set(key, { data: bytes, meta: { ...meta, size } });
    this.currentUsage = Math.max(projectedUsage, 0);

    return Promise.resolve(size);
  }

  delete(namespace: string, predicate: StoredRecordPredicate): Promise<Array<string>> {
    const nsMap = this.store.get(namespace);
    if (!nsMap) {
      return Promise.resolve([]);
    }

    const deleted: Array<string> = [];

    for (const [key, entry] of nsMap) {
      const match = testPredicate(predicate, { namespace, key, meta: entry.meta });
      if (!match) {
        continue;
      }

      const size = entry.meta.size ?? entry.data?.byteLength ?? 0;
      nsMap.delete(key);
      this.currentUsage = Math.max(this.currentUsage - size, 0);
      deleted.push(key);
    }

    if (nsMap.size === 0) {
      this.store.delete(namespace);
    }

    return Promise.resolve(deleted);
  }

  clear(namespace: string): Promise<void> {
    const nsMap = this.store.get(namespace);
    if (!nsMap) {
      return Promise.resolve();
    }

    for (const entry of nsMap.values()) {
      const size = entry.meta.size ?? entry.data?.byteLength ?? 0;
      this.currentUsage = Math.max(this.currentUsage - size, 0);
    }

    this.store.delete(namespace);
    return Promise.resolve();
  }

  getMeta(): Promise<Record<string, CacheRecordsMeta> | null> {
    if (this.store.size === 0) {
      return Promise.resolve(null);
    }

    const result: Record<string, CacheRecordsMeta> = {};
    for (const [namespace, nsMap] of this.store) {
      const nsMeta: CacheRecordsMeta = {};
      for (const [key, entry] of nsMap) {
        nsMeta[key] = entry.meta;
      }
      result[namespace] = nsMeta;
    }

    return Promise.resolve(result);
  }

  updateMeta(namespace: string, key: string, meta: Partial<CacheRecordMeta>): Promise<void> {
    const entry = this.store.get(namespace)?.get(key);
    if (!entry) {
      return Promise.resolve();
    }

    entry.meta = { ...entry.meta, ...meta };
    return Promise.resolve();
  }

  estimateUsage(): Promise<number> {
    return Promise.resolve(this.currentUsage);
  }

  estimateQuota(): Promise<StorageQuota> {
    const total = this.maxStorageSize ?? Number.POSITIVE_INFINITY;
    const used = this.currentUsage;
    const available = total === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(total - used, 0);
    const usageRatio = total > 0 && Number.isFinite(total) ? used / total : 0;

    return Promise.resolve({ used, total, available, usageRatio });
  }

  private getOrCreateNamespace(namespace: string): Map<string, Entry> {
    let nsMap = this.store.get(namespace);
    if (!nsMap) {
      nsMap = new Map();
      this.store.set(namespace, nsMap);
    }
    return nsMap;
  }
}
