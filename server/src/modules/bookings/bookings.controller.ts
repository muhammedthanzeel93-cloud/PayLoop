import { Request, Response, NextFunction } from 'express';
import { BookingsService, bookingsService } from './bookings.service';

export class BookingsController {
  constructor(private readonly service: BookingsService = bookingsService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Bookings module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const bookingsController = new BookingsController();
