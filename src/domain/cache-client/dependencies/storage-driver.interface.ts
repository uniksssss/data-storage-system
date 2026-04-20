import type { CacheRecordMeta } from '../../types';

export type StoredRecord = {
  namespace: string;
  key: string;
  data?: Uint8Array;
  meta: CacheRecordMeta;
};

export type StoredRecordPredicate = string | Array<string> | RegExp | ((record: Omit<StoredRecord, 'data'>) => boolean);

export interface IStorageDriver {
  get<T>(namespace: string, key: string): Promise<GetStorageRecordResult<T>>;

  set<T>(namespace: string, key: string, data: T, meta: CacheRecordMeta): Promise<number>;

  delete(namespace: string, predicate: StoredRecordPredicate): Promise<Array<string>>;
  clear(namespace: string): Promise<void>;
}

export type GetStorageRecordResult<T> = {
  data: T | null;
  meta: CacheRecordMeta;
} | null;
