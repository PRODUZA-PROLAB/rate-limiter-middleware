/**
 * Helpers for resolving header flags and writing standard rate-limit
 * response headers (IETF draft, legacy `X-RateLimit-*`, and `Retry-After`).
 *
 * @module headers
 */

import type { HeaderConfig, RateLimitInfo, Response } from './types.js';

/**
 * Flags controlling which response headers are written.
 *
 * @interface HeaderFlags
 * @property {boolean} [draft] - Write the IETF draft `RateLimit-*` headers.
 * @property {boolean} [legacy] - Write the legacy `X-RateLimit-*` headers.
 * @property {boolean} [retryAfter] - Write the `Retry-After` header.
 */
export interface HeaderFlags {
  draft?: boolean;
  legacy?: boolean;
  retryAfter?: boolean;
}

/**
 * Number of whole seconds until the given reset timestamp.
 *
 * @param {number} resetAt - Epoch milliseconds when the window resets.
 * @param {number} [now=Date.now()] - Current epoch milliseconds.
 * @returns {number} The number of seconds remaining, never below `0`.
 */
export function secondsUntil(resetAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

/**
 * Alias of {@link secondsUntil} used for the `Retry-After` value.
 *
 * @param {number} resetAt - Epoch milliseconds when the window resets.
 * @param {number} [now=Date.now()] - Current epoch milliseconds.
 * @returns {number} The number of seconds the client must wait.
 */
export function retryAfterSeconds(resetAt: number, now = Date.now()): number {
  return secondsUntil(resetAt, now);
}

/**
 * Normalizes a `headers` config value into a {@link HeaderFlags} object.
 *
 * - `false` disables every header.
 * - `undefined` or `true` enables the defaults (draft + legacy).
 * - An object is spread as-is so individual flags can be overridden.
 *
 * @param {boolean | HeaderConfig | undefined} headers - Raw `headers` config value.
 * @returns {HeaderFlags} The resolved header flags.
 */
export function resolveHeaderFlags(headers: boolean | HeaderConfig | undefined): HeaderFlags {
  if (headers === false) {
    return { draft: false, legacy: false, retryAfter: false };
  }
  if (headers === undefined || headers === true) {
    return {};
  }
  return { ...headers };
}

/**
 * Writes the standard rate-limit response headers on the response object.
 *
 * Draft headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
 * Legacy headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
 * Retry header: `Retry-After`.
 *
 * @param {Response} res - The Express-like response to write headers on.
 * @param {RateLimitInfo} info - The computed limit, remaining and reset info.
 * @param {HeaderFlags} [flags={}] - Which headers to write. Defaults to draft + legacy.
 * @returns {void}
 */
export function setHeaders(res: Response, info: RateLimitInfo, flags: HeaderFlags = {}): void {
  const { draft = true, legacy = true, retryAfter = false } = flags;

  if (draft) {
    res.setHeader('RateLimit-Limit', String(info.limit));
    res.setHeader('RateLimit-Remaining', String(info.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(info.resetAt / 1000)));
  }
  if (legacy) {
    res.setHeader('X-RateLimit-Limit', String(info.limit));
    res.setHeader('X-RateLimit-Remaining', String(info.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(info.resetAt / 1000)));
  }
  if (retryAfter) {
    res.setHeader('Retry-After', String(info.retryAfterSec));
  }
}
