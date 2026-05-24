/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { CacheClient } from './domain/cache-client/cache-client.service';
import { DEFAULT_CACHE_NAMESPACE, DEFAULT_SWR_MS, DEFAULT_TTL_MS } from './domain/cache-client/cache-client.consts';
import { StorageDriver } from './domain/storage-driver/storage-driver';
import { InMemoryDriver } from './domain/storage-driver/in-memory-driver.service';
import { TieredDriver } from './domain/storage-driver/tiered-driver.service';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_COLD_LIMIT_BYTES,
  DEFAULT_HOT_LIMIT_BYTES,
  DEFAULT_HOT_MAX_ENTRIES,
  DEFAULT_WARM_UP_TOP_N,
} from './domain/storage-driver/tiered-driver.consts';
import { Serializer } from './domain/serializer/serializer.service';
import { EvictionPolicy } from './domain/eviction-policy/eviction-policy.service';
import { UsageTracker } from './domain/usage-tracker/usage-tracker.service';
import { MetricsCollector } from './domain/metrics/metrics-collector.service';
import { BASE_URL } from './consts';
import { SW_MESSAGE, type SWRequest } from './sw-messages';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

const storage = new TieredDriver(new InMemoryDriver(), new StorageDriver(), {
  batchSize: DEFAULT_BATCH_SIZE,
  hotMaxEntries: DEFAULT_HOT_MAX_ENTRIES,
  warmUpTopN: DEFAULT_WARM_UP_TOP_N,
});
const usageTracker = new UsageTracker();
const metrics = new MetricsCollector();
const cacheClient = new CacheClient(new EvictionPolicy(), usageTracker, storage, new Serializer(), metrics);

const ready = (async () => {
  await storage.init({ maxStorageSize: [DEFAULT_HOT_LIMIT_BYTES, DEFAULT_COLD_LIMIT_BYTES] });
  await cacheClient.init();
})();

const inflight = new Map<string, Promise<Response>>();

function shouldHandleRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.url.startsWith(BASE_URL) && url.searchParams.get('__cache') === '1';
}

function normalizeUrl(request: Request): string {
  const url = new URL(request.url);
  url.searchParams.delete('__cache');
  return url.toString();
}

async function fetchAndCache(normalizedUrl: string, key: string): Promise<Response> {
  const existing = inflight.get(key);
  if (existing) {
    return existing.then((res) => res.clone());
  }

  const promise = (async () => {
    const tNet = performance.now();
    const response = await fetch(normalizedUrl, { cache: 'no-store' });
    const networkLatency = performance.now() - tNet;
    metrics.recordMiss(networkLatency);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data: unknown = await response.clone().json();
      await cacheClient.set(DEFAULT_CACHE_NAMESPACE, key, data, { ttl: DEFAULT_TTL_MS, swr: DEFAULT_SWR_MS });
    }

    return response;
  })();

  inflight.set(key, promise);
  try {
    const res = await promise;
    return res.clone();
  } finally {
    inflight.delete(key);
  }
}

async function handleApiRequest(request: Request, event: FetchEvent): Promise<Response> {
  await ready;

  const normalizedUrl = normalizeUrl(request);
  const key = normalizedUrl;
  const namespace = DEFAULT_CACHE_NAMESPACE;

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
    event.waitUntil(fetchAndCache(normalizedUrl, key).catch(() => undefined));
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
    return await fetchAndCache(normalizedUrl, key);
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

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as SWRequest | undefined;
  if (!data) {
    return;
  }

  switch (data.type) {
    case SW_MESSAGE.GET_METRICS:
      event.ports[0]?.postMessage(metrics.getReport());
      return;
    case SW_MESSAGE.RESET_METRICS:
      metrics.reset();
      event.ports[0]?.postMessage({ ok: true });
      return;
    case SW_MESSAGE.CLEAR_CACHE: {
      const port = event.ports[0];
      event.waitUntil(
        (async () => {
          await ready;
          inflight.clear();
          await cacheClient.clear(DEFAULT_CACHE_NAMESPACE);
          port?.postMessage({ ok: true });
        })().catch((err: unknown) => {
          console.error('CLEAR_CACHE failed:', err);
          port?.postMessage({ ok: false });
        }),
      );
      return;
    }
  }
});
