/**
 * Error types used across the rate limiter middleware.
 *
 * @module errors
 */

/**
 * Error thrown when a request exceeds the configured rate limit.
 *
 * Carries the HTTP status code and the number of seconds the client must
 * wait before retrying, so consumers can respond accordingly (for example,
 * by emitting a `Retry-After` header).
 *
 * @extends {Error}
 */
export class RateLimitError extends Error {
  readonly statusCode: number;
  readonly retryAfterSec: number;

  /**
   * Creates a new `RateLimitError`.
   *
   * @param {number} statusCode - HTTP status code to use when responding.
   * @param {number} retryAfterSec - Seconds the client should wait before retrying.
   * @param {string} message - Human-readable description of the failure.
   */
  constructor(statusCode: number, retryAfterSec: number, message: string) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = statusCode;
    this.retryAfterSec = retryAfterSec;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
