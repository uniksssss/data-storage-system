import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chart } from 'chart.js';
import {
  CONSECUTIVE_ERRORS_TO_ABORT,
  INTER_REQUEST_DELAY_MS,
  LOG_MAX_ENTRIES,
  MAX_ITERATIONS,
  WARMUP_TIMEOUT_MS,
} from './benchmark.consts';
import type { CompareData, LogEntry, LogEntryType, MetricsReport, SWMetrics } from './benchmark.types';
import { classifyResponse } from './classify-response';
import { FetchOneError, fetchOne } from './fetch-one';
import { clearSWCache, fetchSWMetrics, resetSWMetrics } from './sw-bridge';

export type BenchmarkMode = 'cached' | 'direct';

export type BenchmarkPhase = 'warmup' | 'running';

export type UseBenchmarkResult = {
  log: Array<LogEntry>;
  metrics: SWMetrics | null;
  running: false | BenchmarkMode;
  phase: BenchmarkPhase | null;
  runBenchmark: (useCache: boolean) => Promise<void>;
  clearAll: () => Promise<void>;
  registerCharts: (latency: Chart, compare: Chart) => void;
};

export type UseBenchmarkParams = {
  endpoint: string;
  iterations: number;
};

type RawMetrics = {
  hits: Array<number>;
  misses: Array<number>;
  staleHits: Array<number>;
};

function createEmptyRaw(): RawMetrics {
  return { hits: [], misses: [], staleHits: [] };
}

