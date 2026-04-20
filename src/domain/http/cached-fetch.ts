import { CACHE_OPT_IN_HEADER } from '../consts';

type CachedFetchOptions = RequestInit & {
  swCache?: boolean;
};

export function cachedFetch(input: RequestInfo | URL, init: CachedFetchOptions = {}): Promise<Response> {
  const { swCache, headers, ...rest } = init;
  const resolvedHeaders = new Headers(headers);

  if (swCache) {
    resolvedHeaders.set(CACHE_OPT_IN_HEADER, '1');
  }

  return fetch(input, { ...rest, headers: resolvedHeaders });
}
