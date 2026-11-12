import { Request, Response, NextFunction } from 'express';
import { AuthRepository, authRepository } from '../modules/auth/auth.repository';
import { AccountType, AdminPermission } from '@kerala-tourism/shared-types';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import { UnauthorizedError, ForbiddenError } from '../shared/errors/AppError';

export class AuthorizationMiddleware {
  constructor(private repo: AuthRepository = authRepository) {}

  public setRepository(repository: AuthRepository): void {
    this.repo = repository;
  }

  /**
   * Enforces that the authenticated user has one of the required account types (TOURIST, BUSINESS, ADMIN).
   */
  public requireAccountType = (...accountTypes: AccountType[]) => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
        }

        if (req.user.status === ACCOUNT_STATUSES.SUSPENDED) {
          throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
        }

        if (req.user.status === ACCOUNT_STATUSES.DEACTIVATED) {
          throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
        }

        if (!accountTypes.includes(req.user.accountType)) {
          throw new ForbiddenError(
            `Access forbidden: Requires ${accountTypes.join(' or ')} account type`,
            'FORBIDDEN_ACCOUNT_TYPE',
          );
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  };

  /**
   * Enforces that the authenticated user is an ACTIVE ADMIN with the specific required permission.
   * Verifies the AdminProfile record directly from the database.
   */
  public requirePermission = (permission: AdminPermission) => {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
        }

        if (req.user.status === ACCOUNT_STATUSES.SUSPENDED) {
          throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
        }

        if (req.user.status === ACCOUNT_STATUSES.DEACTIVATED) {
          throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
        }

        if (req.user.accountType !== ACCOUNT_TYPES.ADMIN) {
          throw new ForbiddenError('Access forbidden: Admin privilege required', 'FORBIDDEN_ADMIN_ONLY');
        }

        const adminProfile = await this.repo.findAdminProfile(req.user.id);
        if (!adminProfile) {
          throw new ForbiddenError('Admin profile not found', 'ADMIN_PROFILE_NOT_FOUND');
        }

        if (!adminProfile.permissions.includes(permission)) {
          throw new ForbiddenError(
            `Access forbidden: Admin lacks required permission '${permission}'`,
            'INSUFFICIENT_PERMISSIONS',
          );
        }

        req.adminProfile = adminProfile;
        next();
      } catch (err) {
        next(err);
      }
    };
  };

  /**
   * Enforces that the authenticated user is an ACTIVE BUSINESS whose BusinessProfile is strictly VERIFIED.
   * PENDING, UNDER_REVIEW, or REJECTED states are rejected with 403 Forbidden.
   */
  public requireVerifiedBusiness = async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
      }

      if (req.user.status === ACCOUNT_STATUSES.SUSPENDED) {
        throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
      }

      if (req.user.status === ACCOUNT_STATUSES.DEACTIVATED) {
        throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
      }

      if (req.user.accountType !== ACCOUNT_TYPES.BUSINESS) {
        throw new ForbiddenError('Access forbidden: Business account required', 'FORBIDDEN_BUSINESS_ONLY');
      }

      const businessProfile = await this.repo.findBusinessProfile(req.user.id);
      if (!businessProfile) {
        throw new ForbiddenError('Business profile not found', 'BUSINESS_PROFILE_NOT_FOUND');
      }

      if (businessProfile.verificationStatus !== VERIFICATION_STATUSES.VERIFIED) {
        throw new ForbiddenError(
          `Business verification status is ${businessProfile.verificationStatus}. Operation requires VERIFIED status.`,
          'BUSINESS_NOT_VERIFIED',
        );
      }

      req.businessProfile = businessProfile;
      next();
    } catch (err) {
      next(err);
    }
  };

  /**
   * Ensures that the authenticated account is ACTIVE.
   */
  public requireActiveAccount = (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
      }

      if (req.user.status === ACCOUNT_STATUSES.SUSPENDED) {
        throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
      }

      if (req.user.status === ACCOUNT_STATUSES.DEACTIVATED) {
        throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
      }

      if (req.user.status !== ACCOUNT_STATUSES.ACTIVE) {
        throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const authorizationMiddleware = new AuthorizationMiddleware();
export const requireAccountType = authorizationMiddleware.requireAccountType;
export const requirePermission = authorizationMiddleware.requirePermission;
export const requireVerifiedBusiness = authorizationMiddleware.requireVerifiedBusiness;
export const requireActiveAccount = authorizationMiddleware.requireActiveAccount;
