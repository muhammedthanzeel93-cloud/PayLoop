import { Request, Response, NextFunction } from 'express';
import { AgenciesService, agenciesService } from './agencies.service';

export class AgenciesController {
  constructor(private readonly service: AgenciesService = agenciesService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Agencies module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const agenciesController = new AgenciesController();
