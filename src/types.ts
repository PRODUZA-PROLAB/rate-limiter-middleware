/**
 * Shared type definitions for the rate limiter middleware.
 *
 * @module types
 */

import type { NextFunction, Request, Response } from 'express';

export type { NextFunction, Request, Response };

/**
 * Information about the current state of a rate-limited client.
 *
 * @interface RateLimitInfo
 * @property {number} limit - Maximum requests allowed per window.
 * @property {number} remaining - Requests still allowed in the window.
 * @property {number} resetAt - Epoch milliseconds when the window resets.
 * @property {number} retryAfterSec - Seconds until the client can retry.
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

/**
 * Controls which response headers are emitted.
 *
 * @interface HeaderConfig
 * @property {boolean} [draft] - Emit `RateLimit-*` draft headers.
 * @property {boolean} [legacy] - Emit `X-RateLimit-*` legacy headers.
 * @property {boolean} [retryAfter] - Emit the `Retry-After` header.
 */
export interface HeaderConfig {
  draft?: boolean;
  legacy?: boolean;
  retryAfter?: boolean;
}

/**
 * Result of recording a request against a store.
 *
 * @interface StoreResult
 * @property {number} total - Total requests recorded for the key in the window.
 * @property {number} resetAt - Epoch milliseconds when the window resets.
 */
export interface StoreResult {
  total: number;
  resetAt: number;
}

/**
 * Backing store abstraction for rate-limit counters.
 *
 * @interface Store
 */
export interface Store {
  /**
   * Records a request for the key and returns the updated count.
   *
   * @param {string} key - Unique client key.
   * @param {number} windowMs - Window length in milliseconds.
   * @param {number} [now] - Current epoch milliseconds.
   * @returns {Promise<StoreResult>} The updated total and next reset time.
   */
  increment(key: string, windowMs: number, now?: number): Promise<StoreResult>;
  /**
   * Undoes a previously recorded request for the key.
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  decrement(key: string): Promise<void>;
  /**
   * Clears the counter for a single key.
   *
   * @param {string} key - Unique client key.
   * @returns {Promise<void>}
   */
  resetKey(key: string): Promise<void>;
  /**
   * Clears every counter in the store.
   *
   * @returns {Promise<void>}
   */
  resetAll(): Promise<void>;
  /**
   * Releases any background resources held by the store.
   *
   * @returns {void}
   */
  shutdown?(): void;
}

/**
 * Derives a unique rate-limit key from an incoming request.
 *
 * @typedef {function} KeyGenerator
 * @param {Request} req - The incoming Express request.
 * @returns {string} The rate-limit key for the request.
 */
export type KeyGenerator = (req: Request) => string;

/**
 * Decides whether a request should bypass the rate limiter.
 *
 * @typedef {function} SkipFunction
 * @param {Request} req - The incoming Express request.
 * @param {Response} res - The Express response.
 * @returns {boolean} `true` when the request should be skipped.
 */
export type SkipFunction = (req: Request, res: Response) => boolean;

/**
 * Custom handler invoked when a request exceeds the rate limit.
 *
 * @typedef {function} RateLimitHandler
 * @param {Request} req - The incoming Express request.
 * @param {Response} res - The Express response.
 * @param {NextFunction} next - The Express next function.
 * @param {RateLimitInfo} info - The rate limit state at rejection time.
 * @returns {unknown} The handler result.
 */
export type RateLimitHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  info: RateLimitInfo,
) => unknown;

/**
 * Supported rate-limiting algorithms.
 *
 * @typedef {('fixed-window'|'sliding-window')} Algorithm
 */
export type Algorithm = 'fixed-window' | 'sliding-window';

/**
 * Configuration options for the rate limiter.
 *
 * @interface RateLimitConfig
 * @property {number} windowMs - Length of the counting window in milliseconds.
 * @property {number} limit - Maximum requests allowed per window.
 * @property {Algorithm} [algorithm] - Which algorithm to use.
 * @property {string} [message] - Message used when rejecting a request.
 * @property {number} [statusCode] - HTTP status used when rejecting a request.
 * @property {Store} [store] - Backing store for counters.
 * @property {KeyGenerator} [keyGenerator] - Derives the client key from a request.
 * @property {SkipFunction} [skip] - When `true`, bypasses the limiter.
 * @property {boolean|HeaderConfig} [headers] - Controls response headers.
 * @property {RateLimitHandler} [handler] - Custom rejection handler.
 * @property {function} [onLimitReached] - Callback fired when a limit is hit.
 */
export interface RateLimitConfig {
  windowMs: number;
  limit: number;
  algorithm?: Algorithm;
  message?: string;
  statusCode?: number;
  store?: Store;
  keyGenerator?: KeyGenerator;
  skip?: SkipFunction;
  headers?: boolean | HeaderConfig;
  handler?: RateLimitHandler;
  onLimitReached?: (info: RateLimitInfo, req: Request, res: Response) => void;
}
