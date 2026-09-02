export function errorHandler(err, req, res, next) {
  const statusCode = Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  const code = err.code || 'INTERNAL_ERROR';
  const safeServerMessages = {
    AI_SERVICE_UNAVAILABLE: 'AI service is not configured'
  };
  const message = statusCode >= 500
    ? (safeServerMessages[code] || 'Internal server error')
    : (err.message || 'Request failed');

  const logger = req.app.locals.logger || console;
  logger.error?.({
    requestId: req.requestId,
    code,
    message: err.message
  });

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.requestId,
      ...(err.fields ? { fields: err.fields } : {})
    }
  });
}
