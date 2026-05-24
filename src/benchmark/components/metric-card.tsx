import { metricCardCss, metricLabelCss, metricSubCss, metricValueCss } from '../benchmark.style';

type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
};

export function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div css={metricCardCss}>
      <p css={metricLabelCss}>{label}</p>
      <p css={metricValueCss}>{value}</p>
      {sub && <p css={metricSubCss}>{sub}</p>}
    </div>
  );
}
