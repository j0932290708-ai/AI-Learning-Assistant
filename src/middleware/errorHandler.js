export function errorHandler(err, req, res, next) {
  const statusCode = Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  const code = err.code || 'INTERNAL_ERROR';
  const message = statusCode >= 500
    ? 'Internal server error'
    : (err.message || 'Request failed');

  console.error({
    requestId: req.requestId,
    code,
    message: err.message
  });

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.requestId
    }
  });
}