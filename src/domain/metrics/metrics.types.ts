export type MetricsReport = {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  hitRate: number;
  missRate: number;
  swrRate: number;
  avgLatencyHit: number;
  avgLatencyMiss: number;
  p95LatencyHit: number;
  p95LatencyMiss: number;
  speedup: number;
};

export type MetricsData = {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  latencies: {
    hit: Array<number>;
    miss: Array<number>;
    stale: Array<number>;
  };
};
