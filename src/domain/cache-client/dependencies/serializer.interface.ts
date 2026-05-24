export interface ISerializer {
  encode<T>(data: T): Promise<Uint8Array>;
  decode<T>(buffer: Uint8Array): Promise<T>;
}
