import crypto from 'node:crypto';

export function requestId(req, res, next) {
  const incomingRequestId = req.get('X-Request-ID');
  const id = incomingRequestId || crypto.randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  next();
}