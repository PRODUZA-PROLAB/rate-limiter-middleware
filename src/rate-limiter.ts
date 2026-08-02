import type { NextFunction, Request, Response } from 'express';
import { fixedWindow } from './fixed-window.js';
import { MemoryStore } from './memory-store.js';
import { slidingWindow } from './sliding-window.js';
import type { Algorithm, RateLimitConfig, Store, StoreResult } from './types.js';

export type { Algorithm };

export interface CheckResult {
  limited: boolean;
  total: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export class RateLimiter {
  readonly store: Store;
  readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = { algorithm: 'fixed-window', ...config };
    this.store = this.config.store ?? new MemoryStore();
  }

  get algorithm(): Algorithm {
    return this.config.algorithm ?? 'fixed-window';
  }

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

  async reset(key: string): Promise<void> {
    await this.store.resetKey(key);
  }

  async resetAll(): Promise<void> {
    await this.store.resetAll();
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    const config: RateLimitConfig = { ...this.config, store: this.store };
    return this.algorithm === 'sliding-window' ? slidingWindow(config) : fixedWindow(config);
  }

  shutdown(): void {
    this.store.shutdown?.();
  }
}
