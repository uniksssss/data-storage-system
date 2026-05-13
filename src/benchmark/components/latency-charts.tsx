import { useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js';
import {
  chartCardCss,
  chartLegendCss,
  chartLegendItemCss,
  chartsGridCss,
  chartTitleCss,
  chartWrapperCss,
  legendDotCss,
} from '../benchmark.style';

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
);

type LatencyChartsProps = {
  onChartsReady: (latency: Chart, compare: Chart) => void;
};

export function LatencyCharts({ onChartsReady }: LatencyChartsProps) {
  const latencyRef = useRef<HTMLCanvasElement>(null);
  const compareRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!latencyRef.current || !compareRef.current) {
      return;
    }

    const latencyChart = new Chart(latencyRef.current, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'С кешем',
            data: [],
            borderColor: '#1D9E75',
            backgroundColor: 'rgba(29,158,117,0.08)',
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: 'Без кеша',
            data: [],
            borderColor: '#D85A30',
            backgroundColor: 'rgba(216,90,48,0.08)',
            tension: 0.3,
            pointRadius: 3,
            borderDash: [4, 3],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}мс` } } },
      },
    });

    const compareChart = new Chart(compareRef.current, {
      type: 'bar',
      data: {
        labels: ['С кешем', 'Без кеша'],
        datasets: [{ data: [0, 0], backgroundColor: ['#1D9E75', '#D85A30'] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}мс` } } },
      },
    });

    onChartsReady(latencyChart, compareChart);

    return () => {
      latencyChart.destroy();
      compareChart.destroy();
    };
  }, [onChartsReady]);

  return (
    <div css={chartsGridCss}>
      <div css={chartCardCss}>
        <p css={chartTitleCss}>Latency по запросам (мс)</p>
        <div css={chartLegendCss}>
          <span css={chartLegendItemCss}>
            <span css={legendDotCss('#1D9E75')} />С кешем
          </span>
          <span css={chartLegendItemCss}>
            <span css={legendDotCss('#D85A30')} />
            Без кеша
          </span>
        </div>
        <div css={chartWrapperCss}>
          <canvas ref={latencyRef} />
        </div>
      </div>
      <div css={chartCardCss}>
        <p css={chartTitleCss}>Avg мс: с кешем vs без</p>
        <div css={chartWrapperCss}>
          <canvas ref={compareRef} />
        </div>
      </div>
    </div>
  );
}
