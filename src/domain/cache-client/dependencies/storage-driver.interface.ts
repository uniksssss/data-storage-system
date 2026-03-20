import type { CacheRecordMeta } from '../../types';

export interface IStorageDriver {
  get(namespace: string, key: string): Promise<GetStorageRecordResult>;

  set(namespace: string, key: string, data: Uint8Array, meta: CacheRecordMeta): Promise<void>;

  delete(namespace: string, key: string): Promise<void>;

  clear(namespace: string): Promise<void>;
}

export type GetStorageRecordResult = {
  data: Uint8Array;
  meta: CacheRecordMeta;
} | null;
