import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from '../routes';
import { requestLogger } from '../middlewares/requestLogger';
import { notFoundHandler } from '../middlewares/notFoundHandler';
import { errorHandler } from '../middlewares/errorHandler';
import { env } from '../config/env';

export const createApp = (): Application => {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS policy`));
        }
      },
      credentials: true,
    }),
  );

  // Body Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP Request Logging
  app.use(requestLogger);

  // Mount API Routes
  app.use(routes);

  // Fallthrough 404 handler
  app.use(notFoundHandler);

  // Centralized Error handler
  app.use(errorHandler);

  return app;
};
