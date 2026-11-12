import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { AdminService, adminService } from './admin.service';
import { AdminRequestContext } from './admin.types';
import {
  AdminUsersQueryInput,
  ReactivateUserInput,
  SuspendUserInput,
} from './admin.validation';

export class AdminController {
  constructor(private readonly service: AdminService = adminService) {}

  private extractRequestContext(req: Request): AdminRequestContext {
    const ipAddress = req.ip || req.socket?.remoteAddress || null;
    const rawUserAgent = req.headers['user-agent'];
    const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : null;
    return { ipAddress, userAgent };
  }

  public getDashboardOverview = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getDashboardOverview();
      res.status(200).json({
        success: true,
        message: 'Admin dashboard overview retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public listUsers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = req.query as unknown as AdminUsersQueryInput;
      const data = await this.service.listUsers(query);
      res.status(200).json({
        success: true,
        message: 'Users retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public getUserDetails = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getUserDetails(req.params.userId);
      res.status(200).json({
        success: true,
        message: 'User details retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public suspendUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
      }

      const data = await this.service.suspendUser(
        req.user.id,
        req.params.userId,
        req.body as SuspendUserInput,
        this.extractRequestContext(req),
      );

      res.status(200).json({
        success: true,
        message: 'User account suspended successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  public reactivateUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
      }

      const data = await this.service.reactivateUser(
        req.user.id,
        req.params.userId,
        (req.body ?? {}) as ReactivateUserInput,
        this.extractRequestContext(req),
      );

      res.status(200).json({
        success: true,
        message: 'User account reactivated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const adminController = new AdminController();
