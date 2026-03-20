export type CachePolicy = {
  ttl?: number;
  swr?: number;
};

export type CacheTag = string;

export type CacheRecordMeta = {
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  size?: number;
  policy: CachePolicy;
};
