export type CachePolicy = {
  ttl?: number;
  swr?: number;
  // encrypted?: boolean;
  // iv?: string;
  // apiVersion?: string | number;
  // tags?: Array<CacheTag>;
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
