export type LogEntry = {
  id: number;
  time: string;
  type: 'HIT' | 'MISS' | 'STALE';
  ms: number;
  url: string;
};

export type SWMetrics = {
  hitRate: number;
  avgLatencyHit: number;
  avgLatencyMiss: number;
  p95LatencyHit: number;
  p95LatencyMiss: number;
  speedup: number;
};

export type CompareData = {
  cached: number | null;
  direct: number | null;
};
