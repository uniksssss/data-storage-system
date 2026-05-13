import { BASE_URL } from './consts';
import { cachedFetch } from './domain/http/cached-fetch';

export type TransportOptions = {
  useCache?: boolean;
};

export async function transportFetch(path: string, options: TransportOptions = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;

  if (options.useCache) {
    return cachedFetch(url, { swCache: true });
  }

  return fetch(url);
}
