import type { CacheRecordMeta } from '../types';
import { CacheError } from '../errors';
import type {
  GetStorageRecordResult,
  IStorageDriver,
  StoredRecord,
  StoredRecordPredicate,
} from '../cache-client/dependencies/storage-driver.interface';

const MAX_MEMORY = 1024 * 1024 * 512; // 512MB

function isStoredRecord(value: unknown): value is StoredRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const v = value as Record<string, unknown>;
  const hasNamespace = typeof v.namespace === 'string';
  const hasKey = typeof v.key === 'string';
  const hasMeta = typeof v.meta === 'object' && v.meta !== null;
  const hasValidData = typeof v.data === 'undefined' || v.data instanceof Uint8Array;

  return hasNamespace && hasKey && hasMeta && hasValidData;
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

function toBytes<T>(data: T): Uint8Array | undefined {
  if (typeof data === 'undefined' || data === null) {
    return undefined;
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  throw new CacheError('StorageDriver accepts only Uint8Array/ArrayBuffer payload');
}

export class StorageDriver implements IStorageDriver {
  private static readonly DB_NAME = 'storage_driver_db';
  private static readonly DB_VERSION = 1;
  private static readonly STORE = 'records';
  private static readonly INDEX_NAMESPACE = 'by_namespace';
  private static readonly INDEX_TAG = 'by_tag';

  private db: IDBDatabase | null = null;
  private maxStorageSize = MAX_MEMORY;
  private usageByNamespace: Record<string, number> = {};
  private usageInitialized = false;

  private ensureEnv(): void {
    if (typeof indexedDB === 'undefined') {
      throw new CacheError('IndexedDB is not available in this environment');
    }
  }

  private openDB(): Promise<IDBDatabase> {
    this.ensureEnv();

    if (this.db) {
      return Promise.resolve(this.db);
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(StorageDriver.DB_NAME, StorageDriver.DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(StorageDriver.STORE)) {
          const store = db.createObjectStore(StorageDriver.STORE, { keyPath: ['namespace', 'key'] });
          store.createIndex(StorageDriver.INDEX_NAMESPACE, 'namespace', { unique: false });
          store.createIndex(StorageDriver.INDEX_TAG, 'meta.policy.tags', { unique: false, multiEntry: true });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.usageInitialized = false;
        };
        resolve(this.db);
      };

      request.onerror = () => reject(request.error ?? new CacheError('IndexedDB open error'));
      request.onblocked = () => reject(new CacheError('IndexedDB open request was blocked'));
    });
  }

  private withStore<T>(mode: IDBTransactionMode, cb: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.openDB().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(StorageDriver.STORE, mode);
          const store = tx.objectStore(StorageDriver.STORE);
          const request = cb(store);

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new CacheError('IndexedDB request error'));
          tx.onerror = () => reject(tx.error ?? new CacheError('IndexedDB transaction error'));
        }),
    );
  }

  private async ensureUsageTrackingInitialized(): Promise<void> {
    if (this.usageInitialized) {
      return;
    }

    await this.initializeUsageTracking();
    this.usageInitialized = true;
  }

  private async initializeUsageTracking(): Promise<void> {
    const db = await this.openDB();

    await new Promise<void>((resolve, reject) => {
      this.usageByNamespace = {};

      const tx = db.transaction(StorageDriver.STORE, 'readonly');
      const store = tx.objectStore(StorageDriver.STORE);
      const request: IDBRequest<IDBCursorWithValue | null> = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }

        if (isStoredRecord(cursor.value)) {
          const value = cursor.value;
          const size = value.meta.size ?? (value.data ? value.data.byteLength : 0);
          this.usageByNamespace[value.namespace] = (this.usageByNamespace[value.namespace] ?? 0) + size;
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error ?? new CacheError('IndexedDB cursor error'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new CacheError('IndexedDB transaction error'));
    });
  }

  async get<T>(namespace: string, key: string): Promise<GetStorageRecordResult<T>> {
    const record = await this.withStore(
      'readonly',
      (store) => store.get([namespace, key]) as IDBRequest<StoredRecord | undefined>,
    );

    if (!record) {
      return null;
    }

    return {
      data: (record.data ?? null) as T | null,
      meta: record.meta,
    };
  }

  async set<T>(namespace: string, key: string, data: T, meta: CacheRecordMeta): Promise<number> {
    await this.ensureUsageTrackingInitialized();
    const serialized = toBytes(data);
    const size = meta.size ?? serialized?.byteLength ?? 0;

    const previous = await this.withStore(
      'readonly',
      (store) => store.get([namespace, key]) as IDBRequest<StoredRecord | undefined>,
    );

    const value: StoredRecord = {
      namespace,
      key,
      data: serialized,
      meta: { ...meta, size },
    };

    await this.withStore('readwrite', (store) => store.put(value));

    const oldSize = previous?.meta.size ?? previous?.data?.byteLength ?? 0;
    this.usageByNamespace[namespace] = Math.max((this.usageByNamespace[namespace] ?? 0) - oldSize, 0) + size;

    return size;
  }

  async delete(namespace: string, predicate: StoredRecordPredicate): Promise<Array<string>> {
    await this.ensureUsageTrackingInitialized();
    const db = await this.openDB();

    return new Promise<Array<string>>((resolve, reject) => {
      const deleted: Array<string> = [];
      let deletedSize = 0;

      const tx = db.transaction(StorageDriver.STORE, 'readwrite');
      const store = tx.objectStore(StorageDriver.STORE);
      const namespaceIndex = store.index(StorageDriver.INDEX_NAMESPACE);
      const range = IDBKeyRange.only(namespace);
      const request: IDBRequest<IDBCursorWithValue | null> = namespaceIndex.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }

        if (!isStoredRecord(cursor.value)) {
          cursor.continue();
          return;
        }

        const value = cursor.value;

        if (testPredicate(predicate, { namespace: value.namespace, key: value.key, meta: value.meta })) {
          const size = value.meta.size ?? (value.data ? value.data.byteLength : 0);
          deletedSize += size;
          deleted.push(value.key);
          cursor.delete();
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error ?? new CacheError('IndexedDB cursor error'));

      tx.oncomplete = () => {
        this.usageByNamespace[namespace] = Math.max((this.usageByNamespace[namespace] ?? 0) - deletedSize, 0);
        resolve(deleted);
      };

      tx.onerror = () => reject(tx.error ?? new CacheError('IndexedDB transaction error'));
    });
  }

  async clear(namespace: string): Promise<void> {
    await this.ensureUsageTrackingInitialized();
    const db = await this.openDB();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(StorageDriver.STORE, 'readwrite');
      const store = tx.objectStore(StorageDriver.STORE);
      const namespaceIndex = store.index(StorageDriver.INDEX_NAMESPACE);
      const range = IDBKeyRange.only(namespace);
      const request: IDBRequest<IDBCursorWithValue | null> = namespaceIndex.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }

        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => reject(request.error ?? new CacheError('IndexedDB cursor error'));
      tx.oncomplete = () => {
        this.usageByNamespace[namespace] = 0;
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new CacheError('IndexedDB transaction error'));
    });
  }

  async estimateUsage(): Promise<number> {
    await this.ensureUsageTrackingInitialized();
    return Object.values(this.usageByNamespace).reduce((sum, usage) => sum + usage, 0);
  }

  async estimateQuota(): Promise<{ used: number; total: number; available: number; usageRatio: number }> {
    const used = await this.estimateUsage();

    if (typeof navigator !== 'undefined') {
      try {
        const nav = navigator as Navigator & {
          storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
        };
        const estimate = (await nav.storage?.estimate?.()) ?? {};
        const totalFromEstimate = estimate.quota ?? used;
        const total = Math.max(this.maxStorageSize, totalFromEstimate);
        const available = Math.max(total - used, 0);
        const usageRatio = total > 0 ? used / total : 0;

        return { used, total, available, usageRatio };
      } catch {
        // fallback below
      }
    }

    const total = this.maxStorageSize;
    const available = Math.max(total - used, 0);
    const usageRatio = total > 0 ? used / total : 0;

    return { used, total, available, usageRatio };
  }
}
