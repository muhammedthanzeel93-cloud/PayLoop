import { Request, Response, NextFunction } from 'express';
import { jwtService, JwtService } from '../shared/security/jwt.service';
import { authRepository, AuthRepository } from '../modules/auth/auth.repository';
import { AuthenticatedPrincipal } from '@kerala-tourism/shared-types';
import {
  ITouristProfileDocument,
  IBusinessProfileDocument,
  IAdminProfileDocument,
} from '../shared/models';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/AppError';
import { ACCOUNT_STATUSES } from '@kerala-tourism/constants';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedPrincipal;
      touristProfile?: ITouristProfileDocument;
      businessProfile?: IBusinessProfileDocument;
      adminProfile?: IAdminProfileDocument;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export class AuthMiddleware {
  constructor(
    private readonly jwt: JwtService = jwtService,
    private repo: AuthRepository = authRepository,
  ) {}

  public setRepository(repository: AuthRepository): void {
    this.repo = repository;
  }

  public authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || typeof authHeader !== 'string') {
        throw new UnauthorizedError('Authentication token required', 'AUTHENTICATION_REQUIRED');
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
        throw new UnauthorizedError('Invalid authorization header format. Expected Bearer <token>', 'AUTHENTICATION_REQUIRED');
      }

      const token = parts[1];
      const claims = this.jwt.verifyAccessToken(token);

      // Verify account existence and active status in DB to handle real-time revocations/suspensions
      const account = await this.repo.findAccountById(claims.sub);
      if (!account) {
        throw new UnauthorizedError('Account associated with this token no longer exists', 'ACCOUNT_NOT_FOUND');
      }

      if (account.status === ACCOUNT_STATUSES.SUSPENDED) {
        throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
      }

      if (account.status === ACCOUNT_STATUSES.DEACTIVATED) {
        throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
      }

      req.user = {
        id: account._id.toString(),
        email: account.email,
        accountType: account.accountType,
        status: account.status,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const authMiddleware = new AuthMiddleware();
export const authenticate = authMiddleware.authenticate;
