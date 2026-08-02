/**
 * In-memory store implementations: a fixed-window bucket store and a
 * sliding-window log store.
 *
 * @module memory-store
 */

import type { Store, StoreResult } from './types.js';

/**
 * A single counter bucket keyed by client key.
 *
 * @interface Bucket
 * @property {number} count - Number of requests recorded in the window.
 * @property {number} resetAt - Epoch milliseconds when the bucket expires.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory store.
 *
 * Keeps one counter bucket per key, resetting it once its window elapses.
 * Optionally prunes expired buckets on an interval to bound memory usage.
 *
 * @implements {Store}
 */
export class MemoryStore implements Store {
  private readonly buckets = new Map<string, Bucket>();
  private readonly cleanupInterval: NodeJS.Timeout | null;

  /**
   * Creates a new `MemoryStore`.
   *
   * @param {number} [cleanupMs=60000] - Interval in milliseconds between
   *   automatic prunes of expired buckets. The timer is unref'd so it never
   *   keeps the process alive.
   */
  constructor(cleanupMs = 60_000) {
    this.cleanupInterval = setInterval(() => {
      this.prune(Date.now());
    }, cleanupMs);
    this.cleanupInterval.unref();
  }

  /**
   * Removes every bucket whose window has already expired.
   *
   * @param {number} now - Current epoch milliseconds used as the cutoff.
   * @returns {void}
   */
  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Records a request for the given key and returns the updated count.
   *
   * If the previous bucket has expired, a fresh bucket is started.
   *
   * @param {string} key - Unique client key.
   * @param {number} windowMs - Window length in milliseconds.
   * @param {number} [now=Date.now()] - Current epoch milliseconds.
   * @returns {Promise<StoreResult>} The updated total and next reset time.
   */
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

  /**
   * Decrements the recorded count for the key (never below zero).
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  async decrement(key: string): Promise<void> {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.count = Math.max(0, bucket.count - 1);
    }
  }

  /**
   * Clears the bucket for a single key.
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  async resetKey(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  /**
   * Clears every bucket in the store.
   *
   * @returns {Promise<void>}
   */
  async resetAll(): Promise<void> {
    this.buckets.clear();
  }

  /**
   * Stops the background cleanup interval.
   *
   * @returns {void}
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Sliding-window in-memory store.
 *
 * Tracks an ordered list of request timestamps per key and drops entries
 * older than the window on every read, so capacity is freed as requests age.
 *
 * @implements {Store}
 */
export class SlidingWindowStore implements Store {
  private readonly logs = new Map<string, number[]>();

  /**
   * Records a request for the given key and returns the current count.
   *
   * @param {string} key - Unique client key.
   * @param {number} windowMs - Window length in milliseconds.
   * @param {number} [now=Date.now()] - Current epoch milliseconds.
   * @returns {Promise<StoreResult>} The updated total and next reset time.
   */
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

  /**
   * Removes the most recent recorded timestamp for the key, if any.
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  async decrement(key: string): Promise<void> {
    const log = this.logs.get(key);
    if (log && log.length > 0) {
      log.pop();
    }
  }

  /**
   * Clears the request log for a single key.
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  async resetKey(key: string): Promise<void> {
    this.logs.delete(key);
  }

  /**
   * Clears the request log for every key.
   *
   * @returns {Promise<void>}
   */
  async resetAll(): Promise<void> {
    this.logs.clear();
  }
}
