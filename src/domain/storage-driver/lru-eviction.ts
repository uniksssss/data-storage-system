import type { CacheRecordsMeta } from '../types';

export type LRUEvictionOptions = {
  targetBytes?: number;
  maxEntries?: number;
};

export class LRUEviction {
  selectKeysToEvict(nsMeta: CacheRecordsMeta, options: LRUEvictionOptions): Array<string> {
    const entries = Object.entries(nsMeta);
    if (entries.length === 0) {
      return [];
    }

    const totalBytes = entries.reduce((sum, [, meta]) => sum + (meta.size ?? 0), 0);
    const totalCount = entries.length;

    const { targetBytes, maxEntries } = options;
    const needShrinkBytes = targetBytes !== undefined && totalBytes > targetBytes;
    const needShrinkCount = maxEntries !== undefined && totalCount > maxEntries;

    if (!needShrinkBytes && !needShrinkCount) {
      return [];
    }

    const sorted = entries.slice().sort((a, b) => a[1].accessedAt - b[1].accessedAt);

    let remainingBytes = totalBytes;
    let remainingCount = totalCount;
    const victims: Array<string> = [];

    for (const [key, meta] of sorted) {
      const overBytes = targetBytes !== undefined && remainingBytes > targetBytes;
      const overCount = maxEntries !== undefined && remainingCount > maxEntries;

      if (!overBytes && !overCount) {
        break;
      }

      victims.push(key);
      remainingBytes -= meta.size ?? 0;
      remainingCount -= 1;
    }

    return victims;
  }
}