function avg(values: Array<number>): number {
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

function computeReport(m: RawMetrics, evictions = 0): MetricsReport {
  const hitsCount = m.hits.length + m.staleHits.length;
  const missesCount = m.misses.length;
  const total = hitsCount + missesCount;

  const avgHit = avg(m.hits);
  const avgMiss = avg(m.misses);
  const speedup = avgHit > 0 && avgMiss > 0 ? avgMiss / avgHit : 0;

  return {
    hits: hitsCount,
    misses: missesCount,
    staleHits: m.staleHits.length,
    evictions,
    hitRate: total ? hitsCount / total : 0,
    missRate: total ? missesCount / total : 0,
    swrRate: hitsCount ? m.staleHits.length / hitsCount : 0,
    avgLatencyHit: avgHit,
    avgLatencyMiss: avgMiss,
    p95LatencyHit: percentile(m.hits, 0.95),
    p95LatencyMiss: percentile(m.misses, 0.95),
    speedup,
  };
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) {
    return reason;
  }
  return new DOMException('Aborted', 'AbortError');
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function useBenchmark({ endpoint, iterations }: UseBenchmarkParams): UseBenchmarkResult {
  const [log, setLog] = useState<Array<LogEntry>>([]);
  const [metrics, setMetrics] = useState<SWMetrics | null>(null);
  const [running, setRunning] = useState<false | BenchmarkMode>(false);
  const [phase, setPhase] = useState<BenchmarkPhase | null>(null);
  const [, setCompareData] = useState<CompareData>({ cached: null, direct: null });

  const logId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const latencyChart = useRef<Chart | null>(null);
  const compareChart = useRef<Chart | null>(null);
  const rawMetricsRef = useRef<RawMetrics>(createEmptyRaw());

  const registerCharts = useCallback((latency: Chart, compare: Chart) => {
    latencyChart.current = latency;
    compareChart.current = compare;
  }, []);

  const pushLogEntry = useCallback((type: LogEntryType, ms: number, url: string) => {
    setLog((prev) => [
      {
        id: ++logId.current,
        time: new Date().toLocaleTimeString('ru', { hour12: false }),
        type,
        ms,
        url,
      },
      ...prev.slice(0, LOG_MAX_ENTRIES - 1),
    ]);
  }, []);

  const recordResult = useCallback((type: LogEntryType, ms: number) => {
    const raw = rawMetricsRef.current;
    if (type === 'HIT') {
      raw.hits.push(ms);
    } else if (type === 'MISS') {
      raw.misses.push(ms);
    } else if (type === 'STALE' || type === 'OFFLINE') {
      raw.staleHits.push(ms);
    } else {
      return;
    }
    setMetrics((prev) => computeReport(raw, prev?.evictions ?? 0));
  }, []);

  const updateLatencyChart = useCallback((datasetIndex: number, iteration: number, ms: number) => {
    const chart = latencyChart.current;
    if (!chart) {
      return;
    }
    if ((chart.data.labels?.length ?? 0) <= iteration) {
      chart.data.labels?.push(`#${iteration + 1}`);
    }
    chart.data.datasets[datasetIndex].data[iteration] = parseFloat(ms.toFixed(1));
    chart.update('none');
  }, []);

  const updateCompareChart = useCallback((useCache: boolean, value: number) => {
    setCompareData((prev) => {
      const next: CompareData = { ...prev, [useCache ? 'cached' : 'direct']: value };
      const chart = compareChart.current;
      if (chart) {
        chart.data.datasets[0].data = [next.cached ?? 0, next.direct ?? 0];
        chart.update();
      }
      return next;
    });
  }, []);

  const runBenchmark = useCallback(
    async (useCache: boolean) => {
      if (running) {
        return;
      }
      setRunning(useCache ? 'cached' : 'direct');

      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      try {
        setPhase('warmup');
        try {
          await fetchOne(endpoint, false, -1, { signal, timeoutMs: WARMUP_TIMEOUT_MS });
        } catch (warmupErr) {
          if (warmupErr instanceof FetchOneError && warmupErr.kind === 'ABORTED') {
            return;
          }
          console.warn('Warmup failed (ignored):', warmupErr);
        }

        if (signal.aborted) {
          return;
        }

        setPhase('running');

        const datasetIndex = useCache ? 0 : 1;
        const total = Math.min(iterations, MAX_ITERATIONS);
        let consecutiveErrors = 0;

        for (let i = 0; i < total; i++) {
          if (signal.aborted) {
            return;
          }

          let ms = 0;
          let type: LogEntryType = 'MISS';
          let isError = false;

          try {
            const result = await fetchOne(endpoint, useCache, i, { signal });
            ms = result.ms;
            type = classifyResponse(useCache, result.response);
          } catch (err) {
            if (err instanceof FetchOneError) {
              if (err.kind === 'ABORTED') {
                return;
              }
              ms = err.ms;
              type = err.kind;
              isError = true;
              console.warn(`Request #${i + 1} failed: ${err.kind}`, err.cause);
            } else {
              console.warn(`Request #${i + 1} failed:`, err);
              type = 'NETWORK';
              isError = true;
            }
          }
          const swReport = await fetchSWMetrics();
          const evictions = swReport?.evictions ?? 0;
          const report = computeReport(rawMetricsRef.current, evictions);
          setMetrics(report);

          if (signal.aborted) {
            return;
          }

          pushLogEntry(type, ms, endpoint);
          if (!isError) {
            recordResult(type, ms);
            updateLatencyChart(datasetIndex, i, ms);
          }

          consecutiveErrors = isError ? consecutiveErrors + 1 : 0;
          if (consecutiveErrors >= CONSECUTIVE_ERRORS_TO_ABORT) {
            console.warn(`Aborted benchmark after ${consecutiveErrors} consecutive errors`);
            return;
          }

          try {
            await delay(INTER_REQUEST_DELAY_MS, signal);
          } catch {
            return;
          }
        }

        const report = computeReport(rawMetricsRef.current);
        const compareValue = useCache ? report.avgLatencyHit : report.avgLatencyMiss;
        if (compareValue > 0) {
          updateCompareChart(useCache, parseFloat(compareValue.toFixed(1)));
        }
      } catch (e) {
        console.error('Benchmark failed:', e);
      } finally {
        abortRef.current = null;
        setRunning(false);
        setPhase(null);
      }
    },
    [running, iterations, endpoint, pushLogEntry, recordResult, updateLatencyChart, updateCompareChart],
  );

  const clearAll = useCallback(async () => {
    abortRef.current?.abort(new DOMException('Cleared', 'AbortError'));
    abortRef.current = null;

    await Promise.all([resetSWMetrics(), clearSWCache()]);
    rawMetricsRef.current = createEmptyRaw();
    setLog([]);
    setMetrics(null);
    setCompareData({ cached: null, direct: null });

    const lc = latencyChart.current;
    if (lc) {
      lc.data.labels = [];
      lc.data.datasets[0].data = [];
      lc.data.datasets[1].data = [];
      lc.update();
    }

    const cc = compareChart.current;
    if (cc) {
      cc.data.datasets[0].data = [0, 0];
      cc.update();
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort(new DOMException('Unmounted', 'AbortError'));
      abortRef.current = null;
    };
  }, []);

  return {
    log,
    metrics,
    running,
    phase,
    runBenchmark,
    clearAll,
    registerCharts,
  };
}
