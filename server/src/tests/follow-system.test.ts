import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose, { ClientSession, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  FOLLOW_RULES,
} from '@kerala-tourism/constants';
import { env } from '../config/env';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { AuthRepository, authRepository } from '../modules/auth/auth.repository';
import { FollowModel, IFollowDocument } from '../modules/users/follow.model';
import { FollowRepository, followRepository } from '../modules/users/follow.repository';
import { followService } from '../modules/users/follow.service';
import {
  AdjustedFollowCounts,
  FollowEdgeRecord,
  FollowListQueryOptions,
} from '../modules/users/follow.types';
import {
  IAccountDocument,
  ITouristProfileDocument,
  TouristProfileModel,
} from '../shared/models';
import { ConflictError, NotFoundError } from '../shared/errors/AppError';
import { jwtService } from '../shared/security/jwt.service';
import { dispatchRequest } from './testUtils';

type CreateAccountData = Parameters<AuthRepository['createAccount']>[0];
type CreateTouristProfileData = Parameters<AuthRepository['createTouristProfile']>[0];

const asBody = (body: unknown): Record<string, unknown> => body as Record<string, unknown>;
const getErrorCode = (body: unknown): string | undefined => {
  const err = asBody(body).error as Record<string, unknown> | undefined;
  return typeof err?.code === 'string' ? err.code : undefined;
};
const getErrorMessage = (body: unknown): string | undefined => {
  const rec = asBody(body);
  const err = rec.error as Record<string, unknown> | undefined;
  return typeof err?.message === 'string'
    ? err.message
    : typeof rec.message === 'string'
      ? rec.message
      : undefined;
};

class InMemoryFollowAuthRepository extends AuthRepository {
  private accountsById = new Map<string, IAccountDocument>();
  public touristProfilesByAccountId = new Map<string, ITouristProfileDocument>();

  public clear(): void {
    this.accountsById.clear();
    this.touristProfilesByAccountId.clear();
  }

  public override async findAccountById(
    id: Types.ObjectId | string,
    _session?: ClientSession,
  ): Promise<IAccountDocument | null> {
    return this.accountsById.get(id.toString()) || null;
  }

  public override async createAccount(data: CreateAccountData): Promise<IAccountDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      accountType: data.accountType,
      status: data.status || ACCOUNT_STATUSES.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAccountDocument;
    this.accountsById.set(id.toString(), doc);
    return doc;
  }

  public override async createTouristProfile(
    data: CreateTouristProfileData & {
      bio?: string;
      profileImage?: string;
      preferredLanguage?: 'EN' | 'ML';
    },
  ): Promise<ITouristProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(data.accountId.toString()),
      firstName: data.firstName,
      lastName: data.lastName,
      profileImage: data.profileImage,
      bio: data.bio,
      preferredLanguage: data.preferredLanguage || 'EN',
      followersCount: 0,
      followingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ITouristProfileDocument;
    this.touristProfilesByAccountId.set(data.accountId.toString(), doc);
    return doc;
  }

  public override async findTouristProfile(
    accountId: Types.ObjectId | string,
    _session?: ClientSession,
  ): Promise<ITouristProfileDocument | null> {
    return this.touristProfilesByAccountId.get(accountId.toString()) || null;
  }

  public setAccountStatus(
    accountId: string,
    status: (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES],
  ): void {
    const account = this.accountsById.get(accountId);
    if (account) {
      account.status = status;
    }
  }
}

class InMemoryFollowRepository extends FollowRepository {
  public follows = new Map<string, IFollowDocument>();
  public forceAdjustError: Error | null = null;
  private txMutex: Promise<void> = Promise.resolve();

  constructor(private readonly authRepo: InMemoryFollowAuthRepository) {
    super();
  }

  private edgeKey(followerId: string, followingId: string): string {
    return `${followerId}:${followingId}`;
  }

  public clear(): void {
    this.follows.clear();
    this.forceAdjustError = null;
  }

  public override async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const previousTx = this.txMutex;
    let releaseTx!: () => void;
    this.txMutex = new Promise<void>((resolve) => {
      releaseTx = resolve;
    });

