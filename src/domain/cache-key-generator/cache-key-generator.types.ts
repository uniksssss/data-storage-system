export type CacheKeyGeneratorConfig = {
  separator?: string;
  paramsHandler?: RequestBodyParamsHandler;
  apiVersionExtractor?: (request: Request) => Promise<string>;
};

export type RequestBodyParamsHandler = {
  hash: (params: string) => Promise<string>;
  predicate: (hash: string) => boolean;
};

export type CacheKeyPayload = {
  url: string;
  method?: string;
};
