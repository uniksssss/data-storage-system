import type { CacheRecordMeta } from '../types';
import type { IStorageDriver } from '../cache-client/dependencies/storage-driver.interface';

type InternalStorageRecord = {
  data: Uint8Array;
  meta: CacheRecordMeta;
};

export class StorageDriver implements IStorageDriver {
  private storage = new Map<string, Map<string, InternalStorageRecord>>();

  get(namespace: string, key: string) {
    return Promise.resolve(this.storage.get(namespace)?.get(key) ?? null);
  }

  set(namespace: string, key: string, data: Uint8Array, meta: CacheRecordMeta): Promise<void> {
    if (!this.storage.has(namespace)) {
      this.storage.set(namespace, new Map());
    }

    this.storage.get(namespace)!.set(key, { data, meta });
    return Promise.resolve();
  }

  delete(namespace: string, key: string): Promise<void> {
    this.storage.get(namespace)?.delete(key);
    return Promise.resolve();
  }

  clear(namespace: string): Promise<void> {
    this.storage.delete(namespace);
    return Promise.resolve();
  }
}
