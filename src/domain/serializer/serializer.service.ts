import type { ISerializer } from '../cache-client/dependencies/serializer.interface';

export class Serializer implements ISerializer {
  encode<T>(data: T): Promise<Uint8Array> {
    try {
      const json = JSON.stringify(data);
      const encoder = new TextEncoder();
      return Promise.resolve(encoder.encode(json));
    } catch (error) {
      return Promise.reject(
        new Error(`Serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
    }
  }

  decode<T>(buffer: Uint8Array): Promise<T> {
    try {
      const decoder = new TextDecoder();
      const json = decoder.decode(buffer);
      return Promise.resolve(JSON.parse(json) as T);
    } catch (error) {
      return Promise.reject(
        new Error(`Deserialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      );
    }
  }
}
