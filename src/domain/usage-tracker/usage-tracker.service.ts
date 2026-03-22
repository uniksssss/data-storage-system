import type { CacheRecordsMeta } from '../types';

export class UsageTracker {
  private usage: number;

  private meta: Record<string, CacheRecordsMeta> | null;

  constructor(initialUsage: number, initialMeta: Record<string, CacheRecordsMeta> | null) {
    this.usage = initialUsage;
    this.meta = initialMeta;
  }

  getMeta(namespace: string): CacheRecordsMeta | null {
    return this.meta?.[namespace] ?? null;
  }

  onDelete(namespace: string, key: string, size: number): void {
    console.log('DELETE:', key, 'SIZE:', size);
    if (!this.meta?.[namespace]?.[key]) {
      return;
    }

    delete this.meta[namespace][key];
    this.usage -= size;
    console.log('USAGE AFTER DELETE:', this.usage);

    if (Object.keys(this.meta[namespace]).length === 0) {
      delete this.meta[namespace];
    }
  }

  getUsage(): number {
    return this.usage;
  }

  onSet(namespace: string, key: string, size: number): void {
    if (!this.meta) {
      this.meta = {};
    }

    if (!this.meta[namespace]) {
      this.meta[namespace] = {};
    }

    const oldSize = this.meta[namespace][key]?.size ?? 0;

    this.meta[namespace][key] = {
      ...this.meta[namespace][key],
      size,
      accessedAt: Date.now(),
    };

    this.usage = this.usage - oldSize + size;
  }
}