    await previousTx;

    try {
      const followSnapshot = new Map<string, IFollowDocument>(this.follows);
      const countSnapshot = new Map<string, { followersCount: number; followingCount: number }>();
      for (const [accountId, profile] of this.authRepo.touristProfilesByAccountId.entries()) {
        countSnapshot.set(accountId, {
          followersCount: profile.followersCount ?? 0,
          followingCount: profile.followingCount ?? 0,
        });
      }

      const fakeSession = {
        inTransaction: () => true,
      } as unknown as ClientSession;

      try {
        return await fn(fakeSession);
      } catch (err) {
        this.follows = followSnapshot;
        for (const [accountId, savedCounts] of countSnapshot.entries()) {
          const profile = this.authRepo.touristProfilesByAccountId.get(accountId);
          if (profile) {
            profile.followersCount = savedCounts.followersCount;
            profile.followingCount = savedCounts.followingCount;
          }
        }
        throw err;
      }
    } finally {
      releaseTx();
    }
  }

  public override async findFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    _session?: ClientSession,
  ): Promise<IFollowDocument | null> {
    return this.follows.get(this.edgeKey(followerId.toString(), followingId.toString())) || null;
  }

  public override async createFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    _session?: ClientSession,
  ): Promise<IFollowDocument> {
    const fId = followerId.toString();
    const tId = followingId.toString();
    const key = this.edgeKey(fId, tId);

    if (this.follows.has(key)) {
      throw new ConflictError('You are already following this user');
    }

    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      followerId: new Types.ObjectId(fId),
      followingId: new Types.ObjectId(tId),
      createdAt: new Date(),
    } as unknown as IFollowDocument;

    this.follows.set(key, doc);
    return doc;
  }

  public override async deleteFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    _session?: ClientSession,
  ): Promise<IFollowDocument | null> {
    const key = this.edgeKey(followerId.toString(), followingId.toString());
    const existing = this.follows.get(key) || null;
    if (existing) {
      this.follows.delete(key);
    }
    return existing;
  }

  public override async adjustFollowCounts(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
    delta: 1 | -1,
    _session?: ClientSession,
  ): Promise<AdjustedFollowCounts> {
    if (this.forceAdjustError) {
      throw this.forceAdjustError;
    }

    const followerProfile = this.authRepo.touristProfilesByAccountId.get(followerId.toString());
    const targetProfile = this.authRepo.touristProfilesByAccountId.get(followingId.toString());

    if (delta > 0 && (!followerProfile || !targetProfile)) {
      throw new NotFoundError('User not found', 'RESOURCE_NOT_FOUND');
    }

    if (followerProfile) {
      followerProfile.followingCount = Math.max(0, (followerProfile.followingCount ?? 0) + delta);
    }
    if (targetProfile) {
      targetProfile.followersCount = Math.max(0, (targetProfile.followersCount ?? 0) + delta);
    }

    return {
      followerFollowingCount: followerProfile?.followingCount ?? 0,
      followingFollowersCount: targetProfile?.followersCount ?? 0,
    };
  }

  private async listEdges(
    direction: 'followers' | 'following',
    targetUserId: string | Types.ObjectId,
    options: FollowListQueryOptions,
  ): Promise<{ items: FollowEdgeRecord[]; total: number }> {
    const targetStr = targetUserId.toString();
    const filtered: Array<{ counterpartId: string; edgeId: Types.ObjectId; createdAt: Date }> = [];

    for (const edge of this.follows.values()) {
      const matchesTarget =
        direction === 'followers'
          ? edge.followingId.toString() === targetStr
          : edge.followerId.toString() === targetStr;
      if (!matchesTarget) {
        continue;
      }

      const counterpartId =
        direction === 'followers' ? edge.followerId.toString() : edge.followingId.toString();
      const counterpartAccount = await this.authRepo.findAccountById(counterpartId);
      if (
        !counterpartAccount ||
        counterpartAccount.accountType !== ACCOUNT_TYPES.TOURIST ||
        counterpartAccount.status !== ACCOUNT_STATUSES.ACTIVE
      ) {
        continue;
      }

      filtered.push({
        counterpartId,
        edgeId: edge._id,
        createdAt: edge.createdAt,
      });
    }

    filtered.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return b.edgeId.toString().localeCompare(a.edgeId.toString());
    });

    const total = filtered.length;
    const skip = (options.page - 1) * options.limit;
    const pageSlice = filtered.slice(skip, skip + options.limit);

    const items: FollowEdgeRecord[] = [];
    for (const entry of pageSlice) {
      const profile = this.authRepo.touristProfilesByAccountId.get(entry.counterpartId);
      items.push({
        id: entry.counterpartId,
        accountId: entry.counterpartId,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        profileImage: profile?.profileImage,
        bio: profile?.bio,
        followedAt: entry.createdAt,
      });
    }

    return { items, total };
  }

  public override async findFollowers(
    targetUserId: string | Types.ObjectId,
    options: FollowListQueryOptions,
  ): Promise<{ items: FollowEdgeRecord[]; total: number }> {
    return this.listEdges('followers', targetUserId, options);
  }

  public override async findFollowing(
    targetUserId: string | Types.ObjectId,
    options: FollowListQueryOptions,
  ): Promise<{ items: FollowEdgeRecord[]; total: number }> {
    return this.listEdges('following', targetUserId, options);
  }
}

