import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { requestId } from './middleware/requestId.js';
import { validateRequest } from './middleware/validateRequest.js';
import { solveRequestSchema } from './schemas/requestSchemas.js';
import { Semaphore } from './services/concurrencyLimiter.js';
import { imageRequestSchema, recognizeImage } from './services/recognizeImage.js';
import { generateWithFallback } from './services/modelFallback.js';
import { solveSubject } from './subjects/registry.js';
import { questionNumber } from '../public/src/api.js';
import { tutorPolicy } from './services/tutorPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Keep the built-in model on the current stable Gemini Flash release. Render
// environment variables can still pin a different model when needed.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL === 'none'
  ? null : (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite');

function createDefaultAiService(apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) {
    return null;
  }

  const client = new GoogleGenAI({
    apiKey
  });

  return {
    models: {
      generateContent(request) {
        return generateWithFallback(client, request, MODEL, FALLBACK_MODEL,
          (primary, fallback) => console.warn(`[AI] temporary model outage: ${primary} -> ${fallback}`));
      }
    }
  };
}

function withTimeout(promise, timeoutMs, controller) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('AI service took too long to respond');
      error.code = 'AI_TIMEOUT';
      error.statusCode = 504;
      reject(error);
      controller.abort();
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createApp({ services = {}, logger = console, config = {} } = {}) {
  const app = express();
  const aiService = Object.hasOwn(services, 'aiService')
    ? services.aiService
    : createDefaultAiService();
  // Reject excess requests promptly instead of leaving students in an unbounded wait.
  const concurrencyLimiter = services.concurrencyLimiter || new Semaphore(2, 0);
  const aiTimeoutMs = config.aiTimeoutMs || 60_000;
  const solveRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
  const globalRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, keyGenerator: () => 'all-ai-requests' });
  app.locals.logger = logger;

  app.use(requestId);
  // Bound total traffic even if client addresses vary or are hidden by a proxy.
  app.use(['/api/solve', '/api/recognize'], globalRateLimiter, solveRateLimiter);
  // Image base64 adds about a third to the decoded 5 MB image limit.
  app.use('/api/recognize', express.json({ limit: '7mb' }));
  app.use(express.json({ limit: '1mb' }));

  const publicDir = path.join(__dirname, '../public');
  app.use('/vendor/katex', express.static(path.join(__dirname, '../node_modules/katex/dist')));
  app.use(express.static(publicDir));

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get('/ready', (req, res) => {
    const ready = Boolean(aiService);
    res.status(ready ? 200 : 503).json({ ready });
  });

  function aiHandler(task) {
    return async (req, res, next) => {
      let permit;
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableFinished) controller.abort();
      };
      res.on('close', onClose);
      try {
        const personalKey = req.get('x-gemini-api-key') || '';
        if (personalKey && !/^[A-Za-z0-9_-]{20,256}$/.test(personalKey)) {
          throw Object.assign(new Error('API Key 格式不正確，請在 AI 設定重新輸入。'), { code: 'INVALID_API_KEY', statusCode: 400 });
        }
        const selectedService = personalKey ? (services.createPersonalAiService || createDefaultAiService)(personalKey) : aiService;
        if (!selectedService) {
          const error = new Error('AI service is not configured');
          error.code = 'AI_SERVICE_UNAVAILABLE';
          error.statusCode = 503;
          throw error;
        }

        permit = await concurrencyLimiter.acquire();
        const activePermit = permit;
        const requestAiService = {
          models: {
            generateContent(request) {
              return selectedService.models.generateContent({
                ...request,
                config: { ...request.config, systemInstruction: `${tutorPolicy}\n${request.config?.systemInstruction || ''}`, abortSignal: controller.signal }
              }).catch(error => {
                const status = error.status ?? error.statusCode;
                logger.error?.({ requestId: req.requestId, upstreamStatus: Number.isInteger(status) ? status : null,
                  category: /schema/i.test(String(error.message)) ? 'schema' : /system.?instruction/i.test(String(error.message)) ? 'system-instruction' : 'provider-request' });
                const code = status === 401 || status === 403 ? 'AI_AUTH_FAILED' : status === 429 ? 'AI_QUOTA_EXCEEDED' : status === 503 ? 'AI_UPSTREAM_UNAVAILABLE' : 'AI_UPSTREAM_ERROR';
                // Never log or return provider messages: they may contain credentials or request content.
                throw Object.assign(new Error(code), { code, statusCode: [401, 403, 429, 503].includes(status) ? status : 502 });
              });
            }
          }
        };
        // Keep the slot until the actual model request settles, even after HTTP timeout.
        const work = Promise.resolve().then(() => task(req.validatedBody, requestAiService))
          .finally(() => activePermit.release());
        permit = null;
        const result = await withTimeout(
          work,
          aiTimeoutMs,
          controller
        );

        res.status(200).json({
          success: true,
          ...result,
          requestId: req.requestId
        });
      } catch (error) {
        next(error);
      } finally {
        res.off('close', onClose);
        permit?.release();
      }
    };
  }

  app.post(
    '/api/solve',
    validateRequest(solveRequestSchema),
    (req, res, next) => {
      if (questionNumber(req.validatedBody.question) !== null) {
        return res.status(400).json({ error: { code: 'QUESTION_TEXT_REQUIRED', message: '這是題號，還不是完整題目。請先上傳照片並辨識指定題號，或貼上完整題目。' }, requestId: req.requestId });
      }
      next();
    },
    aiHandler(async (input, service) => ({
      question: input.question,
      ...await solveSubject(input, service)
    }))
  );

  app.post(
    '/api/recognize',
    validateRequest(imageRequestSchema, '圖片或題號格式不符。請使用 5 MB 內、2,000 萬像素內且單邊不超過 10,000 像素的PNG、JPEG 或 WebP；題號請填 1–8 位數字。'),
    aiHandler(recognizeImage)
  );

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Not Found',
      },
      requestId: req.requestId
    });
  });

  app.use(errorHandler);

  return app;
}

