import { CacheError } from '../errors';
import type { CacheRecordsMeta, CacheRecordMeta } from '../types';
import { DEFAULT_EVICTION_THRESHOLD } from './eviction-policy.consts';
import type { ShouldEvictParams } from './eviction-policy.types';

export class EvictionPolicy {
  private readonly evictionThreshold: number;

  constructor(evictionThreshold: number = DEFAULT_EVICTION_THRESHOLD) {
    if (evictionThreshold <= 0 || evictionThreshold > 1) {
      throw new CacheError('Порог заполненности хранилища должен быть в диапазоне 0...1');
    }

    this.evictionThreshold = evictionThreshold;
  }

  shouldEvict(params: ShouldEvictParams): boolean {
    const { usage, quota, newRecordSize } = params;

    return usage + newRecordSize >= this.evictionThreshold * quota;
  }

  maxAllowedBytes(quota: number): number {
    return this.evictionThreshold * quota;
  }

  async pickVictims(budgetBytes: number, getRecords: () => Promise<CacheRecordsMeta>): Promise<Array<string>> {
    const records = await getRecords();

    const sortedRecordTuples = Object.entries(records).sort(
      (a: [string, CacheRecordMeta], b: [string, CacheRecordMeta]) => a[1].accessedAt - b[1].accessedAt,
    );

    const victims: Array<string> = [];
    let totalSize = 0;

    for (const record of sortedRecordTuples) {
      victims.push(record[0]);
      totalSize += record[1].size ?? 0;

      if (totalSize >= budgetBytes) {
        break;
      }
    }

    return victims;
  }
}
