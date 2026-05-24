import { css } from '@emotion/react';

export const containerCss = css`
  font-family: var(--font-sans);
  padding: 1rem 0;
`;

export const contentLayoutCss = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
  gap: 16px;
  align-items: start;
`;

export const mainColumnCss = css`
  min-width: 0;
`;

export const statusRowCss = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 1rem;
  font-size: 13px;
`;

export const metricsGridCss = css`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 1.25rem;
`;

export const metricCardCss = css`
  background: var(--color-background-secondary);
  border-radius: 8px;
  padding: 0.75rem 1rem;
`;

export const metricLabelCss = css`
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
`;

export const metricValueCss = css`
  margin: 0;
  font-size: 22px;
  font-weight: 500;
`;

export const metricSubCss = css`
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--color-text-tertiary);
`;

export const controlsCss = css`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 1.25rem;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
`;

export const iterationsLabelCss = css`
  font-size: 12px;
  color: var(--color-text-secondary);
`;

export const chartsGridCss = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 1rem;
`;

export const chartCardCss = css`
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: 12px;
  padding: 1rem 1.25rem;
`;

export const chartTitleCss = css`
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
`;

export const chartLegendCss = css`
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
`;

export const chartLegendItemCss = css`
  display: flex;
  align-items: center;
  gap: 4px;
`;

export const chartWrapperCss = css`
  position: relative;
  height: 180px;
`;

export const logCardCss = css`
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  min-width: 0;
`;

export const logTitleCss = css`
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
`;

export const logScrollCss = css`
  max-height: 470px;
  overflow-y: auto;
`;

export const logEmptyCss = css`
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
`;

export const logRowCss = css`
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 0.5px solid var(--color-border-tertiary);
`;

export const logTimeCss = css`
  color: var(--color-text-tertiary);
  min-width: 52px;
  font-family: var(--font-mono);
`;

export const logMsCss = css`
  font-family: var(--font-mono);
  min-width: 60px;
`;

export const logUrlCss = css`
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const statusDotCss = (active: boolean) => css`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${active ? '#639922' : '#888'};
  display: inline-block;
`;

import type { LogEntryType } from './benchmark.types';

const LOG_BADGE_BG: Record<LogEntryType, string> = {
  HIT: '#EAF3DE',
  STALE: '#FAEEDA',
  OFFLINE: '#E1ECF7',
  MISS: '#FAECE7',
  TIMEOUT: '#F4D7D7',
  NETWORK: '#F4D7D7',
};

const LOG_BADGE_FG: Record<LogEntryType, string> = {
  HIT: '#3B6D11',
  STALE: '#854F0B',
  OFFLINE: '#1F4F7A',
  MISS: '#993C1D',
  TIMEOUT: '#7A1F1F',
  NETWORK: '#7A1F1F',
};

export const logBadgeCss = (type: LogEntryType) => css`
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  font-weight: 500;
  background: ${LOG_BADGE_BG[type]};
  color: ${LOG_BADGE_FG[type]};
`;

export const legendDotCss = (color: string) => css`
  width: 10px;
  height: 3px;
  background: ${color};
  display: inline-block;
  border-radius: 2px;
`;
