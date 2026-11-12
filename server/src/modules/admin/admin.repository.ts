import mongoose, { ClientSession, FilterQuery, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  POST_STATUSES,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import type {
  AccountStatus,
  AdminDashboardOverviewDto,
  AdminUserListItemDto,
  AdminUserProfileSummaryDto,
} from '@kerala-tourism/shared-types';
import { env } from '../../config/env';
import { InternalServerError } from '../../shared/errors/AppError';
import {
  AccountModel,
  AdminProfileModel,
  BusinessProfileModel,
  DestinationModel,
  PostModel,
  SessionModel,
  TouristProfileModel,
} from '../../shared/models';
import { IAccountDocument } from '../auth/models/account.model';
import { authRepository } from '../auth/auth.repository';
import { AdminUsersQueryInput } from './admin.validation';
import {
  SafeAccountLean,
  SafeAdminProfileLean,
  SafeBusinessProfileLean,
  SafeTouristProfileLean,
  TransitionAccountStatusParams,
} from './admin.types';

const MAX_TX_RETRIES = 8;
const OBJECT_ID_HEX_REGEX = /^[0-9a-fA-F]{24}$/;

const SAFE_ACCOUNT_PROJECTION =
  '_id email accountType status emailVerifiedAt lastLoginAt createdAt updatedAt';
const SAFE_TOURIST_PROFILE_PROJECTION =
  '_id accountId firstName lastName preferredLanguage followersCount followingCount';
// Select only documents.mimeType so business documents[].storageKey never leaves MongoDB
const SAFE_BUSINESS_PROFILE_PROJECTION =
  '_id accountId businessName businessType contactNumber verificationStatus documents.mimeType';
const SAFE_ADMIN_PROFILE_PROJECTION =
  '_id accountId displayName adminLevel permissions mfaEnabled';

const escapeRegex = (input: string): string =>
  input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isTransientTransactionError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const maybeErr = err as {
    code?: number;
    errorLabels?: string[];
    hasErrorLabel?: (label: string) => boolean;
  };
  return (
    maybeErr.code === 112 ||
    maybeErr.errorLabels?.includes('TransientTransactionError') === true ||
    (typeof maybeErr.hasErrorLabel === 'function' &&
      maybeErr.hasErrorLabel('TransientTransactionError'))
  );
};

const isUnsupportedTransactionError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : '';
  return (
    message.includes('replica set member') ||
    message.includes('Transaction numbers are only allowed')
  );
};

export class AdminRepository {
  /**
   * Executes a multi-document MongoDB ACID transaction with jittered retries on WriteConflict.
   * Enforces replica set transaction support in production.
   */
  public async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const requireTransactions =
      env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

