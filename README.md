# rate-limiter-middleware

Configurable Express rate-limiting middleware for Node.js. Provides two sliding/fixed window
algorithms, pluggable in-memory storage, and standard `RateLimit-*` / `X-RateLimit-*` /
`Retry-After` response headers. Written in strict TypeScript and shipped as compiled ESM.

## Features

- **Fixed-window** algorithm: a request counter resets every `windowMs` for each client key.
- **Sliding-window** algorithm: a rolling log of request timestamps, so capacity is freed as
  old requests expire instead of all at once.
- **In-memory storage** out of the box: `MemoryStore` (fixed window buckets) and
  `SlidingWindowStore` (timestamp logs), with a `Store` interface so you can plug in Redis,
  Postgres, or anything else.
- **Headers**: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (IETF draft 6) plus
  legacy `X-RateLimit-*` and optional `Retry-After` when a request is blocked.
- **Programmatic API**: the `RateLimiter` class lets you `check()`, `reset()` and build
  middleware without Express running.
- **Customization**: per-client `keyGenerator`, `skip` predicate, custom `statusCode`,
  `message`, custom `handler` and `onLimitReached` hooks.
- **Zero runtime dependencies beyond Express**: strict TypeScript, tree-shakeable ESM build.

## Install

```bash
npm install rate-limiter-middleware
```

Requires Node.js >= 18.

## Quick start

```ts
import express from 'express';
import { fixedWindow } from 'rate-limiter-middleware';

const app = express();

app.use(
  fixedWindow({
    windowMs: 60_000,
    limit: 100,
    message: 'Too many requests, please slow down.',
  }),
);

app.get('/', (req, res) => {
  res.json({ ok: true });
});

app.listen(3000);
```

Clients are identified by `req.ip` (falling back to the socket remote address). Once a client
exceeds `limit` requests inside `windowMs`, the middleware stops the chain and forwards a
`RateLimitError` to Express error handling.

## Algorithms

### Fixed window

The window is anchored at the first request: every client key has a counter and a `resetAt`
timestamp. When `now >= resetAt` the counter restarts. Simple and cheap, but a burst at the end
of one window plus the start of the next can allow `2 * limit` requests in a short span.

```ts
import { fixedWindow } from 'rate-limiter-middleware';

app.use(fixedWindow({ windowMs: 60_000, limit: 30 }));
```

### Sliding window

Each client key keeps a log of request timestamps. Old timestamps are pruned on every check, so
the count always reflects the real number of requests in the *last* `windowMs`. Slightly more
memory per key, but no burst-window hole.

```ts
import { slidingWindow } from 'rate-limiter-middleware';

app.use(slidingWindow({ windowMs: 60_000, limit: 30 }));
```

## API

### `fixedWindow(config)` and `slidingWindow(config)`

Both return an Express middleware `(req, res, next) => Promise<void>`.

| Option            | Type                       | Default                                     | Description                                              |
| ----------------- | -------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `windowMs`        | `number`                   | required                                    | Window length in milliseconds.                           |
| `limit`           | `number`                   | required                                    | Max requests allowed per window per key.                 |
| `algorithm`       | `'fixed-window' \| 'sliding-window'` | `'fixed-window'`                  | Used by the `RateLimiter` class.                         |
| `store`           | `Store`                    | `MemoryStore` / `SlidingWindowStore`        | Custom store implementing the `Store` interface.         |
| `keyGenerator`    | `(req) => string`          | `req.ip` or socket address                  | Function returning the client bucket key.                |
| `skip`            | `(req, res) => boolean`    | `() => false`                               | If true, the request bypasses the limiter.               |
| `statusCode`      | `number`                   | `429`                                       | HTTP status attached to `RateLimitError`.                |
| `message`         | `string`                   | `'Too many requests, please try again later.'` | Error message.                                        |
| `headers`         | `boolean \| HeaderConfig`  | `true`                                      | `false` disables all headers; object toggles groups.     |
| `handler`         | `(req, res, next, info)`   | —                                           | Called instead of `next(error)` when blocked.            |
| `onLimitReached`  | `(info, req, res) => void` | —                                           | Hook fired when a request is blocked.                    |

`HeaderConfig` toggles `{ draft?, legacy?, retryAfter? }` (each defaults to `true`, `true`,
`false` respectively). Example: `{ headers: { legacy: false, retryAfter: true } }`.

### `RateLimiter`

Class for programmatic rate limiting and reusable middleware:

```ts
import { RateLimiter } from 'rate-limiter-middleware';

const limiter = new RateLimiter({ windowMs: 60_000, limit: 10 });

const result = await limiter.check('user-42');
// { limited, total, limit, remaining, resetAt, retryAfterSec }

await limiter.reset('user-42');     // clear one key
await limiter.resetAll();           // clear every key
app.use(limiter.middleware());      // use as Express middleware
limiter.shutdown();                 // release store timers
```

`check(key, cost = 1)` consumes `cost` units (useful when one request counts as several).
`middleware()` returns a ready-to-mount Express middleware sharing the same store.

### Stores

- `MemoryStore(cleanupMs = 60_000)` — fixed-window buckets with periodic pruning of expired keys.
- `SlidingWindowStore` — per-key timestamp logs for the sliding-window algorithm.

Both implement the `Store` interface:

```ts
interface Store {
  increment(key: string, windowMs: number, now?: number): Promise<{ total: number; resetAt: number }>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
  resetAll(): Promise<void>;
  shutdown?(): void;
}
```

### `RateLimitError`

```ts
class RateLimitError extends Error {
  statusCode: number;   // default 429
  retryAfterSec: number;
}
```

Handle it centrally with an Express error middleware:

```ts
app.use((err, req, res, next) => {
  if (err instanceof RateLimitError) {
    res.status(err.statusCode).json({ error: err.message, retryAfter: err.retryAfterSec });
    return;
  }
  next(err);
});
```

### Headers helpers

- `setHeaders(res, info, flags)` — writes the rate-limit headers onto a response.
- `secondsUntil(resetAt, now?)` and `retryAfterSeconds(resetAt, now?)` — compute whole
  remaining seconds, clamped at zero.
- `resolveHeaderFlags(headers)` — normalizes the `headers` option into a `HeaderFlags` object.

## Headers emitted

When enabled (default), the middleware writes on every handled request:

```
RateLimit-Limit: 30
RateLimit-Remaining: 29
RateLimit-Reset: 1700000000
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1700000000
```

With `headers: { retryAfter: true }`, blocked responses also receive `Retry-After: <seconds>`.

## Custom store example

```ts
import type { Store } from 'rate-limiter-middleware';

class RedisStore implements Store {
  async increment(key: string, windowMs: number, now = Date.now()) {
    // INCR + PEXPIRE ...
    return { total: count, resetAt: now + windowMs };
  }
  async decrement(key: string) {}
  async resetKey(key: string) {}
  async resetAll() {}
}
```

## Development

```bash
npm install      # install pinned dependencies
npm run build    # tsc -> dist/
npm test         # build + node --test test/
npm run lint     # tsc --noEmit type check
```

Tests live in `test/smoke.test.mjs` (Node's built-in test runner) and cover window logic, limits,
resets, headers and the store classes. `test/index.js` is the entry shim so
`node --test test/` runs the suite.

## License

MIT — see [LICENSE](./LICENSE). Changelog in [CHANGELOG.md](./CHANGELOG.md).
