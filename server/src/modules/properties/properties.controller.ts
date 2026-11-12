import { Request, Response, NextFunction } from 'express';
import { PropertiesService, propertiesService } from './properties.service';

export class PropertiesController {
  constructor(private readonly service: PropertiesService = propertiesService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Properties module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const propertiesController = new PropertiesController();
