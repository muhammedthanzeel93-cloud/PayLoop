import http from 'http';
import { Application } from 'express';
import { env } from '../config/env';
import { db } from '../config/database';

export const startServer = async (app: Application): Promise<http.Server> => {
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    console.info(`[Server] Kerala Tourism API Server listening on http://${env.HOST}:${env.PORT}`);
    console.info(`[Server] Environment: ${env.NODE_ENV}`);
    console.info(`[Server] Health Endpoint: http://${env.HOST}:${env.PORT}/api/v1/health`);
  });

  // Connect database in background (non-blocking)
  db.connect().catch((err) => {
    console.warn(`[MongoDB] Initial background connection note: ${err.message}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[Server] Received ${signal}. Initiating graceful shutdown...`);

    server.close(async () => {
      console.info('[Server] HTTP connections closed.');
      await db.disconnect();
      console.info('[Server] Graceful shutdown complete.');
      process.exit(0);
    });

    // Force exit after 10s if connections fail to close
    setTimeout(() => {
      console.error('[Server] Forcing shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
};
