export function errorHandler(err, req, res, next) {
  const parserErrors = {
    'entity.parse.failed': {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON'
    },
    'entity.too.large': {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large'
    }
  };
  const parserError = parserErrors[err.type];
  const statusCode = parserError?.statusCode
    || (Number.isInteger(err.statusCode) ? err.statusCode : null)
    || (Number.isInteger(err.status) ? err.status : 500);

  const code = parserError?.code || err.code || 'INTERNAL_ERROR';
  const safeServerMessages = {
    AI_SERVICE_UNAVAILABLE: 'AI service is not configured',
    AI_TIMEOUT: 'AI service took too long to respond',
    AI_CONCURRENCY_LIMIT: 'AI service is busy, please try again shortly'
  };
  const message = parserError?.message || (statusCode >= 500
    ? (safeServerMessages[code] || 'Internal server error')
    : (err.message || 'Request failed'));

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
      ...(err.fields ? { fields: err.fields } : {})
    },
    requestId: req.requestId
  });
}
