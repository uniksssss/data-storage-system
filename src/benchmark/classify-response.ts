import type { LogEntryType } from './benchmark.types';

export function classifyResponse(useCache: boolean, response: Response): LogEntryType {
  if (!useCache) {
    return 'MISS';
  }

  const status = response.headers.get('X-Cache-Status');
  if (status === 'STALE') {
    return 'STALE';
  }
  if (status === 'OFFLINE') {
    return 'OFFLINE';
  }

  const cache = response.headers.get('X-Cache');
  if (cache === 'HIT') {
    return 'HIT';
  }

  return 'MISS';
}
