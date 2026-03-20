import { type JsonRpcRequestBody, isJsonRpcRequestBody } from '../../types';
import { CACHE_API_VERSION_HEADER } from '../consts';
import { DEFAULT_SEPARATOR, FALLBACK_API_VERSION } from './cache-key-generator.consts';
import type { CacheKeyGeneratorConfig, CacheKeyPayload, RequestBodyParamsHandler } from './cache-key-generator.types';

export class CacheKeyGenerator {
  private readonly separator: string;
  private readonly paramsHandler: RequestBodyParamsHandler;
  private readonly apiVersionExtractor: (request: Request) => Promise<string>;

  constructor(config?: CacheKeyGeneratorConfig) {
    const { separator, paramsHandler, apiVersionExtractor } = config ?? {};

    this.separator = separator || DEFAULT_SEPARATOR;
    this.paramsHandler = paramsHandler || this.createDefaultParamsHandler();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this.apiVersionExtractor = apiVersionExtractor || this.defaultApiVersionExtractor;
  }

  private createDefaultParamsHandler(): RequestBodyParamsHandler {
    const hash = async (params: string): Promise<string> => {
      const encoder = new TextEncoder();
      const data = encoder.encode(params);

      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));

      return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('');
    };

    // Эвристика: метод json-rpc обычно выглядит как название метода (латинские буквы, точки, подчеркивания)
    // а хеш SHA-256 состоит из 64 hex-символов
    const predicate = (h: string): boolean => /^[a-f0-9]{64}$/.test(h);

    return {
      hash,
      predicate,
    };
  }

  private defaultApiVersionExtractor(request: Request): Promise<string> {
    return Promise.resolve(request.headers.get(CACHE_API_VERSION_HEADER) ?? FALLBACK_API_VERSION);
  }

  private async extractBody(request: Request): Promise<Record<string, unknown> | null> {
    const requestClone = request.clone();
    const contentType = requestClone.headers.get('content-type') || '';
    let body: Record<string, unknown> | null = null;

    try {
      if (contentType.includes('application/json')) {
        body = (await requestClone.json()) as Record<string, unknown>;
      }

      if (contentType.includes('text/plain')) {
        const text = await requestClone.text();
        body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      }
    } catch (error) {
      return null;
    }

    if (!body) {
      return null;
    }

    return this.normalize(body);
  }

  private extractJsonRpcRequestBodyData({
    method,
    params,
  }: JsonRpcRequestBody): Pick<JsonRpcRequestBody, 'method' | 'params'> {
    return {
      method,
      params,
    };
  }

  private getUrlPart(url: URL): string {
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    const query = this.normalizeSearchParams(new URLSearchParams(url.search));

    return `${path}${query ? `?${query}` : ''}`;
  }

  private normalize<T>(data: T): T {
    if (Array.isArray(data)) {
      return data.map((item: unknown) => this.normalize(item)) as unknown as T;
    }

    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const obj = data as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    Object.keys(obj)
      .sort()
      .forEach((key: string) => {
        sorted[key] = this.normalize(obj[key]);
      });

    return sorted as T;
  }

  private normalizeSearchParams(searchParams: URLSearchParams): string {
    const params: Record<string, string> = {};

    searchParams.forEach((value: string, key: string) => {
      params[key] = value;
    });

    return new URLSearchParams(this.normalize(params)).toString();
  }

  public extractPayload(key: string): CacheKeyPayload {
    const parts = key.split(this.separator);
    const url = parts[0];

    // Структура ключа: [url, apiVersion, method?, paramsHash?]
    // Проблема: третья часть может быть либо методом (json-rpc), либо хешем (http)
    let method: string | undefined;

    if (parts.length >= 3) {
      const potentialMethod = parts[2];

      const isHash = this.paramsHandler.predicate(potentialMethod);

      if (!isHash) {
        method = potentialMethod;
      }
    }

    return {
      url,
      ...(method && { method }),
    };
  }

  public async getKey(request: Request): Promise<string> {
    const url = new URL(request.url);
    const parts: Array<string | null> = [];
    const urlPart = this.getUrlPart(url);

    parts.push(urlPart);
    parts.push(request.method);
    parts.push(await this.apiVersionExtractor(request.clone()));

    const body = await this.extractBody(request);

    if (body) {
      if (isJsonRpcRequestBody(body)) {
        const { method, params } = this.extractJsonRpcRequestBodyData(body);

        parts.push(method);
        parts.push(await this.paramsHandler.hash(JSON.stringify(params)));
      } else {
        parts.push(await this.paramsHandler.hash(JSON.stringify(body)));
      }
    }

    return parts.filter((part: string | null) => !!part).join(this.separator);
  }
}
