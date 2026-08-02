import type { Store, StoreResult } from './types.js';

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryStore implements Store {
  private readonly buckets = new Map<string, Bucket>();
  private readonly cleanupInterval: NodeJS.Timeout | null;

  constructor(cleanupMs = 60_000) {
    this.cleanupInterval = setInterval(() => {
      this.prune(Date.now());
    }, cleanupMs);
    this.cleanupInterval.unref();
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  async increment(key: string, windowMs: number, now = Date.now()): Promise<StoreResult> {
    const resetAt = now + windowMs;
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt });
      return { total: 1, resetAt };
    }
    existing.count += 1;
    return { total: existing.count, resetAt: existing.resetAt };
  }

  async decrement(key: string): Promise<void> {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.count = Math.max(0, bucket.count - 1);
    }
  }

  async resetKey(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  async resetAll(): Promise<void> {
    this.buckets.clear();
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export class SlidingWindowStore implements Store {
  private readonly logs = new Map<string, number[]>();

  async increment(key: string, windowMs: number, now = Date.now()): Promise<StoreResult> {
    const cutoff = now - windowMs;
    const log = (this.logs.get(key) ?? []).filter((ts) => ts > cutoff);
    log.push(now);
    this.logs.set(key, log);
    return {
      total: log.length,
      resetAt: log.length > 0 ? log[0] + windowMs : now + windowMs,
    };
  }

  async decrement(key: string): Promise<void> {
    const log = this.logs.get(key);
    if (log && log.length > 0) {
      log.pop();
    }
  }

  async resetKey(key: string): Promise<void> {
    this.logs.delete(key);
  }

  async resetAll(): Promise<void> {
    this.logs.clear();
  }
}
