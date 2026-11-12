import { Request, Response, NextFunction } from 'express';
import { MessagingService, messagingService } from './messaging.service';

export class MessagingController {
  constructor(private readonly service: MessagingService = messagingService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Messaging module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const messagingController = new MessagingController();
