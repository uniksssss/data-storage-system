import { CACHE_API_VERSION_HEADER } from '../consts';
import { DEFAULT_SEPARATOR, FALLBACK_API_VERSION } from './cache-key-generator.consts';
import type { CacheKeyGeneratorConfig, CacheKeyPayload, RequestBodyParamsHandler } from './cache-key-generator.types';

export class CacheKeyGenerator {
  private readonly separator: string;
  private readonly paramsHandler: RequestBodyParamsHandler;
  private readonly apiVersionExtractor: (request: Request) => Promise<string>;
  private readonly headerAllowList: string[];
  private readonly bodyAllowList: string[];
  private readonly headersSelector?: (headers: Headers) => Record<string, string> | null;
  private readonly bodySelector?: (body: Record<string, unknown>) => unknown;

  constructor(config?: CacheKeyGeneratorConfig) {
    const resolvedConfig: CacheKeyGeneratorConfig = config ?? {};
    const {
      separator,
      paramsHandler,
      apiVersionExtractor,
      headerAllowList,
      bodyAllowList,
      headersSelector,
      bodySelector,
    } = resolvedConfig;

    this.separator = separator || DEFAULT_SEPARATOR;
    this.paramsHandler = paramsHandler || this.createDefaultParamsHandler();
    this.apiVersionExtractor = apiVersionExtractor || this.defaultApiVersionExtractor;
    this.headerAllowList = (headerAllowList ?? []).map((header: string) => header.toLowerCase());
    this.bodyAllowList = bodyAllowList ?? [];
    this.headersSelector = headersSelector;
    this.bodySelector = bodySelector;
  }

  private createDefaultParamsHandler(): RequestBodyParamsHandler {
    const hash = async (params: string): Promise<string> => {
      const encoder = new TextEncoder();
      const data = encoder.encode(params);

      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));

      return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('');
    };

    const predicate = (h: string): boolean => /^[a-f0-9]{64}$/.test(h);

    return {
      hash,
      predicate,
    };
  }

  private defaultApiVersionExtractor(this: void, request: Request): Promise<string> {
    return Promise.resolve(request.headers.get(CACHE_API_VERSION_HEADER) ?? FALLBACK_API_VERSION);
  }

  private async extractBody(request: Request): Promise<unknown> {
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

    const normalizedBody = this.normalize(body);
    const selectedBody = this.selectBody(normalizedBody);

    if (!this.hasContent(selectedBody)) {
      return null;
    }

    return selectedBody;
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

  private selectBody(body: Record<string, unknown>): unknown {
    if (this.bodySelector) {
      const selected = this.bodySelector(body);

      return this.normalize(selected);
    }

    if (!this.bodyAllowList.length) {
      return body;
    }

    const picked = this.pickByPaths(body, this.bodyAllowList);

    return this.normalize(picked);
  }

  private extractHeaders(request: Request): Record<string, string> | null {
    if (this.headersSelector) {
      const selected = this.headersSelector(request.headers);

      if (!this.hasContent(selected)) {
        return null;
      }

      return this.normalize(selected ?? {});
    }

    if (!this.headerAllowList.length) {
      return null;
    }

    const picked: Record<string, string> = {};

    this.headerAllowList.forEach((header: string) => {
      const value = request.headers.get(header);

      if (value !== null) {
        picked[header] = value;
      }
    });

    if (!this.hasContent(picked)) {
      return null;
    }

    return this.normalize(picked);
  }

  private pickByPaths(source: Record<string, unknown>, paths: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    paths.forEach((path: string) => {
      const trimmedPath = path.trim();

      if (!trimmedPath) {
        return;
      }

      const segments = trimmedPath.split('.').filter(Boolean);
      const value = this.getByPath(source, segments);

      if (typeof value === 'undefined') {
        return;
      }

      this.setByPath(result, segments, value);
    });

    return result;
  }

  private getByPath(source: unknown, segments: string[]): unknown {
    let current: unknown = source;

    for (const segment of segments) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      const key = this.isIndexSegment(segment) && Array.isArray(current) ? Number(segment) : segment;
      const container = current as Record<string, unknown> & Array<unknown>;

      if (!(key in container)) {
        return undefined;
      }

      current = container[key];
    }

    return current;
  }

  private setByPath(target: Record<string, unknown>, segments: string[], value: unknown): void {
    let current: Record<string, unknown> | Array<unknown> = target;

    segments.forEach((segment: string, index: number) => {
      const isLast = index === segments.length - 1;
      const isIndex = this.isIndexSegment(segment);
      const key = isIndex ? Number(segment) : segment;

      if (isLast) {
        if (Array.isArray(current) && typeof key === 'number') {
          current[key] = value;
        } else {
          (current as Record<string, unknown>)[String(key)] = value;
        }

        return;
      }

      const nextSegment = segments[index + 1];
      const nextIsIndex = this.isIndexSegment(nextSegment);

      if (Array.isArray(current) && typeof key === 'number') {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = nextIsIndex ? [] : {};
        }

        current = current[key] as Record<string, unknown> | Array<unknown>;
        return;
      }

      const currentObj = current as Record<string, unknown>;

      if (!currentObj[String(key)] || typeof currentObj[String(key)] !== 'object') {
        currentObj[String(key)] = nextIsIndex ? [] : {};
      }

      current = currentObj[String(key)] as Record<string, unknown> | Array<unknown>;
    });
  }

  private isIndexSegment(segment: string): boolean {
    return /^\d+$/.test(segment);
  }

  private hasContent(data: unknown): boolean {
    if (data === null || typeof data === 'undefined') {
      return false;
    }

    if (Array.isArray(data)) {
      return data.length > 0;
    }

    if (typeof data === 'object') {
      return Object.keys(data as Record<string, unknown>).length > 0;
    }

    return true;
  }

  public extractPayload(key: string): CacheKeyPayload {
    const parts = key.split(this.separator);
    const url = parts[0] ?? '';
    const method = parts[1];
    const apiVersion = parts[2];

    return {
      url,
      ...(method && { method }),
      ...(apiVersion && { apiVersion }),
    };
  }

  public async getKey(request: Request): Promise<string> {
    const url = new URL(request.url);
    const parts: Array<string | null> = [];
    const urlPart = this.getUrlPart(url);

    parts.push(urlPart);
    parts.push(request.method);
    parts.push(await this.apiVersionExtractor(request.clone()));

    const headers = this.extractHeaders(request);
    if (headers) {
      parts.push(await this.paramsHandler.hash(JSON.stringify(headers)));
    }

    const body = await this.extractBody(request);

    if (body) {
      parts.push(await this.paramsHandler.hash(JSON.stringify(body)));
    }

    return parts.filter((part: string | null) => !!part).join(this.separator);
  }
}