describe('Day 15 Follow & Unfollow System (Unit & API Suite)', () => {
  const app = createApp();
  const mockAuthRepo = new InMemoryFollowAuthRepository();
  const mockFollowRepo = new InMemoryFollowRepository(mockAuthRepo);

  let touristAId: string;
  let touristAToken: string;
  let touristBId: string;
  let touristCId: string;
  let businessToken: string;
  let businessAccountId: string;
  let adminToken: string;
  let adminAccountId: string;

  const createTouristWithProfile = async (
    email: string,
    firstName: string,
    lastName: string,
    extra?: { bio?: string; profileImage?: string },
  ): Promise<{ account: IAccountDocument; token: string }> => {
    const account = await mockAuthRepo.createAccount({
      email,
      passwordHash: 'hashed_secret_not_exposed',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await mockAuthRepo.createTouristProfile({
      accountId: account._id,
      firstName,
      lastName,
      bio: extra?.bio,
      profileImage: extra?.profileImage,
    });
    const token = jwtService.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });
    return { account, token };
  };

  before(() => {
    authMiddleware.setRepository(mockAuthRepo);
    followService.setAuthRepository(mockAuthRepo);
    followService.setRepository(mockFollowRepo);
  });

  after(() => {
    authMiddleware.setRepository(authRepository);
    followService.setAuthRepository(authRepository);
    followService.setRepository(followRepository);
    resetRateLimiter();
  });

  beforeEach(async () => {
    resetRateLimiter();
    mockAuthRepo.clear();
    mockFollowRepo.clear();

    const tA = await createTouristWithProfile('arjun@kerala.test', 'Arjun', 'Nair', {
      bio: 'Explorer from Kochi',
      profileImage: 'https://cdn.example.com/arjun.jpg',
    });
    touristAId = tA.account._id.toString();
    touristAToken = tA.token;

    const tB = await createTouristWithProfile('meera@kerala.test', 'Meera', 'Menon', {
      bio: 'Munnar tea trail walker',
    });
    touristBId = tB.account._id.toString();

    const tC = await createTouristWithProfile('dev@kerala.test', 'Dev', 'Pillai');
    touristCId = tC.account._id.toString();

    const biz = await mockAuthRepo.createAccount({
      email: 'resort@kerala.test',
      passwordHash: 'hash',
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    businessAccountId = biz._id.toString();
    businessToken = jwtService.signAccessToken({
      id: businessAccountId,
      email: biz.email,
      accountType: biz.accountType,
      status: biz.status,
    });

    const admin = await mockAuthRepo.createAccount({
      email: 'admin@kerala.test',
      passwordHash: 'hash',
      accountType: ACCOUNT_TYPES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    adminAccountId = admin._id.toString();
    adminToken = jwtService.signAccessToken({
      id: adminAccountId,
      email: admin.email,
      accountType: admin.accountType,
      status: admin.status,
    });
  });

  it('follows another active tourist (201) and atomically increments both profile counts', async () => {
    const res = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    const body = asBody(res.body);
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.message, 'User followed successfully');

    const data = body.data as Record<string, unknown>;
    assert.equal(data.targetUserId, touristBId);
    assert.equal(data.following, true);
    assert.equal(data.followersCount, 1);
    assert.equal(data.followingCount, 1);

    const follow = data.follow as Record<string, unknown>;
    assert.equal(follow.followerId, touristAId);
    assert.equal(follow.followingId, touristBId);
    assert.ok(typeof follow.id === 'string');
    assert.ok(typeof follow.createdAt === 'string');

    const profileA = await mockAuthRepo.findTouristProfile(touristAId);
    const profileB = await mockAuthRepo.findTouristProfile(touristBId);
    assert.equal(profileA?.followingCount, 1);
    assert.equal(profileA?.followersCount, 0);
    assert.equal(profileB?.followersCount, 1);
    assert.equal(profileB?.followingCount, 0);
  });

  it('rejects unauthenticated follow requests with 401', async () => {
    const res = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
    });

    assert.equal(res.status, 401);
    assert.equal(getErrorCode(res.body), 'AUTHENTICATION_REQUIRED');
  });

  it('rejects BUSINESS and ADMIN callers with 403', async () => {
    const bizRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${businessToken}` },
    });
    assert.equal(bizRes.status, 403);

    const adminRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 403);
  });

  it('rejects SUSPENDED or DEACTIVATED callers with 403', async () => {
    mockAuthRepo.setAccountStatus(touristAId, ACCOUNT_STATUSES.SUSPENDED);
    const suspendedRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    assert.equal(suspendedRes.status, 403);

    mockAuthRepo.setAccountStatus(touristAId, ACCOUNT_STATUSES.DEACTIVATED);
    const deactivatedRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    assert.equal(deactivatedRes.status, 403);
  });

  it('rejects invalid target userId format with 400 VALIDATION_ERROR', async () => {
    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/v1/tourist/users/not-a-valid-objectid/follow',
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    assert.equal(res.status, 400);
    assert.equal(getErrorCode(res.body), 'VALIDATION_ERROR');
  });

  it('prevents self-following with 400 VALIDATION_ERROR', async () => {
    const res = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristAId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    assert.equal(res.status, 400);
    assert.equal(getErrorCode(res.body), 'VALIDATION_ERROR');
    assert.equal(mockFollowRepo.follows.size, 0);
  });

  it('prevents duplicate following with 409 CONFLICT', async () => {
    const first = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    assert.equal(first.status, 201);

    const duplicate = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(mockFollowRepo.follows.size, 1);

    const profileB = await mockAuthRepo.findTouristProfile(touristBId);
    assert.equal(profileB?.followersCount, 1);
  });

  it('returns uniform 404 anti-enumeration error for nonexistent, BUSINESS, ADMIN, and inactive targets', async () => {
    const nonexistentId = new Types.ObjectId().toString();
    mockAuthRepo.setAccountStatus(touristCId, ACCOUNT_STATUSES.SUSPENDED);

    const targetIds = [nonexistentId, businessAccountId, adminAccountId, touristCId];
    for (const targetId of targetIds) {
      const followRes = await dispatchRequest(app, {
        method: 'POST',
        url: `/api/v1/tourist/users/${targetId}/follow`,
        headers: { authorization: `Bearer ${touristAToken}` },
      });
      assert.equal(followRes.status, 404);
      assert.equal(getErrorCode(followRes.body), 'RESOURCE_NOT_FOUND');
      assert.equal(getErrorMessage(followRes.body), 'User not found');

      const followersRes = await dispatchRequest(app, {
        method: 'GET',
        url: `/api/v1/users/${targetId}/followers`,
      });
      assert.equal(followersRes.status, 404);
      assert.equal(getErrorCode(followersRes.body), 'RESOURCE_NOT_FOUND');
      assert.equal(getErrorMessage(followersRes.body), 'User not found');

      const followingRes = await dispatchRequest(app, {
        method: 'GET',
        url: `/api/v1/users/${targetId}/following`,
      });
      assert.equal(followingRes.status, 404);
      assert.equal(getErrorCode(followingRes.body), 'RESOURCE_NOT_FOUND');
      assert.equal(getErrorMessage(followingRes.body), 'User not found');
    }
  });

  it('blocks followerId spoofing and counter mass-assignment in request body and profile updates', async () => {
    const spoofFollowRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
      body: { followerId: touristCId, followersCount: 999 },
    });
    assert.equal(spoofFollowRes.status, 400);
    assert.equal(getErrorCode(spoofFollowRes.body), 'VALIDATION_ERROR');

    const spoofUnfollowRes = await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
      body: { followerId: touristCId },
    });
    assert.equal(spoofUnfollowRes.status, 400);
    assert.equal(getErrorCode(spoofUnfollowRes.body), 'VALIDATION_ERROR');

    const profileMassAssignRes = await dispatchRequest(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/profile',
      headers: { authorization: `Bearer ${touristAToken}` },
      body: { followersCount: 5000, followingCount: 5000 },
    });
    assert.equal(profileMassAssignRes.status, 400);
    assert.equal(getErrorCode(profileMassAssignRes.body), 'VALIDATION_ERROR');
  });

  it('handles concurrent duplicate follow requests atomically with single edge and 1x201 + 1x409', async () => {
    const [r1, r2] = await Promise.all([
      dispatchRequest(app, {
        method: 'POST',
        url: `/api/v1/tourist/users/${touristBId}/follow`,
        headers: { authorization: `Bearer ${touristAToken}` },
      }),
      dispatchRequest(app, {
        method: 'POST',
        url: `/api/v1/tourist/users/${touristBId}/follow`,
        headers: { authorization: `Bearer ${touristAToken}` },
      }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);
    assert.equal(mockFollowRepo.follows.size, 1);

    const profileA = await mockAuthRepo.findTouristProfile(touristAId);
    const profileB = await mockAuthRepo.findTouristProfile(touristBId);
    assert.equal(profileA?.followingCount, 1);
    assert.equal(profileB?.followersCount, 1);
  });

  it('unfollows a tourist (200) atomically and rejects duplicate unfollow with 404', async () => {
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    const unfollowRes = await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    const unfollowBody = asBody(unfollowRes.body);
    assert.equal(unfollowRes.status, 200);
    assert.equal(unfollowBody.success, true);
    assert.equal(unfollowBody.message, 'User unfollowed successfully');

    const data = unfollowBody.data as Record<string, unknown>;
    assert.equal(data.targetUserId, touristBId);
    assert.equal(data.following, false);
    assert.equal(data.followersCount, 0);
    assert.equal(data.followingCount, 0);

    const duplicateUnfollowRes = await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    assert.equal(duplicateUnfollowRes.status, 404);
    assert.equal(getErrorCode(duplicateUnfollowRes.body), 'RESOURCE_NOT_FOUND');

    const profileA = await mockAuthRepo.findTouristProfile(touristAId);
    const profileB = await mockAuthRepo.findTouristProfile(touristBId);
    assert.equal(profileA?.followingCount, 0);
    assert.equal(profileB?.followersCount, 0);
  });

  it('allows caller to unfollow a subsequently suspended target without negative counters', async () => {
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    mockAuthRepo.setAccountStatus(touristBId, ACCOUNT_STATUSES.SUSPENDED);

    const res = await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    assert.equal(res.status, 200);
    const profileA = await mockAuthRepo.findTouristProfile(touristAId);
    assert.equal(profileA?.followingCount, 0);
    assert.equal(mockFollowRepo.follows.size, 0);
  });

  it('lists public followers and following newest-first with safe projection (no PII)', async () => {
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    // Ensure distinct createdAt ordering
    const olderEdge = Array.from(mockFollowRepo.follows.values())[0];
    olderEdge.createdAt = new Date(Date.now() - 10_000);

    const tokenC = jwtService.signAccessToken({
      id: touristCId,
      email: 'dev@kerala.test',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${tokenC}` },
    });

    // Tourist A also follows Tourist C
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristCId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });

    const followersRes = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers`,
    });
    const followersListBody = asBody(followersRes.body);
    assert.equal(followersRes.status, 200);
    assert.equal(followersListBody.success, true);

    const followers = followersListBody.data as Array<Record<string, unknown>>;
    assert.equal(followers.length, 2);
    assert.equal(followers[0].id, touristCId);
    assert.equal(followers[1].id, touristAId);
    assert.equal(followers[1].firstName, 'Arjun');
    assert.equal(followers[1].lastName, 'Nair');
    assert.equal(followers[1].displayName, 'Arjun Nair');
    assert.equal(followers[1].profileImage, 'https://cdn.example.com/arjun.jpg');
    assert.equal(followers[1].bio, 'Explorer from Kochi');
    assert.ok(typeof followers[1].followedAt === 'string');

    // Verify no PII or internal status/role leakage
    assert.equal(followers[1].email, undefined);
    assert.equal(followers[1].passwordHash, undefined);
    assert.equal(followers[1].status, undefined);
    assert.equal(followers[1].accountType, undefined);

    const followingRes = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristAId}/following`,
    });
    assert.equal(followingRes.status, 200);
    const following = asBody(followingRes.body).data as Array<Record<string, unknown>>;
    assert.equal(following.length, 2);
    assert.equal(following[0].id, touristCId);
    assert.equal(following[1].id, touristBId);
  });

  it('paginates followers and following lists cleanly and rejects invalid pagination query params', async () => {
    const followerIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const extra = await createTouristWithProfile(`pager${i}@kerala.test`, `User${i}`, 'Test');
      const id = extra.account._id.toString();
      followerIds.push(id);
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: `/api/v1/tourist/users/${touristBId}/follow`,
        headers: { authorization: `Bearer ${extra.token}` },
      });
      assert.equal(res.status, 201);
      const edge = await mockFollowRepo.findFollow(id, touristBId);
      if (edge) {
        edge.createdAt = new Date(Date.now() - (3 - i) * 5000);
      }
    }

    const page1 = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers?page=1&limit=2`,
    });
    assert.equal(page1.status, 200);
    const p1Body = asBody(page1.body);
    const p1Items = p1Body.data as Array<Record<string, unknown>>;
    const p1Meta = p1Body.pagination as Record<string, unknown>;
    assert.equal(p1Items.length, 2);
    assert.equal(p1Meta.page, 1);
    assert.equal(p1Meta.limit, 2);
    assert.equal(p1Meta.total, 3);
    assert.equal(p1Meta.totalPages, 2);
    assert.equal(p1Items[0].id, followerIds[2]);
    assert.equal(p1Items[1].id, followerIds[1]);

    const page2 = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers?page=2&limit=2`,
    });
    assert.equal(page2.status, 200);
    const p2Items = asBody(page2.body).data as Array<Record<string, unknown>>;
    assert.equal(p2Items.length, 1);
    assert.equal(p2Items[0].id, followerIds[0]);

    const tooBigLimit = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers?limit=${FOLLOW_RULES.MAX_LIST_LIMIT + 1}`,
    });
    assert.equal(tooBigLimit.status, 400);

    const zeroPage = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers?page=0`,
    });
    assert.equal(zeroPage.status, 400);

    const unknownQuery = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers?sort=email`,
    });
    assert.equal(unknownQuery.status, 400);
  });

  it('excludes suspended and deactivated accounts from follower lists and pagination total', async () => {
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    const tokenC = jwtService.signAccessToken({
      id: touristCId,
      email: 'dev@kerala.test',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${tokenC}` },
    });

    mockAuthRepo.setAccountStatus(touristCId, ACCOUNT_STATUSES.SUSPENDED);

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${touristBId}/followers`,
    });
    assert.equal(res.status, 200);
    const resBody = asBody(res.body);
    const items = resBody.data as Array<Record<string, unknown>>;
    const pagination = resBody.pagination as Record<string, unknown>;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, touristAId);
    assert.equal(pagination.total, 1);
    assert.equal(pagination.totalPages, 1);
  });

  it('rolls back follow edge when counter update fails mid-transaction', async () => {
    mockFollowRepo.forceAdjustError = new Error('Simulated DB write failure');

    const res = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${touristBId}/follow`,
      headers: { authorization: `Bearer ${touristAToken}` },
    });
    assert.equal(res.status, 500);
    assert.equal(mockFollowRepo.follows.size, 0);

    const profileA = await mockAuthRepo.findTouristProfile(touristAId);
    const profileB = await mockAuthRepo.findTouristProfile(touristBId);
    assert.equal(profileA?.followingCount, 0);
    assert.equal(profileB?.followersCount, 0);
  });

  it('fails loudly in production when MongoDB lacks replica-set transactions', async () => {
    const realStartSession = mongoose.startSession.bind(mongoose);
    const origNodeEnv = process.env.NODE_ENV;
    const origEnvNodeEnv = env.NODE_ENV;

    const fakeSession = {
      startTransaction: () => undefined,
      inTransaction: () => false,
      abortTransaction: async () => undefined,
      commitTransaction: async () => undefined,
      endSession: async () => undefined,
    };

    try {
      (mongoose as unknown as { startSession: () => Promise<unknown> }).startSession = async () =>
        fakeSession;
      process.env.NODE_ENV = 'production';
      (env as { NODE_ENV: string }).NODE_ENV = 'production';

      const repo = new FollowRepository();
      await assert.rejects(
        repo.withTransaction(async () => {
          throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
        }),
        /Atomic follow operations require a MongoDB replica set transaction topology/,
      );
    } finally {
      (mongoose as unknown as { startSession: typeof realStartSession }).startSession =
        realStartSession;
      process.env.NODE_ENV = origNodeEnv;
      (env as { NODE_ENV: string }).NODE_ENV = origEnvNodeEnv;
    }
  });

  it('enforces FollowModel schema constraints and declares required indexes', () => {
    assert.equal(FollowModel.collection.collectionName, 'follows');

    const id = new Types.ObjectId();
    const selfFollowDoc = new FollowModel({
      followerId: id,
      followingId: id,
    });
    const validationErr = selfFollowDoc.validateSync();
    assert.ok(validationErr);
    assert.match(validationErr.message, /cannot follow themselves/i);

    const indexes = FollowModel.schema.indexes();
    const hasUniquePairIndex = indexes.some(
      ([fields, options]) =>
        fields.followerId === 1 && fields.followingId === 1 && options.unique === true,
    );
    const hasFollowersIndex = indexes.some(
      ([fields]) =>
        fields.followingId === 1 && fields.createdAt === -1 && fields._id === -1,
    );
    const hasFollowingIndex = indexes.some(
      ([fields]) =>
        fields.followerId === 1 && fields.createdAt === -1 && fields._id === -1,
    );

    assert.equal(hasUniquePairIndex, true);
    assert.equal(hasFollowersIndex, true);
    assert.equal(hasFollowingIndex, true);

    const profile = new TouristProfileModel({
      accountId: new Types.ObjectId(),
      firstName: 'Kavya',
      lastName: 'Rao',
      followersCount: -1,
    });
    const profileErr = profile.validateSync();
    assert.ok(profileErr);
  });

  it('enforces dedicated followRateLimiter threshold with 429 TOO_MANY_REQUESTS', async () => {
    let triggered429 = false;
    for (let i = 0; i < 65; i += 1) {
      const res = await dispatchRequest(app, {
        method: 'DELETE',
        url: `/api/v1/tourist/users/${touristBId}/follow`,
        headers: { authorization: `Bearer ${touristAToken}` },
      });
      if (res.status === 429) {
        triggered429 = true;
        assert.equal(getErrorCode(res.body), 'TOO_MANY_REQUESTS');
        break;
      }
      assert.equal(res.status, 404);
    }

    assert.equal(triggered429, true);
  });
});
