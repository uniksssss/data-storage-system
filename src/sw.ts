/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { CacheClient } from './domain/cache-client/cache-client.service';
import { StorageDriver } from './domain/storage-driver/storage-driver';
import { Serializer } from './domain/serializer/serializer.service';
import { CacheKeyGenerator } from './domain/cache-key-generator/cache-key-generator.service';
import { EvictionPolicy } from './domain/eviction-policy/eviction-policy.service';
import { UsageTracker } from './domain/usage-tracker/usage-tracker.service';
import { CACHE_OPT_IN_HEADER } from './domain/consts';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

const cacheClient = new CacheClient(
  new EvictionPolicy(0.8),
  new UsageTracker(0, {}),
  new StorageDriver(),
  new Serializer(),
);
const keyGenerator = new CacheKeyGenerator();
const CACHE_NAMESPACE = 'api';

function shouldHandleRequest(request: Request): boolean {
  const headerValue = request.headers.get(CACHE_OPT_IN_HEADER);
  if (!headerValue) {
    return false;
  }

  const normalized = headerValue.trim().toLowerCase();

  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

async function handleApiRequest(request: Request, event: FetchEvent): Promise<Response> {
  const key = await keyGenerator.getKey(request);
  const namespace = CACHE_NAMESPACE;
  console.log('--- REQUEST ---', request.url);

  const cached = await cacheClient.get(namespace, key);
  if (!cached) {
    console.log('CACHE MISS');
  }

  if (cached && cached.isFresh) {
    console.log('CACHE HIT (fresh)');
    return new Response(JSON.stringify(cached.data), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (cached && cached.isStale) {
    console.log('CACHE HIT (stale) → background update');
    event.waitUntil(
      fetch(request)
        .then(async (response) => {
          console.log('FETCH FROM NETWORK (background)');
          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.includes('application/json')) {
            return;
          }

          const data: unknown = await response.clone().json();

          await cacheClient.set(namespace, key, data, {
            ttl: 5000,
            swr: 5000,
          });
          console.log('BACKGROUND REFRESH DONE');
        })
        .catch((e) => {
          console.error('Background refresh failed:', e instanceof Error ? e.message : 'Unknown error');
        }),
    );

    return new Response(JSON.stringify(cached.data), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.log('FETCH FROM NETWORK');

  const response = await fetch(request);
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data: unknown = await response.clone().json();

    await cacheClient.set(namespace, key, data, {
      ttl: 5000,
      swr: 5000,
    });
  }

  return response;
}

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', () => {
  void self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (shouldHandleRequest(event.request)) {
    event.respondWith(handleApiRequest(event.request, event));
  }
});
