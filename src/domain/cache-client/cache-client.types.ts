import type { CacheRecordMeta } from '../types';

export type GetCacheRecordResult<T> = {
  data: T | null;
  meta: CacheRecordMeta;
  isFresh: boolean;
  isStale: boolean;
} | null;

export type CacheStats = Record<string, NamespaceCacheStats>;
export type NamespaceCacheStats = {
  size: number;
  count: number;
  averageSize: number;
  effectiveness: Record<string, CacheRecordEffectivenessStats>;
};

export type CacheRecordEffectivenessStats = {
  hits: number;
  hitRate: number;
  misses: number;
  missRate: number;
  evictions: number;
};
