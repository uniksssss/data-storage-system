import type { CacheRecordMeta } from '../types';

export type StoredRecord = {
  key: string;
  data?: ArrayBuffer;
  meta: CacheRecordMeta;
};
