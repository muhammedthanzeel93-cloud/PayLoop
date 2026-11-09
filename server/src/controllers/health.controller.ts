import { Request, Response, NextFunction } from 'express';
import { ApiResponse, HealthResponse } from '@kerala-tourism/shared-types';
import { healthService } from '../services/health.service';

export class HealthController {
  public getHealth = async (
    _req: Request,
    res: Response<ApiResponse<HealthResponse>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const healthData = await healthService.getHealth();
      res.status(200).json({
        success: true,
        data: healthData,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const healthController = new HealthController();
