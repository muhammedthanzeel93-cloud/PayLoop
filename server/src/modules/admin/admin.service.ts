import { ClientSession } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LEVELS,
  ADMIN_USER_MANAGEMENT_RULES,
  SESSION_REVOCATION_REASONS,
} from '@kerala-tourism/constants';
import type {
  AccountStatus,
  AdminDashboardOverviewDto,
  AdminUserDetailsDto,
  AdminUsersListResponseDto,
  AdminUserStatusTransitionResponseDto,
} from '@kerala-tourism/shared-types';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError';
import { AdminRepository, adminRepository } from './admin.repository';
import {
  ADMIN_LEVEL_RANK,
  AdminRequestContext,
  SafeAdminProfileLean,
} from './admin.types';
import {
  AdminUsersQueryInput,
  ReactivateUserInput,
  SuspendUserInput,
} from './admin.validation';
import { AuditLogService, auditLogService } from './audit-log.service';

export class AdminService {
  constructor(
    private repo: AdminRepository = adminRepository,
    private auditService: AuditLogService = auditLogService,
  ) {}

  public setRepository(repository: AdminRepository): void {
    this.repo = repository;
  }

  public setAuditService(service: AuditLogService): void {
    this.auditService = service;
  }

  /**
   * Computes aggregated platform operational metrics across users, destinations, social posts,
   * and business KYC verification states without loading full collections into Node.js memory.
   */
  public async getDashboardOverview(): Promise<AdminDashboardOverviewDto> {
    try {
      return await this.repo.getDashboardOverviewAggregates();
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        'Failed to retrieve admin dashboard overview metrics',
        500,
        'DASHBOARD_OVERVIEW_ERROR',
      );
    }
  }

  /**
   * Returns a paginated, filtered, and safe account directory with batched profile summaries.
   */
  public async listUsers(query: AdminUsersQueryInput): Promise<AdminUsersListResponseDto> {
    const { items, total } = await this.repo.findUsersPaginated(query);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Returns safe account and associated profile details for a specific account ID.
   */
  public async getUserDetails(userId: string): Promise<AdminUserDetailsDto> {
    const user = await this.repo.findSafeUserById(userId);
    if (!user) {
      throw new NotFoundError('User account not found', 'USER_NOT_FOUND');
    }
    return user;
  }

  /**
   * Suspends an ACTIVE user account, revokes active sessions, and appends an immutable audit log.
   */
  public async suspendUser(
    actorAdminId: string,
    targetUserId: string,
    input: SuspendUserInput,
    context: AdminRequestContext,
  ): Promise<AdminUserStatusTransitionResponseDto> {
    if (actorAdminId === targetUserId) {
      throw new ForbiddenError(
        'Administrators cannot suspend their own account',
        'SELF_SUSPENSION_FORBIDDEN',
      );
    }

    return this.repo.withTransaction(async (session) => {
      const { actorProfile, targetAccount } = await this.loadAndAuthorizeTarget(
        actorAdminId,
        targetUserId,
        session,
      );

      if (targetAccount.status !== ACCOUNT_STATUSES.ACTIVE) {
        const message =
          targetAccount.status === ACCOUNT_STATUSES.SUSPENDED
            ? 'Account is already suspended'
            : 'Cannot suspend a deactivated account';
        throw new AppError(message, 409, 'INVALID_STATUS_TRANSITION');
      }

      const updatedAccount = await this.repo.transitionAccountStatusAtomic({
        targetId: targetUserId,
        allowedCurrentStatuses: [ACCOUNT_STATUSES.ACTIVE],
        nextStatus: ACCOUNT_STATUSES.SUSPENDED,
        session,
      });

      if (!updatedAccount) {
        throw new AppError(
          'Account status changed concurrently and is no longer eligible for suspension',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const revokedSessionsCount = await this.repo.revokeActiveSessionsForAccount(
        targetUserId,
        SESSION_REVOCATION_REASONS.ADMIN_SUSPENSION,
        session,
      );

      let auditLog;
      try {
        auditLog = await this.auditService.recordAdminAction(
          {
            actorAccountId: actorAdminId,
            actorAccountType: ACCOUNT_TYPES.ADMIN,
            actorAdminLevel: actorProfile.adminLevel,
            action: ADMIN_AUDIT_ACTIONS.USER_SUSPENDED,
            targetEntityId: targetUserId,
            targetEntityType: 'ACCOUNT',
            reason: input.reason,
            beforeState: { status: ACCOUNT_STATUSES.ACTIVE },
            afterState: { status: ACCOUNT_STATUSES.SUSPENDED },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          session,
        );
      } catch (auditErr) {
        if (!session) {
          await this.repo.restoreAccountStatusCompensating(targetUserId, ACCOUNT_STATUSES.ACTIVE);
        }
        throw auditErr;
      }

      const [safeUser] = await this.repo.hydrateAccountsWithProfiles([updatedAccount], session);
      return {
        user: safeUser,
        revokedSessionsCount,
        auditLog,
      };
    });
  }

  /**
   * Reactivates a SUSPENDED account without restoring previously revoked sessions
   * and appends an immutable audit log entry while preserving history.
   */
  public async reactivateUser(
    actorAdminId: string,
    targetUserId: string,
    input: ReactivateUserInput,
    context: AdminRequestContext,
  ): Promise<AdminUserStatusTransitionResponseDto> {
    if (actorAdminId === targetUserId) {
      throw new ForbiddenError(
        'Administrators cannot modify their own account status',
        'SELF_MODIFICATION_FORBIDDEN',
      );
    }

    const reason =
      input.reason?.trim() || ADMIN_USER_MANAGEMENT_RULES.DEFAULT_REACTIVATION_REASON;

    return this.repo.withTransaction(async (session) => {
      const { actorProfile, targetAccount } = await this.loadAndAuthorizeTarget(
        actorAdminId,
        targetUserId,
        session,
      );

      if (targetAccount.status !== ACCOUNT_STATUSES.SUSPENDED) {
        const message =
          targetAccount.status === ACCOUNT_STATUSES.ACTIVE
            ? 'Account is already active'
            : 'Cannot reactivate a deactivated account';
        throw new AppError(message, 409, 'INVALID_STATUS_TRANSITION');
      }

      const updatedAccount = await this.repo.transitionAccountStatusAtomic({
        targetId: targetUserId,
        allowedCurrentStatuses: [ACCOUNT_STATUSES.SUSPENDED],
        nextStatus: ACCOUNT_STATUSES.ACTIVE,
        session,
      });

      if (!updatedAccount) {
        throw new AppError(
          'Account status changed concurrently and is no longer eligible for reactivation',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      let auditLog;
      try {
        auditLog = await this.auditService.recordAdminAction(
          {
            actorAccountId: actorAdminId,
            actorAccountType: ACCOUNT_TYPES.ADMIN,
            actorAdminLevel: actorProfile.adminLevel,
            action: ADMIN_AUDIT_ACTIONS.USER_REACTIVATED,
            targetEntityId: targetUserId,
            targetEntityType: 'ACCOUNT',
            reason,
            beforeState: { status: ACCOUNT_STATUSES.SUSPENDED },
            afterState: { status: ACCOUNT_STATUSES.ACTIVE },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          session,
        );
      } catch (auditErr) {
        if (!session) {
          await this.repo.restoreAccountStatusCompensating(targetUserId, ACCOUNT_STATUSES.SUSPENDED);
        }
        throw auditErr;
      }

      const [safeUser] = await this.repo.hydrateAccountsWithProfiles([updatedAccount], session);
      return {
        user: safeUser,
        auditLog,
      };
    });
  }

  private async loadAndAuthorizeTarget(
    actorAdminId: string,
    targetUserId: string,
    session?: ClientSession,
  ): Promise<{
    actorProfile: SafeAdminProfileLean;
    targetAccount: { _id: { toString(): string }; accountType: string; status: AccountStatus };
  }> {
    const [actorProfile, targetAccount] = await Promise.all([
      this.repo.findAdminProfileByAccountId(actorAdminId, session),
      this.repo.findAccountForStatusCheck(targetUserId, session),
    ]);

    if (!actorProfile) {
      throw new ForbiddenError('Admin profile not found', 'ADMIN_PROFILE_NOT_FOUND');
    }

    if (!targetAccount) {
      throw new NotFoundError('User account not found', 'USER_NOT_FOUND');
    }

    if (targetAccount.accountType === ACCOUNT_TYPES.ADMIN) {
      const targetAdminProfile = await this.repo.findAdminProfileByAccountId(targetUserId, session);
      if (!targetAdminProfile) {
        throw new ForbiddenError(
          'Cannot modify target administrator without a verified admin profile',
          'INSUFFICIENT_PRIVILEGE_LEVEL',
        );
      }

      const actorRank = ADMIN_LEVEL_RANK[actorProfile.adminLevel];
      const targetRank = ADMIN_LEVEL_RANK[targetAdminProfile.adminLevel];

      if (targetRank > actorRank) {
        throw new ForbiddenError(
          'Administrators cannot modify a higher-privilege administrator account',
          'INSUFFICIENT_PRIVILEGE_LEVEL',
        );
      }

      if (actorProfile.adminLevel !== ADMIN_LEVELS.SUPER_ADMIN && targetRank >= actorRank) {
        throw new ForbiddenError(
          'Only a SUPER_ADMIN can modify an administrator at the same privilege level',
          'INSUFFICIENT_PRIVILEGE_LEVEL',
        );
      }
    }

    return { actorProfile, targetAccount };
  }
}

export const adminService = new AdminService();
