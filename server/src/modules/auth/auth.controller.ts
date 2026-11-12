import { Request, Response, NextFunction } from 'express';
import { AuthService, authService } from './auth.service';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  public getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getStatus();
      res.status(200).json({
        success: true,
        message: 'Auth module initialized and ready',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Handles Tourist traveler registration.
   */
  public registerTourist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.registerTourist(req.body);
      res.status(201).json({
        success: true,
        message: 'Tourist registration successful',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Handles Business merchant registration.
   */
  public registerBusiness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.registerBusiness(req.body);
      res.status(201).json({
        success: true,
        message: 'Business registration successful. Verification is pending.',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Handles User Login. Sets secure HttpOnly refreshToken cookie and returns tokens.
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.socket.remoteAddress,
      };

      const result = await this.service.login(req.body, deviceInfo);

      if (result.tokens.refreshToken) {
        this.setRefreshCookie(res, result.tokens.refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          account: result.account,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Refreshes access token and rotates refresh token.
   * Reads refresh token from HttpOnly cookie or request body (for mobile apps).
   */
  public refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken ||
        req.headers['x-refresh-token'];

      if (!rawToken || typeof rawToken !== 'string') {
        throw new UnauthorizedError('Refresh token required', 'REFRESH_TOKEN_REQUIRED');
      }

      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.socket.remoteAddress,
      };

      const tokens = await this.service.refreshToken(rawToken, deviceInfo);

      if (tokens.refreshToken) {
        this.setRefreshCookie(res, tokens.refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Returns current authenticated account details and polymorphic profile.
   */
  public getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError('Authentication token required', 'AUTHENTICATION_REQUIRED');
      }

      const data = await this.service.getMe(req.user.id);

      res.status(200).json({
        success: true,
        message: 'Current account profile retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Logs out the current device session and clears refresh cookie.
   */
  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken ||
        req.headers['x-refresh-token'];

      if (rawToken && typeof rawToken === 'string') {
        await this.service.logout(rawToken);
      }

      this.clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Logs out all sessions belonging to the authenticated account and clears refresh cookie.
   */
  public logoutAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError('Authentication token required', 'AUTHENTICATION_REQUIRED');
      }

      const result = await this.service.logoutAll(req.user.id);
      this.clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        message: 'Logged out from all devices successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Helper to set HttpOnly, SameSite, Secure refresh cookie
   */
  private setRefreshCookie(res: Response, token: string): void {
    const maxAge = env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge,
    });
  }

  /**
   * Helper to clear refresh cookie
   */
  private clearRefreshCookie(res: Response): void {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
  }
}

export const authController = new AuthController();
