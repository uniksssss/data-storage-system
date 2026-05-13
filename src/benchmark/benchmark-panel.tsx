import { useRef, useState, useCallback } from 'react';
import { Chart } from 'chart.js';
import { BASE_URL, ENDPOINTS } from '../consts';
import {
  containerCss,
  contentLayoutCss,
  mainColumnCss,
  statusRowCss,
  statusDotCss,
  metricsGridCss,
  controlsCss,
  iterationsLabelCss,
} from './benchmark.style';
import type { SWMetrics, LogEntry, CompareData } from './benchmark.types';
import { LatencyCharts } from './components/latency-charts';
import { MetricCard } from './components/metric-card';
import { RequestLog } from './components/request-log';
import { useSwActive } from './use-sw-active';

async function fetchSWMetrics(): Promise<SWMetrics | null> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) {
    return null;
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e: MessageEvent<SWMetrics>) => resolve(e.data);
    sw.postMessage({ type: 'GET_METRICS' }, [channel.port2]);
  });
}

async function resetSWMetrics(): Promise<void> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) {
    return;
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    sw.postMessage({ type: 'RESET_METRICS' }, [channel.port2]);
  });
}

async function fetchOne(path: string, useCache: boolean): Promise<{ ms: number; type: LogEntry['type'] }> {
  const url = useCache ? `${BASE_URL}${path}?__cache=1` : `${BASE_URL}${path}`;
  const t0 = performance.now();
  const res = await fetch(url, { cache: 'no-store' });
  const ms = performance.now() - t0;
  const cacheHeader = res.headers.get('X-Cache');
  const staleHeader = res.headers.get('X-Cache-Status');
  const type: LogEntry['type'] = !useCache
    ? 'MISS'
    : staleHeader === 'STALE'
      ? 'STALE'
      : cacheHeader === 'HIT'
        ? 'HIT'
        : 'MISS';
  return { ms, type };
}

const fmt = (v: number | null | undefined, suffix = '') =>
  v !== null && v !== undefined && v > 0 ? `${v.toFixed(1)}${suffix}` : '—';

export function BenchmarkPanel() {
  const swActive = useSwActive();

  const [endpoint, setEndpoint] = useState('/todos/1');
  const [iterations, setIterations] = useState(10);
  const [running, setRunning] = useState<false | 'cached' | 'direct'>(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<SWMetrics | null>(null);
  const [baselineMs, setBaselineMs] = useState<number | null>(null);
  const [_, setCompareData] = useState<CompareData>({ cached: null, direct: null });

  const logId = useRef(0);
  const latencyChart = useRef<Chart | null>(null);
  const compareChart = useRef<Chart | null>(null);

  const handleChartsReady = useCallback((latency: Chart, compare: Chart) => {
    latencyChart.current = latency;
    compareChart.current = compare;
  }, []);

  const runBenchmark = useCallback(
    async (useCache: boolean) => {
      if (running) {
        return;
      }
      setRunning(useCache ? 'cached' : 'direct');

      try {
        const dsIdx = useCache ? 0 : 1;
        const n = Math.min(iterations, 100);
        const results: number[] = [];

        for (let i = 0; i < n; i++) {
          const { ms, type } = await fetchOne(endpoint, useCache);
          results.push(ms);

          setLog((prev) => [
            {
              id: ++logId.current,
              time: new Date().toLocaleTimeString('ru', { hour12: false }),
              type,
              ms,
              url: endpoint,
            },
            ...prev.slice(0, 49),
          ]);

          const chart = latencyChart.current;
          if (chart) {
            if (chart.data.labels!.length <= i) {
              chart.data.labels!.push(`#${i + 1}`);
            }
            chart.data.datasets[dsIdx].data[i] = parseFloat(ms.toFixed(1));
            chart.update('none');
          }

          await new Promise((r) => setTimeout(r, 80));
        }

        const avg = parseFloat((results.reduce((a, b) => a + b, 0) / results.length).toFixed(1));

        if (!useCache) {
          setBaselineMs(avg);
        }

        setCompareData((prev) => {
          const next = { ...prev, [useCache ? 'cached' : 'direct']: avg };
          const c = compareChart.current;
          if (c) {
            c.data.datasets[0].data = [next.cached ?? 0, next.direct ?? 0];
            c.update();
          }
          return next;
        });

        const report = await fetchSWMetrics();
        if (report) {
          setMetrics(report);
        }
      } catch (e) {
        console.error('Benchmark failed:', e);
      } finally {
        setRunning(false);
      }
    },
    [running, iterations, endpoint],
  );

  const clearAll = useCallback(async () => {
    await resetSWMetrics();
    setLog([]);
    setMetrics(null);
    setBaselineMs(null);
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

  const avgHit = metrics?.avgLatencyHit ?? 0;
  const speedup = avgHit > 0 && baselineMs ? baselineMs / avgHit : 0;

  return (
    <div css={containerCss}>
      <div css={statusRowCss}>
        <span css={statusDotCss(swActive)} />
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {swActive ? 'Service Worker активен' : 'Service Worker не активен — обнови страницу'}
        </span>
      </div>

      <div css={contentLayoutCss}>
        <div css={mainColumnCss}>
          <div css={metricsGridCss}>
            <MetricCard
              label="Hit rate"
              value={metrics ? `${(metrics.hitRate * 100).toFixed(1)}%` : '—'}
              sub="кешированных"
            />
            <MetricCard label="Avg HIT" value={fmt(metrics?.avgLatencyHit, ' мс')} sub="из кеша" />
            <MetricCard label="Avg MISS" value={baselineMs ? `${baselineMs.toFixed(1)} мс` : '—'} sub="из сети" />
            <MetricCard label="Ускорение" value={speedup > 1 ? `${speedup.toFixed(1)}×` : '—'} sub="кеш vs сеть" />
          </div>

          <div css={controlsCss}>
            <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} style={{ fontSize: 13 }}>
              {ENDPOINTS.map((ep) => (
                <option key={ep} value={ep}>
                  {ep}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={iterations}
              min={1}
              max={100}
              onChange={(e) => setIterations(Number(e.target.value))}
              style={{ width: 70, fontSize: 13 }}
            />
            <span css={iterationsLabelCss}>запросов</span>
            <button onClick={() => void runBenchmark(true)} disabled={running !== false} style={{ fontSize: 12 }}>
              {running === 'cached' ? 'Запускается...' : 'Запустить с кешем'}
            </button>
            <button onClick={() => void runBenchmark(false)} disabled={running !== false} style={{ fontSize: 12 }}>
              {running === 'direct' ? 'Запускается...' : 'Запустить без кеша'}
            </button>
            <button onClick={() => void clearAll()} style={{ fontSize: 12 }}>
              Сбросить
            </button>
          </div>

          <LatencyCharts onChartsReady={handleChartsReady} />
        </div>
        <RequestLog log={log} />
      </div>
    </div>
  );
}
