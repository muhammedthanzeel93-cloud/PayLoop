import { ClientSession } from 'mongoose';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, FOLLOW_RULES } from '@kerala-tourism/constants';
import {
  AuthenticatedPrincipal,
  FollowMutationResponseDto,
  FollowUserSummaryDto,
} from '@kerala-tourism/shared-types';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError';
import { IAccountDocument } from '../../shared/models';
import { AuthRepository, authRepository } from '../auth/auth.repository';
import { verifyActiveTouristAccount } from '../posts/post.service';
import { FollowRepository, followRepository } from './follow.repository';
import {
  FollowEdgeRecord,
  FollowListQuery,
  PaginatedFollowUsersResult,
} from './follow.types';

export class FollowService {
  constructor(
    private repo: FollowRepository = followRepository,
    private authRepo: AuthRepository = authRepository,
  ) {}

  public setRepository(repository: FollowRepository): void {
    this.repo = repository;
  }

  public setAuthRepository(repository: AuthRepository): void {
    this.authRepo = repository;
  }

  /**
   * Verifies that the target user exists and is an ACTIVE TOURIST account.
   * Uniformly returns 404 to prevent account status/type enumeration.
   */
  private async requireEligibleTargetTourist(
    targetUserId: string,
    session?: ClientSession,
  ): Promise<IAccountDocument> {
    const account = await this.authRepo.findAccountById(targetUserId, session);
    if (
      !account ||
      account.accountType !== ACCOUNT_TYPES.TOURIST ||
      account.status !== ACCOUNT_STATUSES.ACTIVE
    ) {
      throw new NotFoundError('User not found', 'RESOURCE_NOT_FOUND');
    }
    return account;
  }

  /**
   * Forward-compatible privacy gate hook for followers/following endpoints.
   * No per-account privacy flag exists yet, so all ACTIVE TOURIST accounts are publicly inspectable.
   */
  private async assertCanViewFollowConnections(
    _targetAccount: IAccountDocument,
    _viewer?: AuthenticatedPrincipal,
  ): Promise<void> {
    return;
  }

  private formatConnectionRecords(records: FollowEdgeRecord[]): FollowUserSummaryDto[] {
    return records.map((record) => {
      const firstName = record.firstName?.trim() || 'Kerala';
      const lastName = record.lastName?.trim() || 'Traveler';
      return {
        id: record.accountId,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        profileImage: record.profileImage,
        bio: record.bio,
        followedAt: record.followedAt
          ? record.followedAt.toISOString()
          : new Date().toISOString(),
      };
    });
  }

  /**
   * Follow another active TOURIST account atomically inside a transaction.
   * Derives followerId strictly from principal.id and rejects self-following.
   */
  public async followUser(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
  ): Promise<FollowMutationResponseDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    if (principal.id === targetUserId) {
      throw new ValidationError('You cannot follow yourself', [
        { field: 'userId', message: 'Self-following is not permitted' },
      ]);
    }

    return this.repo.withTransaction(async (session) => {
      const target = await this.requireEligibleTargetTourist(targetUserId, session);

      const existing = await this.repo.findFollow(principal.id, target._id, session);
      if (existing) {
        throw new ConflictError('You are already following this user');
      }

      const created = await this.repo.createFollow(principal.id, target._id, session);

      let counts;
      try {
        counts = await this.repo.adjustFollowCounts(principal.id, target._id, 1, session);
      } catch (err) {
        if (!session) {
          await this.repo.deleteFollow(principal.id, target._id);
        }
        throw err;
      }

      return {
        targetUserId: target._id.toString(),
        following: true,
        followersCount: counts.followingFollowersCount,
        followingCount: counts.followerFollowingCount,
        follow: {
          id: created._id.toString(),
          followerId: principal.id,
          followingId: target._id.toString(),
          createdAt: created.createdAt
            ? created.createdAt.toISOString()
            : new Date().toISOString(),
        },
      };
    });
  }

  /**
   * Unfollow a tourist using only the authenticated caller's own follow relationship.
   */
  public async unfollowUser(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
  ): Promise<FollowMutationResponseDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    return this.repo.withTransaction(async (session) => {
      const deleted = await this.repo.deleteFollow(principal.id, targetUserId, session);
      if (!deleted) {
        throw new NotFoundError('Follow relationship not found', 'RESOURCE_NOT_FOUND');
      }

      const counts = await this.repo.adjustFollowCounts(principal.id, targetUserId, -1, session);

      return {
        targetUserId,
        following: false,
        followersCount: counts.followingFollowersCount,
        followingCount: counts.followerFollowingCount,
      };
    });
  }

  private async listConnections(
    direction: 'followers' | 'following',
    targetUserId: string,
    query: FollowListQuery,
    viewer?: AuthenticatedPrincipal,
  ): Promise<PaginatedFollowUsersResult> {
    const targetAccount = await this.requireEligibleTargetTourist(targetUserId);
    await this.assertCanViewFollowConnections(targetAccount, viewer);

    const page = query.page || 1;
    const limit = query.limit || FOLLOW_RULES.DEFAULT_LIST_LIMIT;

    const { items, total } =
      direction === 'followers'
        ? await this.repo.findFollowers(targetAccount._id, { page, limit })
        : await this.repo.findFollowing(targetAccount._id, { page, limit });

    return {
      items: this.formatConnectionRecords(items),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async listFollowers(
    targetUserId: string,
    query: FollowListQuery,
    viewer?: AuthenticatedPrincipal,
  ): Promise<PaginatedFollowUsersResult> {
    return this.listConnections('followers', targetUserId, query, viewer);
  }

  public async listFollowing(
    targetUserId: string,
    query: FollowListQuery,
    viewer?: AuthenticatedPrincipal,
  ): Promise<PaginatedFollowUsersResult> {
    return this.listConnections('following', targetUserId, query, viewer);
  }
}

export const followService = new FollowService();
