import type { ISerializer } from '../cache-client/dependencies/serializer.interface';
import type { CacheRecord } from '../types';

export class Serializer implements ISerializer {
  encode<T>(record: CacheRecord<T>['data']): Promise<Uint8Array> {
    try {
      const wrappedData = { data: record };
      const jsonString = JSON.stringify(wrappedData);
      const encoder = new TextEncoder();

      return Promise.resolve(encoder.encode(jsonString));
    } catch (error) {
      return Promise.reject(
        new Error(`Serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
    }
  }

  decode<T>(data: Uint8Array): Promise<CacheRecord<T>['data']> {
    try {
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(data);
      const wrappedData = JSON.parse(jsonString) as { data: unknown };

      return Promise.resolve(wrappedData.data as CacheRecord<T>['data']);
    } catch (error) {
      return Promise.reject(
        new Error(`Deserialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
    }
  }
}
