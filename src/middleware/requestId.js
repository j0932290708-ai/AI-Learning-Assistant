import crypto from 'node:crypto';

export function requestId(req, res, next) {
  const incomingRequestId = req.get('X-Request-ID');
  const isValid = typeof incomingRequestId === 'string'
    && /^[A-Za-z0-9._:-]{1,100}$/.test(incomingRequestId);
  const id = isValid ? incomingRequestId : crypto.randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  next();
}
