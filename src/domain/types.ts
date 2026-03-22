export type CachePolicy = {
  ttl?: number;
  swr?: number;
};

export type CacheTag = string;

export type CacheRecord<T> = {
  data: T;
  meta: CacheRecordMeta;
};

export type CacheRecordMeta = {
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  size?: number;
  policy: CachePolicy;
};

export type CacheRecordsMeta = Record<string, CacheRecordMeta>;
