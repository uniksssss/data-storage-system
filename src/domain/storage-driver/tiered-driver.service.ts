import type {
  GetStorageRecordResult,
  InitStorageDriverParams,
  IStorageDriver,
  StorageQuota,
  StoredRecordPredicate,
} from '../cache-client/dependencies/storage-driver.interface';
import { CacheError } from '../errors';
import type { CacheRecordMeta, CacheRecordsMeta } from '../types';
import { LRUEviction } from './lru-eviction';
import { DEFAULT_WARM_UP_TOP_N } from './tiered-driver.consts';

export type TieredDriverOptions = Partial<{
  hotHighWatermark: number;
  flushIntervalMs: number;
  warmUpTopN: number;
  batchSize: number;
  hotTargetBytes: number;
  hotMaxEntries: number;
}>;

type PendingWrite = {
  namespace: string;
  key: string;
  data: unknown;
  meta: CacheRecordMeta;
};

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' || (typeof DOMException !== 'undefined' && error instanceof DOMException))
  );
}

/**
 * Драйвер с горячим (RAM) и холодным (IndexedDB) слоями.
 *
 * Стратегия:
 * - Запись: сохранить в горячее → фоново в холодное (батчем).
 * - Чтение: попытка из горячего → при промахе из холодного с промоушеном в горячее.
 * - Эвикция: LRU из горячего с гарантией наличия копии в холодном.
 */
export class TieredDriver implements IStorageDriver {
  private flushIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private pendingColdWrites: Array<PendingWrite> = [];
  private readonly lru = new LRUEviction();

  private readonly inMem: IStorageDriver;
  private readonly idb: IStorageDriver;
  private readonly options: TieredDriverOptions;

  constructor(inMem: IStorageDriver, idb: IStorageDriver, options: TieredDriverOptions = {}) {
    this.inMem = inMem;
    this.idb = idb;
    this.options = options;
  }

  async init(params: InitStorageDriverParams = {}): Promise<void> {
    const raw = params.maxStorageSize;
    const [hotLimit, coldLimit] = Array.isArray(raw) ? raw : [undefined, raw];

    await Promise.all([this.inMem.init({ maxStorageSize: hotLimit }), this.idb.init({ maxStorageSize: coldLimit })]);

    if (this.options.flushIntervalMs && this.options.flushIntervalMs > 0) {
      this.flushIntervalHandle = setInterval(() => {
        void this.flushPending();
      }, this.options.flushIntervalMs);
    }

    void this.warmUpHotFromCold().catch(() => {});
  }

  destroy(): void {
    if (this.flushIntervalHandle !== null) {
      clearInterval(this.flushIntervalHandle);
      this.flushIntervalHandle = null;
    }
  }

  async get<T>(namespace: string, key: string): Promise<GetStorageRecordResult<T>> {
    const hotResult = await this.inMem.get<T>(namespace, key);
    if (hotResult?.data) {
      return hotResult;
    }

    const coldResult = await this.idb.get<T>(namespace, key);
    if (coldResult?.data) {
      this.inMem.set(namespace, key, coldResult.data, coldResult.meta).catch(() => {});
      return coldResult;
    }

    return null;
  }

  async set<T>(namespace: string, key: string, data: T, meta: CacheRecordMeta): Promise<number> {
    try {
      const newRecordSize = await this.inMem.set(namespace, key, data, meta);
      this.pendingColdWrites.push({ namespace, key, data, meta: { ...meta, size: newRecordSize } });

      const gi = globalThis as unknown as { requestIdleCallback?: (cb: () => void) => void };
      if (typeof gi.requestIdleCallback === 'function') {
        gi.requestIdleCallback(() => {
          void this.flushPending();
        });
      }

      if (this.options.batchSize && this.pendingColdWrites.length >= this.options.batchSize) {
        void this.flushPending();
      }

      if (this.options.hotHighWatermark && this.options.hotHighWatermark > 0) {
        const highWatermark = this.options.hotHighWatermark;
        this.inMem
          .estimateUsage()
          .then((usage: number) => {
            if (usage >= highWatermark) {
              void this.flushPending();
            }
          })
          .catch(() => {});
      }

      void this.maybeEvictHot(namespace);

      return newRecordSize;
    } catch (error) {
      if (isQuotaError(error)) {
        return this.idb.set(namespace, key, data, meta);
      }
      throw error;
    }
  }

  async updateMeta(namespace: string, key: string, meta: Partial<CacheRecordMeta>): Promise<void> {
    const results = await Promise.allSettled([
      this.inMem.updateMeta(namespace, key, meta),
      this.idb.updateMeta(namespace, key, meta),
    ]);

    const hasSuccess = results.some((r) => r.status === 'fulfilled');
    if (!hasSuccess) {
      throw new CacheError('Failed to update meta');
    }
  }

