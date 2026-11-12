import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../shared/types';
import { HealthResponse } from './health.types';
import { healthService } from './health.service';

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
