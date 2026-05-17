import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';

import healthRouter from './routes/health';
import settingsRouter from './routes/settings';
import vaultRouter from './routes/vault';
import snippetsRouter from './routes/snippets';
import jobsRouter from './routes/jobs';
import extractRouter from './routes/extract';
import analyzeRouter from './routes/analyze';
import generateRouter from './routes/generate';
import refineRouter from './routes/refine';
import analyticsRouter from './routes/analytics';
import transferRouter from './routes/transfer';
import bestPracticesRouter from './routes/bestPractices';
import interviewPrepRouter from './routes/interviewPrep';
import analyzeCvRouter from './routes/analyzeCv';
import rewriteCvRouter from './routes/rewriteCv';
import gapAnalysisRouter from './routes/gapAnalysis';
import careerGuidanceRouter from './routes/careerGuidance';

export function createApp(): express.Application {
  const app = express();

  app.use(cors({
    origin: process.env.NODE_ENV !== 'production' ? 'http://localhost:3090' : false,
    credentials: true,
  }));

  // Baseline security headers. Single-page, same-origin app — no need for CSP/HSTS here;
  // these three are uncontroversial and cost nothing.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API routes
  app.use('/api/health', healthRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/snippets', snippetsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/extract', extractRouter);
  app.use('/api/analyze', analyzeRouter);
  app.use('/api/generate', generateRouter);
  app.use('/api/refine', refineRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/best-practices', bestPracticesRouter);
  app.use('/api/interview-prep', interviewPrepRouter);
  app.use('/api/analyze-cv', analyzeCvRouter);
  app.use('/api/rewrite-cv', rewriteCvRouter);
  app.use('/api/gap-analysis', gapAnalysisRouter);
  app.use('/api/career-guidance', careerGuidanceRouter);
  app.use('/api', transferRouter);

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    const distPath = config.clientDistDir;
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}
