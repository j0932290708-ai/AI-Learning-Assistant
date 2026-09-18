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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL === 'none'
  ? null : (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.7-flash');

function createDefaultAiService() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
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
  const aiTimeoutMs = config.aiTimeoutMs || 30_000;
  const solveRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
  app.locals.logger = logger;

  app.use(requestId);
  // Image base64 adds about a third to the decoded 5 MB image limit.
  app.use('/api/recognize', solveRateLimiter, express.json({ limit: '7mb' }));
  app.use(express.json({ limit: '1mb' }));

  const publicDir = path.join(__dirname, '../public');
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
        if (!aiService) {
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
              return aiService.models.generateContent({
                ...request,
                config: { ...request.config, abortSignal: controller.signal }
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
    solveRateLimiter,
    validateRequest(solveRequestSchema),
    aiHandler(async (input, service) => ({
      question: input.question,
      ...await solveSubject(input, service)
    }))
  );

  app.post(
    '/api/recognize',
    validateRequest(imageRequestSchema),
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