    for (let attempt = 1; attempt <= MAX_TX_RETRIES; attempt += 1) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const result = await fn(session);
        await session.commitTransaction();
        return result;
      } catch (txError: unknown) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }

        if (isUnsupportedTransactionError(txError)) {
          if (requireTransactions) {
            throw new InternalServerError(
              'Atomic administrative mutations require a MongoDB replica set transaction topology',
              'TRANSACTION_REQUIRED',
            );
          }
          return await fn(undefined);
        }

        if (isTransientTransactionError(txError) && attempt < MAX_TX_RETRIES) {
          const jitterMs = 10 + Math.floor(Math.random() * 25);
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
          continue;
        }

        throw txError;
      } finally {
        await session.endSession();
      }
    }

    throw new InternalServerError('Administrative transaction retries exhausted', 'TRANSACTION_EXHAUSTED');
  }

  /**
   * Computes operational overview aggregates directly in MongoDB via concurrent single-pass $group pipelines.
   * Safely defaults to zero counts when collections are empty or uninitialized.
   */
  public async getDashboardOverviewAggregates(): Promise<AdminDashboardOverviewDto> {
    const [usersAgg, destinationsAgg, socialAgg, businessAgg] = await Promise.all([
      AccountModel.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            tourists: {
              $sum: { $cond: [{ $eq: ['$accountType', ACCOUNT_TYPES.TOURIST] }, 1, 0] },
            },
            businesses: {
              $sum: { $cond: [{ $eq: ['$accountType', ACCOUNT_TYPES.BUSINESS] }, 1, 0] },
            },
            admins: {
              $sum: { $cond: [{ $eq: ['$accountType', ACCOUNT_TYPES.ADMIN] }, 1, 0] },
            },
            active: {
              $sum: { $cond: [{ $eq: ['$status', ACCOUNT_STATUSES.ACTIVE] }, 1, 0] },
            },
            suspended: {
              $sum: { $cond: [{ $eq: ['$status', ACCOUNT_STATUSES.SUSPENDED] }, 1, 0] },
            },
          },
        },
        { $project: { _id: 0 } },
      ]),
      DestinationModel.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            verified: {
              $sum: {
                $cond: [{ $eq: ['$verificationStatus', DESTINATION_VERIFICATION_STATUSES.VERIFIED] }, 1, 0],
              },
            },
            pending: {
              $sum: {
                $cond: [{ $eq: ['$verificationStatus', DESTINATION_VERIFICATION_STATUSES.PENDING] }, 1, 0],
              },
            },
            published: {
              $sum: {
                $cond: [{ $eq: ['$publicationStatus', DESTINATION_PUBLICATION_STATUSES.PUBLISHED] }, 1, 0],
              },
            },
          },
        },
        { $project: { _id: 0 } },
      ]),
      PostModel.aggregate([
        { $match: { deletedAt: null } },
        {
          $group: {
            _id: null,
            totalPosts: { $sum: 1 },
            pendingPosts: {
              $sum: { $cond: [{ $eq: ['$status', POST_STATUSES.PENDING] }, 1, 0] },
            },
            publishedPosts: {
              $sum: { $cond: [{ $eq: ['$status', POST_STATUSES.PUBLISHED] }, 1, 0] },
            },
          },
        },
        { $project: { _id: 0 } },
      ]),
      BusinessProfileModel.aggregate([
        {
          $group: {
            _id: null,
            pending: {
              $sum: {
                $cond: [{ $eq: ['$verificationStatus', VERIFICATION_STATUSES.PENDING] }, 1, 0],
              },
            },
            verified: {
              $sum: {
                $cond: [{ $eq: ['$verificationStatus', VERIFICATION_STATUSES.VERIFIED] }, 1, 0],
              },
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ['$verificationStatus', VERIFICATION_STATUSES.REJECTED] }, 1, 0],
              },
            },
          },
        },
        { $project: { _id: 0 } },
      ]),
    ]);

    return {
      users: {
        total: usersAgg[0]?.total ?? 0,
        tourists: usersAgg[0]?.tourists ?? 0,
        businesses: usersAgg[0]?.businesses ?? 0,
        admins: usersAgg[0]?.admins ?? 0,
        active: usersAgg[0]?.active ?? 0,
        suspended: usersAgg[0]?.suspended ?? 0,
      },
      destinations: {
        total: destinationsAgg[0]?.total ?? 0,
        verified: destinationsAgg[0]?.verified ?? 0,
        pending: destinationsAgg[0]?.pending ?? 0,
        published: destinationsAgg[0]?.published ?? 0,
      },
      social: {
        totalPosts: socialAgg[0]?.totalPosts ?? 0,
        pendingPosts: socialAgg[0]?.pendingPosts ?? 0,
        publishedPosts: socialAgg[0]?.publishedPosts ?? 0,
      },
      businessVerification: {
        pending: businessAgg[0]?.pending ?? 0,
        verified: businessAgg[0]?.verified ?? 0,
        rejected: businessAgg[0]?.rejected ?? 0,
      },
    };
  }

  public buildUsersFilter(query: AdminUsersQueryInput): FilterQuery<IAccountDocument> {
    const filter: FilterQuery<IAccountDocument> = {};

    if (query.accountType) {
      filter.accountType = query.accountType;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.search) {
      const trimmed = query.search.trim();
      if (OBJECT_ID_HEX_REGEX.test(trimmed)) {
        filter._id = new Types.ObjectId(trimmed);
      } else {
        filter.email = {
          $regex: escapeRegex(trimmed.toLowerCase()),
          $options: 'i',
        };
      }
    }

    return filter;
  }

  public async findUsersPaginated(query: AdminUsersQueryInput): Promise<{
    items: AdminUserListItemDto[];
    total: number;
  }> {
    const filter = this.buildUsersFilter(query);
    const skip = (query.page - 1) * query.limit;
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;

    const [accounts, total] = await Promise.all([
      AccountModel.find(filter)
        .select(SAFE_ACCOUNT_PROJECTION)
        .sort({ createdAt: sortDir, _id: sortDir })
        .skip(skip)
        .limit(query.limit)
        .lean<SafeAccountLean[]>(),
      AccountModel.countDocuments(filter),
    ]);

    const items = await this.hydrateAccountsWithProfiles(accounts);
    return { items, total };
  }

  public async findSafeUserById(
    userId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<AdminUserListItemDto | null> {
    const query = AccountModel.findById(userId).select(SAFE_ACCOUNT_PROJECTION);
    if (session) {
      query.session(session);
    }

    const account = await query.lean<SafeAccountLean | null>();
    if (!account) {
      return null;
    }

    const [hydrated] = await this.hydrateAccountsWithProfiles([account], session);
    return hydrated ?? null;
  }

  public async findAccountForStatusCheck(
    accountId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<{ _id: Types.ObjectId; accountType: string; status: AccountStatus } | null> {
    const query = AccountModel.findById(accountId).select('_id accountType status');
    if (session) {
      query.session(session);
    }
    return query.lean<{ _id: Types.ObjectId; accountType: string; status: AccountStatus } | null>();
  }

  public async findAdminProfileByAccountId(
    accountId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<SafeAdminProfileLean | null> {
    const query = AdminProfileModel.findOne({ accountId }).select(SAFE_ADMIN_PROFILE_PROJECTION);
    if (session) {
      query.session(session);
    }
    return query.lean<SafeAdminProfileLean | null>();
  }

  public async transitionAccountStatusAtomic(
    params: TransitionAccountStatusParams,
  ): Promise<SafeAccountLean | null> {
    return AccountModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(params.targetId.toString()),
        status: { $in: [...params.allowedCurrentStatuses] },
      },
      { $set: { status: params.nextStatus } },
      {
        new: true,
        session: params.session,
        projection: SAFE_ACCOUNT_PROJECTION,
      },
    ).lean<SafeAccountLean | null>();
  }

  public async revokeActiveSessionsForAccount(
    accountId: Types.ObjectId | string,
    reason: string,
    session?: ClientSession,
  ): Promise<number> {
    return authRepository.revokeAllAccountSessions(accountId, reason, session);
  }

  public async restoreAccountStatusCompensating(
    accountId: Types.ObjectId | string,
    previousStatus: AccountStatus,
  ): Promise<void> {
    await AccountModel.updateOne(
      { _id: new Types.ObjectId(accountId.toString()) },
      { $set: { status: previousStatus } },
    );
  }

  public async countActiveSessions(accountId: Types.ObjectId | string): Promise<number> {
    return SessionModel.countDocuments({
      accountId: new Types.ObjectId(accountId.toString()),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Batch-hydrates polymorphic profile summaries across the page via at most 3 indexed $in queries,
   * avoiding N+1 lookups and guaranteeing zero secret or storageKey leakage.
   */
  public async hydrateAccountsWithProfiles(
    accounts: SafeAccountLean[],
    session?: ClientSession,
  ): Promise<AdminUserListItemDto[]> {
    if (accounts.length === 0) {
      return [];
    }

    const touristIds: Types.ObjectId[] = [];
    const businessIds: Types.ObjectId[] = [];
    const adminIds: Types.ObjectId[] = [];

    for (const acc of accounts) {
      if (acc.accountType === ACCOUNT_TYPES.TOURIST) {
        touristIds.push(acc._id);
      } else if (acc.accountType === ACCOUNT_TYPES.BUSINESS) {
        businessIds.push(acc._id);
      } else if (acc.accountType === ACCOUNT_TYPES.ADMIN) {
        adminIds.push(acc._id);
      }
    }

    const buildTouristQuery = () => {
      const q = TouristProfileModel.find({ accountId: { $in: touristIds } }).select(
        SAFE_TOURIST_PROFILE_PROJECTION,
      );
      if (session) q.session(session);
      return q.lean<SafeTouristProfileLean[]>();
    };

    const buildBusinessQuery = () => {
      const q = BusinessProfileModel.find({ accountId: { $in: businessIds } }).select(
        SAFE_BUSINESS_PROFILE_PROJECTION,
      );
      if (session) q.session(session);
      return q.lean<SafeBusinessProfileLean[]>();
    };

    const buildAdminQuery = () => {
      const q = AdminProfileModel.find({ accountId: { $in: adminIds } }).select(
        SAFE_ADMIN_PROFILE_PROJECTION,
      );
      if (session) q.session(session);
      return q.lean<SafeAdminProfileLean[]>();
    };

    const [touristProfiles, businessProfiles, adminProfiles] = await Promise.all([
      touristIds.length ? buildTouristQuery() : Promise.resolve<SafeTouristProfileLean[]>([]),
      businessIds.length ? buildBusinessQuery() : Promise.resolve<SafeBusinessProfileLean[]>([]),
      adminIds.length ? buildAdminQuery() : Promise.resolve<SafeAdminProfileLean[]>([]),
    ]);

    const profileMap = new Map<string, AdminUserProfileSummaryDto>();

    for (const tp of touristProfiles) {
      profileMap.set(tp.accountId.toString(), {
        id: tp._id.toString(),
        firstName: tp.firstName,
        lastName: tp.lastName,
        preferredLanguage: tp.preferredLanguage,
        followersCount: typeof tp.followersCount === 'number' ? tp.followersCount : 0,
        followingCount: typeof tp.followingCount === 'number' ? tp.followingCount : 0,
      });
    }

    for (const bp of businessProfiles) {
      profileMap.set(bp.accountId.toString(), {
        id: bp._id.toString(),
        businessName: bp.businessName,
        businessType: bp.businessType,
        contactNumber: bp.contactNumber,
        verificationStatus: bp.verificationStatus,
        documentsCount: Array.isArray(bp.documents) ? bp.documents.length : 0,
      });
    }

    for (const ap of adminProfiles) {
      profileMap.set(ap.accountId.toString(), {
        id: ap._id.toString(),
        displayName: ap.displayName,
        adminLevel: ap.adminLevel,
        permissions: ap.permissions,
        mfaEnabled: Boolean(ap.mfaEnabled),
      });
    }

    return accounts.map((acc) => ({
      id: acc._id.toString(),
      email: acc.email,
      accountType: acc.accountType,
      status: acc.status,
      emailVerifiedAt: acc.emailVerifiedAt ? new Date(acc.emailVerifiedAt).toISOString() : null,
      lastLoginAt: acc.lastLoginAt ? new Date(acc.lastLoginAt).toISOString() : null,
      createdAt: new Date(acc.createdAt).toISOString(),
      updatedAt: new Date(acc.updatedAt).toISOString(),
      profile: profileMap.get(acc._id.toString()) ?? null,
    }));
  }
}

export const adminRepository = new AdminRepository();
