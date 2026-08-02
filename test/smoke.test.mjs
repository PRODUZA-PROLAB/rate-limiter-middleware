import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryStore,
  SlidingWindowStore,
  RateLimiter,
  RateLimitError,
  fixedWindow,
  slidingWindow,
  setHeaders,
  secondsUntil,
  retryAfterSeconds,
} from '../dist/index.js';

function makeReq(ip = '10.0.0.1') {
  return { ip, socket: { remoteAddress: ip }, headers: {} };
}

function makeRes() {
  const headers = new Map();
  const res = {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
      return res;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status() {
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

function runMiddleware(mw, req, res) {
  return new Promise((resolve, reject) => {
    mw(req, res, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function collectErrors(mw, times, req = makeReq()) {
  const res = makeRes();
  const errors = [];
  for (let i = 0; i < times; i += 1) {
    try {
      await runMiddleware(mw, req, res);
    } catch (err) {
      errors.push(err);
    }
  }
  return { errors, res };
}

test('fixedWindow: allows requests within the limit', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 3 });
  const { errors } = await collectErrors(mw, 3);
  assert.equal(errors.length, 0);
});

test('fixedWindow: blocks with RateLimitError when the limit is exceeded', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 2 });
  const { errors } = await collectErrors(mw, 4);
  assert.equal(errors.length, 2);
  assert.ok(errors[0] instanceof RateLimitError);
  assert.equal(errors[0].statusCode, 429);
});

test('fixedWindow: sets draft and legacy rate-limit headers', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 5 });
  const { res } = await collectErrors(mw, 1);
  assert.equal(res.getHeader('RateLimit-Limit'), '5');
  assert.equal(res.getHeader('RateLimit-Remaining'), '4');
  assert.equal(res.getHeader('X-RateLimit-Remaining'), '4');
  const reset = Number(res.getHeader('RateLimit-Reset'));
  assert.ok(Number.isFinite(reset) && reset > 0);
});

test('fixedWindow: sets Retry-After header when enabled and blocked', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 1, headers: { retryAfter: true } });
  const { errors, res } = await collectErrors(mw, 2);
  assert.equal(errors.length, 1);
  assert.ok(Number(errors[0].retryAfterSec) >= 1);
  assert.ok(Number(res.getHeader('Retry-After')) >= 1);
});

test('fixedWindow: separate clients use separate buckets', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 1 });
  let errs = 0;
  await runMiddleware(mw, makeReq('10.0.0.1'), makeRes()).catch(() => errs++);
  await runMiddleware(mw, makeReq('10.0.0.2'), makeRes()).catch(() => errs++);
  assert.equal(errs, 0);
});

test('fixedWindow: custom keyGenerator controls bucketing', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 1, keyGenerator: () => 'shared' });
  let errs = 0;
  await runMiddleware(mw, makeReq('10.0.0.1'), makeRes()).catch(() => errs++);
  await runMiddleware(mw, makeReq('10.0.0.2'), makeRes()).catch(() => errs++);
  assert.equal(errs, 1);
});

test('fixedWindow: skip bypasses the limiter', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 1, skip: () => true });
  const { errors } = await collectErrors(mw, 5);
  assert.equal(errors.length, 0);
});

test('fixedWindow: headers can be disabled', async () => {
  const mw = fixedWindow({ windowMs: 1000, limit: 1, headers: false });
  const { res } = await collectErrors(mw, 1);
  assert.equal(res.getHeader('RateLimit-Limit'), undefined);
});

test('fixedWindow: bucket resets after windowMs elapses', async () => {
  const mw = fixedWindow({ windowMs: 120, limit: 1 });
  let errs = 0;
  await runMiddleware(mw, makeReq(), makeRes()).catch(() => errs++);
  await runMiddleware(mw, makeReq(), makeRes()).catch(() => errs++);
  assert.equal(errs, 1);
  await new Promise((r) => setTimeout(r, 200));
  await runMiddleware(mw, makeReq(), makeRes()).catch(() => errs++);
  assert.equal(errs, 1, 'after the window elapses the request is allowed again');
});

test('slidingWindow: blocks over the limit within the window', async () => {
  const mw = slidingWindow({ windowMs: 1000, limit: 2 });
  const { errors } = await collectErrors(mw, 3);
  assert.equal(errors.length, 1);
});

