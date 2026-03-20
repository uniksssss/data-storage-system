import type { CacheRecordMeta } from '../../types';

export type GetCacheRecordResult<T> = {
  data: T | null;
  meta: CacheRecordMeta;
  isFresh: boolean;
  isStale: boolean;
} | null;
