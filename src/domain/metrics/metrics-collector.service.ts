import type { MetricsData, MetricsReport } from './metrics.types';
import type { ICacheMetrics } from '../cache-client/dependencies/cache-metrics.interface';

function createEmptyData(): MetricsData {
  return {
    hits: 0,
    misses: 0,
    staleHits: 0,
    evictions: 0,
    latencies: { hit: [], miss: [], stale: [] },
  };
}

function average(values: Array<number>): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: Array<number>, p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

export class MetricsCollector implements ICacheMetrics {
  private data: MetricsData = createEmptyData();

  recordHit(latencyMs: number, isStale = false): void {
    this.data.hits++;
    if (isStale) {
      this.data.staleHits++;
      this.data.latencies.stale.push(latencyMs);
    } else {
      this.data.latencies.hit.push(latencyMs);
    }
  }

  recordMiss(latencyMs: number): void {
    this.data.misses++;
    this.data.latencies.miss.push(latencyMs);
  }

  recordEviction(count: number): void {
    this.data.evictions += count;
  }

  getReport(): MetricsReport {
    const total = this.data.hits + this.data.misses;
    const avgHit = average(this.data.latencies.hit);
    const avgMiss = average(this.data.latencies.miss);
    const speedup = avgHit > 0 && avgMiss > 0 ? avgMiss / avgHit : 0;

    return {
      hits: this.data.hits,
      misses: this.data.misses,
      staleHits: this.data.staleHits,
      evictions: this.data.evictions,
      hitRate: total ? this.data.hits / total : 0,
      missRate: total ? this.data.misses / total : 0,
      swrRate: this.data.hits ? this.data.staleHits / this.data.hits : 0,
      avgLatencyHit: avgHit,
      avgLatencyMiss: avgMiss,
      p95LatencyHit: percentile(this.data.latencies.hit, 0.95),
      p95LatencyMiss: percentile(this.data.latencies.miss, 0.95),
      speedup,
    };
  }

  reset(): void {
    this.data = createEmptyData();
  }
}
