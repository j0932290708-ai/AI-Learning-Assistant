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
import { solveSubject } from './subjects/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

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
        return client.models.generateContent({
          ...request,
          model: MODEL
        });
      }
    }
  };
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('AI service took too long to respond');
      error.code = 'AI_TIMEOUT';
      error.statusCode = 504;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createApp({ services = {}, logger = console, config = {} } = {}) {
  const app = express();
  const aiService = Object.hasOwn(services, 'aiService')
    ? services.aiService
    : createDefaultAiService();
  const concurrencyLimiter = services.concurrencyLimiter || new Semaphore(2, 20);
  const aiTimeoutMs = config.aiTimeoutMs || 30_000;
  const solveRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
  app.locals.logger = logger;

  app.use(requestId);
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

  app.post(
    '/api/solve',
    solveRateLimiter,
    validateRequest(solveRequestSchema),
    async (req, res, next) => {
      let permit;
      try {
        if (!aiService) {
          const error = new Error('AI service is not configured');
          error.code = 'AI_SERVICE_UNAVAILABLE';
          error.statusCode = 503;
          throw error;
        }

        const input = req.validatedBody;
        logger.log?.(
          `[AI] solve subject=${input.subject} method=${input.method} requestId=${req.requestId}`
        );

        permit = await concurrencyLimiter.acquire();
        const result = await withTimeout(
          solveSubject(input, aiService),
          aiTimeoutMs
        );

        res.status(200).json({
          success: true,
          question: input.question,
          ...result,
          requestId: req.requestId
        });
      } catch (error) {
        next(error);
      } finally {
        permit?.release();
      }
    }
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
