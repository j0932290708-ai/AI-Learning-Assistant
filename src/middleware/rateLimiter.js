export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 30;
  const maxClients = options.maxClients || 5000;
  const keyFor = options.keyGenerator || ((req) => req.ip || 'unknown');
  const clock = options.clock || Date.now;

  const clients = new Map();
  let nextSweep = 0;

  function reject(req, res, seconds) {
    res.setHeader('Retry-After', String(Math.max(1, seconds)));
    return res.status(429).json({ error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '請求次數較多，請稍候再試。'
    }, requestId: req.requestId });
  }

  return function rateLimiter(req, res, next) {
    const key = keyFor(req);
    const now = clock();
    if (now >= nextSweep || clients.size >= maxClients) {
      for (const [client, record] of clients) if (now >= record.resetAt) clients.delete(client);
      nextSweep = now + windowMs;
    }

    let record = clients.get(key);

    if (!record || now >= record.resetAt) {
      if (!record && clients.size >= maxClients) return reject(req, res, Math.ceil(windowMs / 1000));
      record = {
        count: 0,
        resetAt: now + windowMs
      };

      clients.set(key, record);
    }

    record.count += 1;

    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);

      return reject(req, res, retryAfter);
    }

    next();
  };
}
