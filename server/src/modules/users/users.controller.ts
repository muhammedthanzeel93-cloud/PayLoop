import { Request, Response, NextFunction } from 'express';
import { UsersService, usersService } from './users.service';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Users module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const usersController = new UsersController();
