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

export function createApp({ services = {}, logger = console } = {}) {
  const app = express();
  const aiService = services.aiService || createDefaultAiService();
  app.locals.logger = logger;

  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));
  app.use(createRateLimiter({ windowMs: 60 * 1000, max: 30 }));

  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post(
    '/api/solve',
    validateRequest(solveRequestSchema),
    async (req, res, next) => {
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

        const result = await solveSubject(input, aiService);

        res.status(200).json({
          success: true,
          question: input.question,
          ...result
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: 'Not Found',
        status: 404
      }
    });
  });

  app.use(errorHandler);

  return app;
}
