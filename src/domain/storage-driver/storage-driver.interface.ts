import type { CacheRecordMeta } from '../types';

export type StoredRecord = {
  namespace: string;
  key: string;
  data?: Uint8Array;
  meta: CacheRecordMeta;
};
