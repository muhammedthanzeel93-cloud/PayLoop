import { Request, Response, NextFunction } from 'express';
import { PaymentsService, paymentsService } from './payments.service';

export class PaymentsController {
  constructor(private readonly service: PaymentsService = paymentsService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Payments module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const paymentsController = new PaymentsController();
