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

  const code = parserError?.code || err.code
    || (statusCode === 503 ? 'AI_UPSTREAM_UNAVAILABLE' : 'INTERNAL_ERROR');
  const safeServerMessages = {
    AI_AUTH_FAILED: 'Gemini 金鑰無效或沒有使用權限。請檢查 AI 設定；使用網站預設時請聯絡管理者。',
    AI_QUOTA_EXCEEDED: 'Gemini 使用額度已達上限，請稍後再試或檢查你的 API 額度。',
    AI_UPSTREAM_ERROR: 'AI 服務暫時無法完成請求，請稍後再試。',
    AUTO_LESSON_INVALID: 'AI 回覆格式不完整，請再試一次。',
    GUIDANCE_INVALID: '引導內容格式不完整，請再試一次。',
    AI_UPSTREAM_UNAVAILABLE: 'AI 服務目前忙碌，請稍後再試。',
    IMAGE_RECOGNITION_INVALID: '圖片辨識結果無法讀取，請重試或改用手動輸入。',
    AI_SERVICE_UNAVAILABLE: 'AI service is not configured',
    AI_TIMEOUT: 'AI 回答等候過久，請稍後再試或把題目拆成較短的問題。',
    AI_CONCURRENCY_LIMIT: '目前同時解題的人較多，請稍後再試。'
  };
  const message = parserError?.message || safeServerMessages[code] || (statusCode >= 500
    ? (safeServerMessages[code] || 'Internal server error')
    : (err.message || 'Request failed'));

  const logger = req.app.locals.logger || console;
  logger.error?.({
    requestId: req.requestId,
    code,
    message
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
