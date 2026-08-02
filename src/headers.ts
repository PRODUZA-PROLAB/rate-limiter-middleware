import type { HeaderConfig, RateLimitInfo, Response } from './types.js';

export interface HeaderFlags {
  draft?: boolean;
  legacy?: boolean;
  retryAfter?: boolean;
}

export function secondsUntil(resetAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((resetAt - now) / 1000));
}

export function retryAfterSeconds(resetAt: number, now = Date.now()): number {
  return secondsUntil(resetAt, now);
}

export function resolveHeaderFlags(headers: boolean | HeaderConfig | undefined): HeaderFlags {
  if (headers === false) {
    return { draft: false, legacy: false, retryAfter: false };
  }
  if (headers === undefined || headers === true) {
    return {};
  }
  return { ...headers };
}

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