test('slidingWindow: expired requests free capacity', async () => {
  const mw = slidingWindow({ windowMs: 120, limit: 1 });
  let errs = 0;
  await runMiddleware(mw, makeReq(), makeRes()).catch(() => errs++);
  await runMiddleware(mw, makeReq(), makeRes()).catch(() => errs++);
  assert.equal(errs, 1);
  await new Promise((r) => setTimeout(r, 200));
  await runMiddleware(mw, makeReq(), makeRes()).catch(() => errs++);
  assert.equal(errs, 1, 'the expired request frees capacity');
});

test('MemoryStore: increments per key and returns resetAt', async () => {
  const store = new MemoryStore();
  const first = await store.increment('a', 1000, 1000);
  assert.equal(first.total, 1);
  assert.equal(first.resetAt, 2000);
  const second = await store.increment('a', 1000, 1050);
  assert.equal(second.total, 2);
  const other = await store.increment('b', 1000, 1100);
  assert.equal(other.total, 1);
});

test('MemoryStore: expired bucket starts fresh', async () => {
  const store = new MemoryStore();
  await store.increment('a', 500, 1000);
  const after = await store.increment('a', 500, 2000);
  assert.equal(after.total, 1);
});

test('MemoryStore: resetKey clears a single bucket', async () => {
  const store = new MemoryStore();
  await store.increment('a', 1000, 1000);
  await store.increment('b', 1000, 1000);
  await store.resetKey('a');
  assert.equal((await store.increment('a', 1000, 1500)).total, 1);
  assert.equal((await store.increment('b', 1000, 1500)).total, 2);
});

test('MemoryStore: resetAll clears every bucket', async () => {
  const store = new MemoryStore();
  await store.increment('a', 1000, 1000);
  await store.increment('b', 1000, 1000);
  await store.resetAll();
  assert.equal((await store.increment('a', 1000, 2000)).total, 1);
  assert.equal((await store.increment('b', 1000, 2000)).total, 1);
});

test('SlidingWindowStore: keeps a rolling window of timestamps', async () => {
  const store = new SlidingWindowStore();
  assert.equal((await store.increment('k', 1000, 1000)).total, 1);
  assert.equal((await store.increment('k', 1000, 1200)).total, 2);
});

test('SlidingWindowStore: drops entries older than the window', async () => {
  const store = new SlidingWindowStore();
  assert.equal((await store.increment('k', 1000, 1000)).total, 1);
  const after = await store.increment('k', 1000, 2500);
  assert.equal(after.total, 1, 'the expired entry is dropped, the new one is counted');
});

test('RateLimiter: check reports limits, remaining and limited', async () => {
  const rl = new RateLimiter({ windowMs: 1000, limit: 2 });
  const first = await rl.check('key');
  assert.equal(first.limited, false);
  assert.equal(first.total, 1);
  assert.equal(first.remaining, 1);
  const second = await rl.check('key');
  assert.equal(second.remaining, 0);
  const third = await rl.check('key');
  assert.equal(third.limited, true);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfterSec >= 0);
});

test('RateLimiter: reset clears a key', async () => {
  const rl = new RateLimiter({ windowMs: 1000, limit: 1 });
  await rl.check('key');
  assert.equal((await rl.check('key')).limited, true);
  await rl.reset('key');
  const after = await rl.check('key');
  assert.equal(after.limited, false);
  assert.equal(after.total, 1);
});

test('RateLimiter: middleware uses the configured algorithm', async () => {
  const rl = new RateLimiter({ windowMs: 1000, limit: 1, algorithm: 'sliding-window' });
  assert.equal(rl.algorithm, 'sliding-window');
  let errs = 0;
  await runMiddleware(rl.middleware(), makeReq(), makeRes()).catch(() => errs++);
  await runMiddleware(rl.middleware(), makeReq(), makeRes()).catch(() => errs++);
  assert.equal(errs, 1);
});

test('headers helpers: secondsUntil and retryAfterSeconds', () => {
  const now = 100_000;
  assert.equal(secondsUntil(102_000, now), 2);
  assert.equal(retryAfterSeconds(100_400, now), 1);
  assert.equal(retryAfterSeconds(now - 10_000, now), 0);
});

test('setHeaders writes draft, legacy and retry-after headers', () => {
  const res = makeRes();
  setHeaders(
    res,
    { limit: 10, remaining: 8, resetAt: 200_000, retryAfterSec: 42 },
    { retryAfter: true },
  );
  assert.equal(res.getHeader('RateLimit-Limit'), '10');
  assert.equal(res.getHeader('RateLimit-Remaining'), '8');
  assert.equal(res.getHeader('X-RateLimit-Reset'), '200');
  assert.equal(res.getHeader('Retry-After'), '42');
});
