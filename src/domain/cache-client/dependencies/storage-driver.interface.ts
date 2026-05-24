import type { CacheRecordMeta, CacheRecordsMeta } from '../../types';

export type StoredRecord = {
  namespace: string;
  key: string;
  data?: Uint8Array;
  meta: CacheRecordMeta;
};

export type StoredRecordPredicate = string | Array<string> | RegExp | ((record: Omit<StoredRecord, 'data'>) => boolean);

export type GetStorageRecordResult<T> = {
  data: T | null;
  meta: CacheRecordMeta;
} | null;

export type StorageQuota = {
  used: number;
  total: number;
  available: number;
  usageRatio: number;
};

export type InitStorageDriverParams = {
  maxStorageSize?: number | [number | undefined, number | undefined];
};

export interface IStorageDriver {
  init(params?: InitStorageDriverParams): Promise<void>;

  get<T>(namespace: string, key: string): Promise<GetStorageRecordResult<T>>;

  set<T>(namespace: string, key: string, data: T, meta: CacheRecordMeta): Promise<number>;

  delete(namespace: string, predicate: StoredRecordPredicate): Promise<Array<string>>;
  clear(namespace: string): Promise<void>;

  getMeta(): Promise<Record<string, CacheRecordsMeta> | null>;
  updateMeta(namespace: string, key: string, meta: Partial<CacheRecordMeta>): Promise<void>;

  estimateUsage(): Promise<number>;
  estimateQuota(): Promise<StorageQuota>;
}
