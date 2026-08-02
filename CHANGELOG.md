# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-01

### Added

- `fixedWindow(config)` Express middleware implementing the fixed-window algorithm.
- `slidingWindow(config)` Express middleware implementing the sliding-window algorithm.
- `RateLimiter` class for programmatic checks, resets and shared middleware.
- `MemoryStore` in-memory fixed-window bucket store with automatic expiry pruning.
- `SlidingWindowStore` in-memory rolling timestamp-log store.
- `RateLimitError` error class carrying `statusCode` and `retryAfterSec`.
- Standard `RateLimit-*` (IETF draft 6) and legacy `X-RateLimit-*` response headers.
- Optional `Retry-After` header on blocked responses.
- Config options: `keyGenerator`, `skip`, `statusCode`, `message`, `store`, `handler`,
  `onLimitReached`, and `headers` toggles.
- Strict TypeScript build compiled to ESM with type declarations.
- Test suite using Node's built-in test runner (`test/smoke.test.mjs`).
- `env.example`, `.gitignore`, Prettier config and MIT license.
