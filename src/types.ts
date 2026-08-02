import type { NextFunction, Request, Response } from 'express';

export type { NextFunction, Request, Response };

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export interface HeaderConfig {
  draft?: boolean;
  legacy?: boolean;
  retryAfter?: boolean;
}

export interface StoreResult {
  total: number;
  resetAt: number;
}

export interface Store {
  increment(key: string, windowMs: number, now?: number): Promise<StoreResult>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
  resetAll(): Promise<void>;
  shutdown?(): void;
}

export type KeyGenerator = (req: Request) => string;
export type SkipFunction = (req: Request, res: Response) => boolean;
export type RateLimitHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  info: RateLimitInfo,
) => unknown;

export type Algorithm = 'fixed-window' | 'sliding-window';

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
