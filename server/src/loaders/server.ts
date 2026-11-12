import http from 'http';
import { Application } from 'express';
import { env } from '../config/env';
import { db } from '../config/database';

export const startServer = async (app: Application): Promise<http.Server> => {
  // 1. Initial database connection must succeed BEFORE accepting requests
  console.info('[Server] Connecting to database prior to opening HTTP port...');
  await db.connect();

  // 2. Create HTTP server and start listening
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => {
      console.info(`[Server] Kerala Tourism API Server listening on http://${env.HOST}:${env.PORT}`);
      console.info(`[Server] Environment: ${env.NODE_ENV}`);
      console.info(`[Server] Health Endpoint: http://${env.HOST}:${env.PORT}/api/v1/health`);
      resolve();
    });
  });

  // 3. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.info(`[Server] Received ${signal}. Initiating graceful shutdown...`);

    server.close(async () => {
      console.info('[Server] HTTP connections closed.');
      try {
        await db.disconnect();
      } catch (err) {
        console.error('[Server] Error while disconnecting database:', err);
      }
      console.info('[Server] Graceful shutdown complete.');
      process.exit(0);
    });

    // Force exit after 10 seconds if connections fail to close
    setTimeout(() => {
      console.error('[Server] Forcing shutdown after 10s timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
};
