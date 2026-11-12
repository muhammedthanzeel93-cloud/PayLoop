import { Request, Response, NextFunction } from 'express';
import { SocialService, socialService } from './social.service';

export class SocialController {
  constructor(private readonly service: SocialService = socialService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Social module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const socialController = new SocialController();
