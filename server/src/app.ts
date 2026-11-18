import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler, notFound } from './errors.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { tagsRouter } from './routes/tags.js';
import { questionsRouter } from './routes/questions.js';
import { practiceRouter } from './routes/practice.js';
import { learningRouter } from './routes/learning.js';
import { statsRouter } from './routes/stats.js';
import { interviewRouter } from './routes/interview.js';
import { labsRouter } from './routes/labs.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  // 导入题库时文件以 base64 放在 JSON 里传输，放宽体积上限（约支持 15MB 原始文件）
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/practice', practiceRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/interview', interviewRouter);
  app.use('/api/labs', labsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
