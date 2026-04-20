export type CacheKeyGeneratorConfig = {
  separator?: string;
  paramsHandler?: RequestBodyParamsHandler;
  apiVersionExtractor?: (request: Request) => Promise<string>;
  headerAllowList?: string[];
  bodyAllowList?: string[];
  headersSelector?: (headers: Headers) => Record<string, string> | null;
  bodySelector?: (body: Record<string, unknown>) => unknown;
};

export type RequestBodyParamsHandler = {
  hash: (params: string) => Promise<string>;
  predicate: (hash: string) => boolean;
};

export type CacheKeyPayload = {
  url: string;
  method?: string;
  apiVersion?: string;
};
