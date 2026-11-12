import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from '../routes';
import { requestLogger } from '../middlewares/requestLogger';
import { rateLimiter } from '../middlewares/rateLimiter';
import { notFoundHandler } from '../middlewares/notFoundHandler';
import { errorHandler } from '../middlewares/errorHandler';
import { env } from '../config/env';
import { ForbiddenError } from '../shared/errors/AppError';

export const createApp = (): Application => {
  const app = express();

  // 1. Security Headers via Helmet
  app.use(helmet());

  // 2. CORS Allowlist Configuration
  const rawOrigins = (env.CORS_ORIGINS || env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (env.CLIENT_URL && !rawOrigins.includes(env.CLIENT_URL)) {
    rawOrigins.push(env.CLIENT_URL);
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile native apps, curl, server-to-server)
        if (!origin) {
          return callback(null, true);
        }

        // In development/test, allow wildcard if configured
        if (env.NODE_ENV !== 'production' && rawOrigins.includes('*')) {
          return callback(null, true);
        }

        // In production or strict mode, match against allowlist
        if (rawOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Reject forbidden origin
        return callback(new ForbiddenError(`Origin '${origin}' not allowed by CORS policy`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Bypass-Rate-Limit'],
    }),
  );

  // 3. Rate Limiting Middleware
  app.use(rateLimiter);

  // 4. Request Body Parsers with 10MB limits & Cookie Parser
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // 5. HTTP Request Logging
  app.use(requestLogger);

  // 6. Mount Centralized API Routes
  app.use(routes);

  // 7. Fallthrough 404 Handler
  app.use(notFoundHandler);

  // 8. Centralized Error Handler (must be last)
  app.use(errorHandler);

  return app;
};
