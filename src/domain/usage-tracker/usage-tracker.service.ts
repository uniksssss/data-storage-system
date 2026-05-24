import type { CacheRecordMeta, CacheRecordsMeta } from '../types';

export class UsageTracker {
  private usage = 0;
  private meta: Record<string, CacheRecordsMeta> = {};

  bootstrap(snapshot: Record<string, CacheRecordsMeta> | null): void {
    this.usage = 0;
    this.meta = {};

    if (!snapshot) {
      return;
    }

    for (const [namespace, records] of Object.entries(snapshot)) {
      this.meta[namespace] = { ...records };
      for (const recordMeta of Object.values(records)) {
        this.usage += recordMeta.size ?? 0;
      }
    }
  }

  onSet(namespace: string, key: string, meta: CacheRecordMeta): void {
    const namespaceMeta = this.getOrCreateNamespace(namespace);
    const previousSize = namespaceMeta[key]?.size ?? 0;
    const nextSize = meta.size ?? 0;

    namespaceMeta[key] = meta;
    this.usage = Math.max(this.usage - previousSize, 0) + nextSize;
  }

  onUpdate(namespace: string, key: string, partial: Partial<CacheRecordMeta>): void {
    const existing = this.meta[namespace]?.[key];
    if (!existing) {
      return;
    }

    const next: CacheRecordMeta = { ...existing, ...partial };
    const previousSize = existing.size ?? 0;
    const nextSize = next.size ?? previousSize;

    this.meta[namespace][key] = next;
    if (previousSize !== nextSize) {
      this.usage = Math.max(this.usage - previousSize, 0) + nextSize;
    }
  }

  onDelete(namespace: string, key: string): void {
    const meta = this.meta[namespace]?.[key];
    if (!meta) {
      return;
    }

    this.usage = Math.max(this.usage - (meta.size ?? 0), 0);
    delete this.meta[namespace][key];

    if (Object.keys(this.meta[namespace]).length === 0) {
      delete this.meta[namespace];
    }
  }

  onClear(namespace: string): void {
    const namespaceMeta = this.meta[namespace];
    if (!namespaceMeta) {
      return;
    }

    for (const recordMeta of Object.values(namespaceMeta)) {
      this.usage = Math.max(this.usage - (recordMeta.size ?? 0), 0);
    }

    delete this.meta[namespace];
  }

  getUsage(): number {
    return this.usage;
  }

  getMeta(namespace: string): CacheRecordsMeta | null {
    return this.meta[namespace] ?? null;
  }

  getAllMeta(): Record<string, CacheRecordsMeta> {
    return this.meta;
  }

  private getOrCreateNamespace(namespace: string): CacheRecordsMeta {
    let nsMeta = this.meta[namespace];
    if (!nsMeta) {
      nsMeta = {};
      this.meta[namespace] = nsMeta;
    }
    return nsMeta;
  }
}
