// One fallback only for a temporarily unavailable model. Quota/auth errors are not retried.
export async function generateWithFallback(client, request, model, fallbackModel, onFallback = () => {}) {
  try {
    const config = model === 'gemini-3.8-flash'
      ? { ...request.config, thinkingConfig: { thinkingLevel: 'low', ...request.config?.thinkingConfig } }
      : request.config;
    return await client.models.generateContent({ ...request, model, config });
  } catch (error) {
    if ((error.status ?? error.statusCode) !== 503
      || !fallbackModel || fallbackModel === model || request.config?.abortSignal?.aborted) {
      throw error;
    }
    onFallback(model, fallbackModel);
    const config = fallbackModel === 'gemini-3.7-flash'
      ? { ...request.config, thinkingConfig: { thinkingLevel: 'low', ...request.config?.thinkingConfig } }
      : request.config;
    return client.models.generateContent({ ...request, model: fallbackModel, config });
  }
}

