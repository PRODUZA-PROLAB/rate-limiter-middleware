/**
 * Programmatic rate limiter facade wrapping the Express middleware
 * implementations.
 *
 * @module rate-limiter
 */

import type { NextFunction, Request, Response } from 'express';
import { fixedWindow } from './fixed-window.js';
import { MemoryStore } from './memory-store.js';
import { slidingWindow } from './sliding-window.js';
import type { Algorithm, RateLimitConfig, Store, StoreResult } from './types.js';

export type { Algorithm };

/**
 * Result of a {@link RateLimiter.check} call for a key.
 *
 * @interface CheckResult
 * @property {boolean} limited - Whether the key is currently over the limit.
 * @property {number} total - Total requests recorded for the key.
 * @property {number} limit - Maximum requests allowed per window.
 * @property {number} remaining - Requests still allowed in the window.
 * @property {number} resetAt - Epoch milliseconds when the window resets.
 * @property {number} retryAfterSec - Seconds until the client can retry.
 */
export interface CheckResult {
  limited: boolean;
  total: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

/**
 * High-level rate limiter with a programmatic API on top of the store and
 * the Express middleware factories.
 */
export class RateLimiter {
  readonly store: Store;
  readonly config: RateLimitConfig;

  /**
   * Creates a new `RateLimiter`.
   *
   * @param {RateLimitConfig} config - Rate limiting configuration. Defaults
   *   the algorithm to `'fixed-window'` and the store to `MemoryStore` when
   *   not provided.
   */
  constructor(config: RateLimitConfig) {
    this.config = { algorithm: 'fixed-window', ...config };
    this.store = this.config.store ?? new MemoryStore();
  }

  /**
   * The active rate-limiting algorithm.
   *
   * @returns {Algorithm} The configured algorithm name.
   */
  get algorithm(): Algorithm {
    return this.config.algorithm ?? 'fixed-window';
  }

  /**
   * Records `cost` requests for a key and reports whether it is now limited.
   *
   * @param {string} key - Unique client key.
   * @param {number} [cost=1] - Number of requests to record at once.
   * @returns {Promise<CheckResult>} The updated limit state for the key.
   */
  async check(key: string, cost = 1): Promise<CheckResult> {
    const windowMs = this.config.windowMs;
    const limit = this.config.limit;
    const now = Date.now();

    let result: StoreResult = await this.store.increment(key, windowMs, now);
    for (let i = 1; i < cost; i += 1) {
      result = await this.store.increment(key, windowMs, now);
    }

    return {
      limited: result.total > limit,
      total: result.total,
      limit,
      remaining: Math.max(0, limit - result.total),
      resetAt: result.resetAt,
      retryAfterSec: Math.max(0, Math.ceil((result.resetAt - now) / 1000)),
    };
  }

  /**
   * Clears the counter for a single key.
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  async reset(key: string): Promise<void> {
    await this.store.resetKey(key);
  }

  /**
   * Clears every counter in the underlying store.
   *
   * @returns {Promise<void>}
   */
  async resetAll(): Promise<void> {
    await this.store.resetAll();
  }

  /**
   * Builds an Express middleware bound to this limiter's config and store.
   *
   * @returns {function} An Express middleware function.
   */
  middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    const config: RateLimitConfig = { ...this.config, store: this.store };
    return this.algorithm === 'sliding-window' ? slidingWindow(config) : fixedWindow(config);
  }

  /**
   * Releases any background resources held by the underlying store.
   *
   * @returns {void}
   */
  shutdown(): void {
    this.store.shutdown?.();
  }
}
