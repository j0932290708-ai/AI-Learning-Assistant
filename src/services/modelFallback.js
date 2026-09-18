// One fallback only for a temporarily unavailable model. Quota/auth errors are not retried.
export async function generateWithFallback(client, request, model, fallbackModel, onFallback = () => {}) {
  try {
    return await client.models.generateContent({ ...request, model });
  } catch (error) {
    if ((error.status ?? error.statusCode) !== 503
      || !fallbackModel || fallbackModel === model || request.config?.abortSignal?.aborted) {
      throw error;
    }
    onFallback(model, fallbackModel);
    return client.models.generateContent({ ...request, model: fallbackModel });
  }
}
