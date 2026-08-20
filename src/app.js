import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

import { requestId } from './middleware/requestId.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 未設定');
}

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;

export function createApp({
  config = {},
  services = {},
  logger = console
} = {}) {
  const app = express();

  // =========================
  // Request ID
  // =========================

  app.use(requestId);

  // =========================
  // JSON Body Limit
  // =========================

  app.use(
    express.json({
      limit: '1mb'
    })
  );

  // =========================
  // Rate Limit
  // =========================

  const rateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30
  });

  app.use(rateLimiter);

  // =========================
  // Static Files
  // =========================

  const publicDir = path.join(__dirname, '../public');

  app.use(express.static(publicDir));

  // =========================
  // 首頁
  // =========================

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // =========================
  // Health Check
  // =========================

  app.get('/health', (req, res) => {
    res.status(200).json({
      ok: true
    });
  });

  // =========================
  // AI 解題 API
  // =========================

  app.post('/api/solve', async (req, res, next) => {
    try {
      if (!ai) {
        return res.status(500).json({
          success: false,
          error: {
            message: 'GEMINI_API_KEY 未設定',
            status: 500
          }
        });
      }

      const question = String(req.body?.question || '').trim();
      const subject = String(req.body?.subject || '未指定科目').trim();
      const mode = String(req.body?.mode || '一般解題').trim();

      if (!question) {
        return res.status(400).json({
          success: false,
          error: {
            message: '請輸入題目',
            status: 400
          }
        });
      }

      const prompt = `
你是「AI 全科智慧學習助手」。

請協助學生解答以下題目。

科目：
${subject}

解題方法：
${mode}

題目：
${question}

請按照以下格式回答：

【解題方法】
說明這題適合使用什麼方法，以及為什麼。

【解題步驟】
Step 1：
Step 2：
Step 3：
如果需要更多步驟，請繼續。

【計算過程】
列出重要公式與計算。

【最終答案】
清楚寫出最後答案。

【觀念整理】
用簡單的方式說明這題考到的觀念。

如果是基電、電子或電路題，請優先考慮：
KCL、KVL、節點電壓法、迴路電流法、戴維寧等效、諾頓等效、串聯、並聯等適合的方法。

如果題目資訊不足，請明確指出缺少哪些資訊，不要自行捏造數值。
`;

      logger.log(
        `[AI] solve subject=${subject} mode=${mode} requestId=${req.id}`
      );

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt
      });

      const answer =
        response.text ||
        'AI 沒有產生答案。';

      return res.status(200).json({
        success: true,
        subject,
        method: mode,
        question,
        answer
      });
    } catch (error) {
      logger.error('[AI] solve error:', error);

      return next(error);
    }
  });

  // =========================
  // 404
  // =========================

  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: 'Not Found',
        status: 404
      }
    });
  });

  // =========================
  // Error Handler
  // =========================

  app.use(errorHandler);

  return app;
}