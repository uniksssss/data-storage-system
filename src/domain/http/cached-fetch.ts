type CachedFetchOptions = RequestInit & {
  swCache?: boolean;
};

export function cachedFetch(input: RequestInfo | URL, init: CachedFetchOptions = {}): Promise<Response> {
  const { swCache, ...rest } = init;

  let url: string;

  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else {
    url = input.url;
  }

  if (swCache) {
    const u = new URL(url);
    u.searchParams.set('__cache', '1');
    url = u.toString();
  }

  return fetch(url, rest);
}
