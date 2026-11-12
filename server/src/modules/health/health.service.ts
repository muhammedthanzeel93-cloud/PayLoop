import { HealthResponse } from './health.types';
import { db } from '../../config/database';
import { env } from '../../config/env';

export class HealthService {
  public async getHealth(): Promise<HealthResponse> {
    const dbStatus = db.getSafeStatus();

    const overallStatus: HealthResponse['status'] =
      dbStatus.status === 'connected' ? 'healthy' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      environment: env.NODE_ENV,
      version: '1.0.0',
      database: dbStatus,
      services: {
        api: 'up',
      },
    };
  }
}

export const healthService = new HealthService();
