/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { CacheClient } from './domain/cache-client/cache-client.service';
import { StorageDriver } from './domain/storage-driver/storage-driver';
import { Serializer } from './domain/serializer/serializer.service';
import { EvictionPolicy } from './domain/eviction-policy/eviction-policy.service';
import { UsageTracker } from './domain/usage-tracker/usage-tracker.service';
import { MetricsCollector } from './benchmark/metrics-collector';
import { BASE_URL } from './consts';
import { parseJson } from './api';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

const cacheClient = new CacheClient(
  new EvictionPolicy(0.8),
  new UsageTracker(0, {}),
  new StorageDriver(),
  new Serializer(),
);
const metrics = new MetricsCollector();
const CACHE_NAMESPACE = 'api';

function shouldHandleRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.url.startsWith(BASE_URL) && url.searchParams.get('__cache') === '1';
}

async function handleApiRequest(request: Request, event: FetchEvent): Promise<Response> {
  const url = new URL(request.url);
  url.searchParams.delete('__cache');

  const normalizedUrl = url.toString();

  const key = normalizedUrl;
  const namespace = CACHE_NAMESPACE;

  const t0 = performance.now();
  const cached = await cacheClient.get(namespace, key);
  const cacheReadLatency = performance.now() - t0;

  if (cached?.isFresh) {
    metrics.recordHit(cacheReadLatency, false);
    return new Response(JSON.stringify(cached.data), {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-Status': 'FRESH',
        'Access-Control-Expose-Headers': 'X-Cache, X-Cache-Status',
      },
    });
  }

  if (cached?.isStale) {
    metrics.recordHit(cacheReadLatency, true);
    event.waitUntil(
      fetch(normalizedUrl, { cache: 'no-store' })
        .then(async (res) => {
          const data = await parseJson<unknown>(res.clone());
          await cacheClient.set(namespace, key, data, { ttl: 5000, swr: 5000 });
        })
        .catch(() => {}),
    );
    return new Response(JSON.stringify(cached.data), {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-Status': 'STALE',
        'Access-Control-Expose-Headers': 'X-Cache, X-Cache-Status',
      },
    });
  }

  try {
    const tNet = performance.now();
    const response = await fetch(normalizedUrl, { cache: 'no-store' });
    const networkLatency = performance.now() - tNet;
    metrics.recordMiss(networkLatency);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data: unknown = await response.clone().json();
      await cacheClient.set(namespace, key, data, { ttl: 5000, swr: 5000 });
    }

    return response;
  } catch {
    const expired = await cacheClient.getExpired(namespace, key);
    if (expired) {
      return new Response(JSON.stringify(expired.data), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
          'X-Cache-Status': 'OFFLINE',
          'Access-Control-Expose-Headers': 'X-Cache, X-Cache-Status',
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Network unavailable and no cached data' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  }
}

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', () => {
  void self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.href.startsWith(BASE_URL) && url.searchParams.get('__cache') !== '1') {
    return;
  }

  if (shouldHandleRequest(event.request)) {
    event.respondWith(handleApiRequest(event.request, event));
  }
});

interface SWMessage {
  type: string;
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as SWMessage;
  if (data?.type === 'GET_METRICS') {
    event.ports[0]?.postMessage(metrics.getReport());
  }
  if (data?.type === 'RESET_METRICS') {
    metrics.reset();
    event.ports[0]?.postMessage({ ok: true });
  }
});
