import type { MetricsReport } from './domain/metrics/metrics.types';

export const SW_MESSAGE = {
  GET_METRICS: 'GET_METRICS',
  RESET_METRICS: 'RESET_METRICS',
  CLEAR_CACHE: 'CLEAR_CACHE',
} as const;

export type SWMessageType = (typeof SW_MESSAGE)[keyof typeof SW_MESSAGE];

export type SWRequest =
  | { type: typeof SW_MESSAGE.GET_METRICS }
  | { type: typeof SW_MESSAGE.RESET_METRICS }
  | { type: typeof SW_MESSAGE.CLEAR_CACHE };

export type SWResponse<T extends SWMessageType> = T extends typeof SW_MESSAGE.GET_METRICS
  ? MetricsReport
  : T extends typeof SW_MESSAGE.RESET_METRICS
    ? { ok: boolean }
    : T extends typeof SW_MESSAGE.CLEAR_CACHE
      ? { ok: boolean }
      : never;
