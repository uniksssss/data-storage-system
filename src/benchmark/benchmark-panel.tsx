import { useState } from 'react';
import { ENDPOINTS } from '../consts';
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
import { MAX_ITERATIONS } from './benchmark.consts';
import { LatencyCharts } from './components/latency-charts';
import { MetricCard } from './components/metric-card';
import { RequestLog } from './components/request-log';
import { useSwActive } from './use-sw-active';
import { useBenchmark } from './use-benchmark';

function formatMs(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || value <= 0) {
    return '—';
  }
  return `${value.toFixed(1)}${suffix}`;
}

export function BenchmarkPanel() {
  const swActive = useSwActive();
  const [endpoint, setEndpoint] = useState('/todos/1');
  const [iterations, setIterations] = useState(10);

  const { log, metrics, running, phase, runBenchmark, clearAll, registerCharts } = useBenchmark({
    endpoint,
    iterations,
  });

  const runningLabel = (mode: 'cached' | 'direct', defaultLabel: string) => {
    if (running !== mode) {
      return defaultLabel;
    }
    return phase === 'warmup' ? 'Прогрев...' : 'Запускается...';
  };

  const avgHit = metrics?.avgLatencyHit ?? 0;
  const avgMiss = metrics?.avgLatencyMiss ?? 0;
  const speedup = metrics?.speedup ?? 0;

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
            <MetricCard label="Avg HIT" value={formatMs(avgHit, ' мс')} sub="из кеша" />
            <MetricCard label="Avg MISS" value={formatMs(avgMiss, ' мс')} sub="из сети" />
            <MetricCard label="Ускорение" value={speedup > 1 ? `${speedup.toFixed(1)}×` : '—'} sub="кеш vs сеть" />
            <MetricCard
              label="Вытеснений"
              value={metrics?.evictions ? `${metrics.evictions}` : '—'}
              sub="из хранилища"
            />
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
              max={MAX_ITERATIONS}
              onChange={(e) => setIterations(Number(e.target.value))}
              style={{ width: 70, fontSize: 13 }}
            />
            <span css={iterationsLabelCss}>запросов</span>
            <button onClick={() => void runBenchmark(true)} disabled={running !== false} style={{ fontSize: 12 }}>
              {runningLabel('cached', 'Запустить с кешем')}
            </button>
            <button onClick={() => void runBenchmark(false)} disabled={running !== false} style={{ fontSize: 12 }}>
              {runningLabel('direct', 'Запустить без кеша')}
            </button>
            <button onClick={() => void clearAll()} style={{ fontSize: 12 }}>
              Сбросить
            </button>
          </div>

          <LatencyCharts onChartsReady={registerCharts} />
        </div>
        <RequestLog log={log} />
      </div>
    </div>
  );
}
