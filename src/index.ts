/**
 * Public entry point for the rate-limiter middleware package.
 *
 * Re-exports the middleware factories, stores, errors, header helpers and
 * all public types.
 *
 * @module rate-limiter-middleware
 */

export { RateLimiter, type CheckResult } from './rate-limiter.js';
export { fixedWindow } from './fixed-window.js';
export { slidingWindow } from './sliding-window.js';
export { MemoryStore, SlidingWindowStore } from './memory-store.js';
export { RateLimitError } from './errors.js';
export {
  setHeaders,
  secondsUntil,
  retryAfterSeconds,
  resolveHeaderFlags,
  type HeaderFlags,
} from './headers.js';
export type {
  Algorithm,
  HeaderConfig,
  KeyGenerator,
  RateLimitConfig,
  RateLimitHandler,
  RateLimitInfo,
  SkipFunction,
  Store,
  StoreResult,
} from './types.js';
export type { NextFunction, Request, Response } from 'express';