  async delete(namespace: string, predicate: StoredRecordPredicate): Promise<Array<string>> {
    const [hotDeleted, coldDeleted] = await Promise.all([
      this.inMem.delete(namespace, predicate),
      this.idb.delete(namespace, predicate),
    ]);

    return Array.from(new Set([...hotDeleted, ...coldDeleted]));
  }

  async clear(namespace: string): Promise<void> {
    await Promise.all([this.inMem.clear(namespace), this.idb.clear(namespace)]);
    this.pendingColdWrites = this.pendingColdWrites.filter((item) => item.namespace !== namespace);
  }

  async estimateQuota(): Promise<StorageQuota> {
    return this.idb.estimateQuota();
  }

  async estimateUsage(): Promise<number> {
    return this.idb.estimateUsage();
  }

  async getMeta(): Promise<Record<string, CacheRecordsMeta> | null> {
    const [hotMeta, coldMeta] = await Promise.all([this.inMem.getMeta(), this.idb.getMeta()]);

    if (!hotMeta && !coldMeta) {
      return null;
    }

    const merged: Record<string, CacheRecordsMeta> = {};

    if (coldMeta) {
      for (const [ns, records] of Object.entries(coldMeta)) {
        merged[ns] = { ...records };
      }
    }

    if (hotMeta) {
      for (const [ns, records] of Object.entries(hotMeta)) {
        if (!merged[ns]) {
          merged[ns] = {};
        }
        for (const [k, m] of Object.entries(records)) {
          merged[ns][k] = m;
        }
      }
    }

    return Object.keys(merged).length > 0 ? merged : null;
  }

  private async flushPending(): Promise<void> {
    if (this.isFlushing || this.pendingColdWrites.length === 0) {
      return;
    }

    this.isFlushing = true;
    try {
      const batchSize =
        this.options.batchSize && this.options.batchSize > 0 ? this.options.batchSize : this.pendingColdWrites.length;
      const batch = this.pendingColdWrites.splice(0, batchSize);
      await Promise.allSettled(batch.map(({ namespace, key, data, meta }) => this.idb.set(namespace, key, data, meta)));
    } finally {
      this.isFlushing = false;
      if (this.pendingColdWrites.length > 0) {
        setTimeout(() => {
          void this.flushPending();
        }, 0);
      }
    }
  }

  private async maybeEvictHot(namespace: string): Promise<void> {
    const hasLimits =
      (this.options.hotTargetBytes !== undefined && this.options.hotTargetBytes >= 0) ||
      (this.options.hotMaxEntries !== undefined && this.options.hotMaxEntries >= 0);

    if (!hasLimits) {
      return;
    }

    const nsMeta = (await this.inMem.getMeta())?.[namespace];

    if (!nsMeta || Object.keys(nsMeta).length === 0) {
      return;
    }

    const victims = this.lru.selectKeysToEvict(nsMeta, {
      targetBytes: this.options.hotTargetBytes,
      maxEntries: this.options.hotMaxEntries,
    });

    if (victims.length === 0) {
      return;
    }

    for (const victimKey of victims) {
      const coldRecord = await this.idb.get(namespace, victimKey);
      if (!coldRecord?.data) {
        const hotRecord = await this.inMem.get(namespace, victimKey);
        if (hotRecord?.data) {
          this.pendingColdWrites.push({
            namespace,
            key: victimKey,
            data: hotRecord.data,
            meta: hotRecord.meta,
          });
          void this.flushPending();
        }
      }

      await this.inMem.delete(namespace, victimKey);
    }
  }

  private async warmUpHotFromCold(): Promise<void> {
    const coldMeta = await this.idb.getMeta();
    if (!coldMeta) {
      return;
    }

    const warmUpTopN =
      this.options.warmUpTopN && this.options.warmUpTopN > 0 ? this.options.warmUpTopN : DEFAULT_WARM_UP_TOP_N;

    for (const [namespace, nsMeta] of Object.entries(coldMeta)) {
      const entries = Object.entries(nsMeta)
        .sort((a, b) => {
          if (a[1].accessCount !== b[1].accessCount) {
            return b[1].accessCount - a[1].accessCount;
          }
          return b[1].accessedAt - a[1].accessedAt;
        })
        .slice(0, warmUpTopN);

      if (entries.length === 0) {
        continue;
      }

      void Promise.allSettled(
        entries.map(async ([key]) => {
          const hotCheck = await this.inMem.get(namespace, key);
          if (hotCheck) {
            return;
          }
          const coldRecord = await this.idb.get(namespace, key);
          if (coldRecord?.data) {
            await this.inMem.set(namespace, key, coldRecord.data, coldRecord.meta);
          }
        }),
      ).catch(() => {});
    }
  }
}
