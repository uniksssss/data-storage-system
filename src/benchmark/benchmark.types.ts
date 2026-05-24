import type { MetricsReport } from '../domain/metrics/metrics.types';

export type { MetricsReport, MetricsData } from '../domain/metrics/metrics.types';

export type LogEntryType = 'HIT' | 'MISS' | 'STALE' | 'OFFLINE' | 'TIMEOUT' | 'NETWORK';

export type LogEntry = {
  id: number;
  time: string;
  type: LogEntryType;
  ms: number;
  url: string;
};

export type SWMetrics = MetricsReport;

export type CompareData = {
  cached: number | null;
  direct: number | null;
};
