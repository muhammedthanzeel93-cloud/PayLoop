import mongoose, { ClientSession, PipelineStage, Types } from 'mongoose';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES } from '@kerala-tourism/constants';
import { env } from '../../config/env';
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
} from '../../shared/errors/AppError';
import {
  AccountModel,
  FollowModel,
  IFollowDocument,
  TouristProfileModel,
} from '../../shared/models';
import {
  AdjustedFollowCounts,
  FollowEdgeRecord,
  FollowListQueryOptions,
} from './follow.types';

const MAX_TX_RETRIES = 8;

const isDuplicateKeyError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const maybeErr = err as { code?: number; cause?: { code?: number } };
  return maybeErr.code === 11000 || maybeErr.cause?.code === 11000;
};

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

export class FollowRepository {
  /**
   * Executes a multi-document MongoDB ACID transaction with jittered retries on WriteConflict.
   * In production, transaction support is mandatory and non-replica-set topologies fail loudly.
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
              'Atomic follow operations require a MongoDB replica set transaction topology',
            );
          }
          console.warn(
            '[FollowRepository] MongoDB standalone topology detected outside production; executing with compensating cleanup.',
          );
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

    throw new InternalServerError('Follow transaction retries exhausted');
  }

  public async findFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IFollowDocument | null> {
    const query = FollowModel.findOne({
      followerId: new Types.ObjectId(followerId.toString()),
      followingId: new Types.ObjectId(followingId.toString()),
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async createFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IFollowDocument> {
    try {
      const [created] = await FollowModel.create(
        [
          {
            followerId: new Types.ObjectId(followerId.toString()),
            followingId: new Types.ObjectId(followingId.toString()),
          },
        ],
        session ? { session } : undefined,
      );
      return created;
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError('You are already following this user');
      }
      throw err;
    }
  }

  public async deleteFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IFollowDocument | null> {
    return FollowModel.findOneAndDelete(
      {
        followerId: new Types.ObjectId(followerId.toString()),
        followingId: new Types.ObjectId(followingId.toString()),
      },
      session ? { session } : undefined,
    );
  }

  /**
   * Atomically updates caller `followingCount` and target `followersCount` on TouristProfileModel.
   * Decrements guard `{ [field]: { $gt: 0 } }` so counts cannot become negative.
   */
  public async adjustFollowCounts(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    delta: 1 | -1,
    session?: ClientSession,
  ): Promise<AdjustedFollowCounts> {
    const followerObjId = new Types.ObjectId(followerId.toString());
    const followingObjId = new Types.ObjectId(followingId.toString());
    const sessionOpts = session ? { new: true, session } : { new: true };

    const [updatedFollower, updatedTarget] = await Promise.all([
      TouristProfileModel.findOneAndUpdate(
        delta < 0
          ? { accountId: followerObjId, followingCount: { $gt: 0 } }
          : { accountId: followerObjId },
        { $inc: { followingCount: delta } },
        sessionOpts,
      ),
      TouristProfileModel.findOneAndUpdate(
        delta < 0
          ? { accountId: followingObjId, followersCount: { $gt: 0 } }
          : { accountId: followingObjId },
        { $inc: { followersCount: delta } },
        sessionOpts,
      ),
    ]);

    if (delta > 0) {
      if (!updatedFollower || !updatedTarget) {
        throw new NotFoundError('User not found', 'RESOURCE_NOT_FOUND');
      }
      return {
        followerFollowingCount: Math.max(0, updatedFollower.followingCount ?? 0),
        followingFollowersCount: Math.max(0, updatedTarget.followersCount ?? 0),
      };
    }

    const resolveFallbackCount = async (
      updatedDoc: { followersCount?: number; followingCount?: number } | null,
      accountId: Types.ObjectId,
      field: 'followersCount' | 'followingCount',
    ): Promise<number> => {
      if (updatedDoc) {
        return Math.max(0, updatedDoc[field] ?? 0);
      }
      const fallbackQuery = TouristProfileModel.findOne({ accountId }).select(field);
      if (session) {
        fallbackQuery.session(session);
      }
      const fallback = await fallbackQuery.exec();
      return Math.max(0, fallback?.[field] ?? 0);
    };

    const [followerFollowingCount, followingFollowersCount] = await Promise.all([
      resolveFallbackCount(updatedFollower, followerObjId, 'followingCount'),
      resolveFallbackCount(updatedTarget, followingObjId, 'followersCount'),
    ]);

    return { followerFollowingCount, followingFollowersCount };
  }

  private async findConnections(
    direction: 'followers' | 'following',
    targetUserId: string | Types.ObjectId,
    options: FollowListQueryOptions,
  ): Promise<{ items: FollowEdgeRecord[]; total: number }> {
    const targetObjId = new Types.ObjectId(targetUserId.toString());
    const matchField = direction === 'followers' ? 'followingId' : 'followerId';
    const counterpartField = direction === 'followers' ? 'followerId' : 'followingId';

    const skip = (options.page - 1) * options.limit;

    const pipeline: PipelineStage[] = [
      { $match: { [matchField]: targetObjId } },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: AccountModel.collection.name,
          let: { counterpartId: `$${counterpartField}` },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$counterpartId'] },
                accountType: ACCOUNT_TYPES.TOURIST,
                status: ACCOUNT_STATUSES.ACTIVE,
              },
            },
            { $project: { _id: 1 } },
          ],
          as: 'activeAccount',
        },
      },
      { $match: { 'activeAccount.0': { $exists: true } } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          edges: [
            { $skip: skip },
            { $limit: options.limit },
            {
              $lookup: {
                from: TouristProfileModel.collection.name,
                localField: counterpartField,
                foreignField: 'accountId',
                as: 'profile',
              },
            },
            {
              $unwind: {
                path: '$profile',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                accountId: `$${counterpartField}`,
                followedAt: '$createdAt',
                firstName: '$profile.firstName',
                lastName: '$profile.lastName',
                profileImage: '$profile.profileImage',
                bio: '$profile.bio',
              },
            },
          ],
        },
      },
    ];

    interface FacetOutput {
      metadata: Array<{ total: number }>;
      edges: Array<{
        _id: Types.ObjectId;
        accountId: Types.ObjectId;
        followedAt: Date;
        firstName?: string;
        lastName?: string;
        profileImage?: string;
        bio?: string;
      }>;
    }

    const [result] = await FollowModel.aggregate<FacetOutput>(pipeline);
    const total = result?.metadata[0]?.total ?? 0;
    const items: FollowEdgeRecord[] = (result?.edges ?? []).map((edge) => ({
      id: edge.accountId.toString(),
      accountId: edge.accountId.toString(),
      firstName: edge.firstName,
      lastName: edge.lastName,
      profileImage: edge.profileImage,
      bio: edge.bio,
      followedAt: edge.followedAt,
    }));

    return { items, total };
  }

  public async findFollowers(
    targetUserId: string | Types.ObjectId,
    options: FollowListQueryOptions,
  ): Promise<{ items: FollowEdgeRecord[]; total: number }> {
    return this.findConnections('followers', targetUserId, options);
  }

  public async findFollowing(
    targetUserId: string | Types.ObjectId,
    options: FollowListQueryOptions,
  ): Promise<{ items: FollowEdgeRecord[]; total: number }> {
    return this.findConnections('following', targetUserId, options);
  }
}

export const followRepository = new FollowRepository();
