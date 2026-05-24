import type { ISerializer } from '../cache-client/dependencies/serializer.interface';

export class Serializer implements ISerializer {
  encode<T>(data: T): Promise<Uint8Array> {
    try {
      const jsonString = JSON.stringify(data);
      const encoder = new TextEncoder();
      return Promise.resolve(encoder.encode(jsonString));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Promise.reject(new Error(`Serialization failed: ${message}`));
    }
  }

  decode<T>(data: Uint8Array): Promise<T> {
    try {
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(data);
      return Promise.resolve(JSON.parse(jsonString) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Promise.reject(new Error(`Deserialization failed: ${message}`));
    }
  }
}
