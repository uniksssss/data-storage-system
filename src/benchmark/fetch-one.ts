import { BASE_URL } from '../consts';
import { REQUEST_TIMEOUT_MS } from './benchmark.consts';

export type FetchOneOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type FetchOneResult = {
  ms: number;
  response: Response;
};

export type FetchFailureKind = 'TIMEOUT' | 'NETWORK' | 'ABORTED';

export class FetchOneError extends Error {
  readonly kind: FetchFailureKind;
  readonly ms: number;
  readonly cause?: unknown;

  constructor(kind: FetchFailureKind, ms: number, cause?: unknown) {
    super(`Fetch failed: ${kind}`);
    this.name = 'FetchOneError';
    this.kind = kind;
    this.ms = ms;
    this.cause = cause;
  }
}

export async function fetchOne(
  path: string,
  useCache: boolean,
  iteration: number,
  options: FetchOneOptions = {},
): Promise<FetchOneResult> {
  const url = useCache ? `${BASE_URL}${path}?__cache=1` : `${BASE_URL}${path}?_=${Date.now()}_${iteration}`;

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Timeout', 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      throw new FetchOneError('ABORTED', 0, options.signal.reason);
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const t0 = performance.now();
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    await response.arrayBuffer();
    return { ms: performance.now() - t0, response };
  } catch (err) {
    const ms = performance.now() - t0;
    if (options.signal?.aborted) {
      throw new FetchOneError('ABORTED', ms, err);
    }
    if (timedOut) {
      throw new FetchOneError('TIMEOUT', ms, err);
    }
    throw new FetchOneError('NETWORK', ms, err);
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
