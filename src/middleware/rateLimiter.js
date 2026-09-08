export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 30;

  const clients = new Map();

  return function rateLimiter(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();

    let record = clients.get(key);

    if (!record || now >= record.resetAt) {
      record = {
        count: 0,
        resetAt: now + windowMs
      };

      clients.set(key, record);
    }

    record.count += 1;

    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);

      res.setHeader('Retry-After', String(retryAfter));

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests'
        },
        requestId: req.requestId
      });
    }

    next();
  };
}
