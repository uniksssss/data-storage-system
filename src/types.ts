export type JsonRpcRequestBody = {
  id: string | number;
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
};

export const isJsonRpcRequestBody = (data: Record<string, unknown>): data is JsonRpcRequestBody =>
  !!data && typeof data === 'object' && 'jsonrpc' in data;
