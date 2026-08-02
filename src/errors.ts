export class RateLimitError extends Error {
  readonly statusCode: number;
  readonly retryAfterSec: number;

  constructor(statusCode: number, retryAfterSec: number, message: string) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = statusCode;
    this.retryAfterSec = retryAfterSec;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
