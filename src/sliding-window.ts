/**
 * Sliding-window rate limiting middleware for Express.
 *
 * @module sliding-window
 */

import type { NextFunction, Request, Response } from 'express';
import { RateLimitError } from './errors.js';
import { resolveHeaderFlags, retryAfterSeconds, setHeaders } from './headers.js';
import { SlidingWindowStore } from './memory-store.js';
import type {
  KeyGenerator,
  RateLimitConfig,
  RateLimitInfo,
  SkipFunction,
  Store,
} from './types.js';

const defaultKeyGenerator: KeyGenerator = (req) =>
  req.ip ?? req.socket?.remoteAddress ?? 'unknown';

/**
 * Creates a sliding-window rate limiting middleware.
 *
 * Instead of fixed buckets, each request is timestamped and a rolling count
 * is computed over the last `windowMs`. Requests older than the window no
 * longer count, so capacity is freed progressively rather than all at once.
 *
 * @param {RateLimitConfig} config - Rate limiting configuration.
 * @returns {import('express').RequestHandler} An Express middleware function.
 * @throws {RateLimitError} Via `next` when the configured limit is exceeded
 *   and no custom `handler` is provided.
 */
export function slidingWindow(config: RateLimitConfig) {
  const windowMs = config.windowMs;
  const limit = config.limit;
  const message = config.message ?? 'Too many requests, please try again later.';
  const statusCode = config.statusCode ?? 429;
  const store: Store = config.store ?? new SlidingWindowStore();
  const keyGenerator: KeyGenerator = config.keyGenerator ?? defaultKeyGenerator;
  const skip: SkipFunction = config.skip ?? (() => false);
  const headerFlags = resolveHeaderFlags(config.headers);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (skip(req, res)) {
        next();
        return;
      }

      const key = keyGenerator(req);
      const now = Date.now();
      const result = await store.increment(key, windowMs, now);

      const info: RateLimitInfo = {
        limit,
        remaining: Math.max(0, limit - result.total),
        resetAt: result.resetAt,
        retryAfterSec: retryAfterSeconds(result.resetAt, now),
      };

      setHeaders(res, info, headerFlags);

      if (result.total > limit) {
        config.onLimitReached?.(info, req, res);
        if (config.handler) {
          config.handler(req, res, next, info);
          return;
        }
        next(new RateLimitError(statusCode, info.retryAfterSec, message));
        return;
      }

      next();
    } catch (err) {
      next(err as Error);
    }
  };
}
