export class MetricsCollector {
  private data = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    evictions: 0,
    latencies: {
      hit: [] as number[],
      miss: [] as number[],
      stale: [] as number[],
    },
  };

  recordHit(latencyMs: number, isStale = false) {
    this.data.hits++;
    if (isStale) {
      this.data.staleHits++;
      this.data.latencies.stale.push(latencyMs);
    } else {
      this.data.latencies.hit.push(latencyMs);
    }
  }

  recordMiss(latencyMs: number) {
    this.data.misses++;
    this.data.latencies.miss.push(latencyMs);
  }

  recordEviction(count: number) {
    this.data.evictions += count;
  }

  getReport() {
    const total = this.data.hits + this.data.misses;
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const p95 = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    };

    const avgHit = avg(this.data.latencies.hit);
    const avgMiss = avg(this.data.latencies.miss);

    const speedup = avgHit > 0 && avgMiss > 0 ? avgMiss / avgHit : 0;

    return {
      hitRate: total ? this.data.hits / total : 0,
      missRate: total ? this.data.misses / total : 0,
      swrRate: this.data.hits ? this.data.staleHits / this.data.hits : 0,
      avgLatencyHit: avgHit,
      avgLatencyMiss: avgMiss,
      p95LatencyHit: p95(this.data.latencies.hit),
      p95LatencyMiss: p95(this.data.latencies.miss),
      evictions: this.data.evictions,
      speedup,
      hits: this.data.hits,
      misses: this.data.misses,
      staleHits: this.data.staleHits,
    };
  }

  reset() {
    this.data = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      evictions: 0,
      latencies: { hit: [], miss: [], stale: [] },
    };
  }
}
