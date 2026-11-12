import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { ClientSession, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  BUSINESS_TYPES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  MEDIA_RULES,
  POST_RULES,
  POST_STATUSES,
  POST_VISIBILITIES,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import {
  AccountStatus,
  AccountType,
  CursorPaginationMeta,
  PostDto,
  PostStatus,
  PostVisibility,
} from '@kerala-tourism/shared-types';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import {
  AuthRepository,
  CreateAccountInput,
  CreateBusinessProfileInput,
  CreateTouristProfileInput,
} from '../modules/auth/auth.repository';
import { DestinationsRepository } from '../modules/destinations/destinations.repository';
import { MediaRepository } from '../modules/media/media.repository';
import { PostModel } from '../modules/posts/post.model';
import { PostsRepository } from '../modules/posts/post.repository';
import { postsService } from '../modules/posts/post.service';
import {
  CreatePostPersistenceInput,
  FindFollowingFeedOptions,
} from '../modules/posts/post.types';
import {
  decodeFollowingFeedCursor,
  encodeFollowingFeedCursor,
} from '../modules/posts/post.validation';
import { FollowModel, IFollowDocument } from '../modules/users/follow.model';
import { FollowRepository } from '../modules/users/follow.repository';
import { followService } from '../modules/users/follow.service';
import { AdjustedFollowCounts } from '../modules/users/follow.types';
import { ConflictError, NotFoundError } from '../shared/errors/AppError';
import {
  IAccountDocument,
  IAdminProfileDocument,
  IBusinessProfileDocument,
  IDestinationDocument,
  IMediaDocument,
  IPostDocument,
  ITouristProfileDocument,
} from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
import { dispatchRequest } from './testUtils';

interface TestApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: CursorPaginationMeta;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
}

class InMemoryFeedAuthRepository extends AuthRepository {
  public accountsById = new Map<string, IAccountDocument>();
  public touristProfiles = new Map<string, ITouristProfileDocument>();
  public businessProfiles = new Map<string, IBusinessProfileDocument>();
  public adminProfiles = new Map<string, IAdminProfileDocument>();

  public override async findAccountById(
    id: Types.ObjectId | string,
    _session?: ClientSession,
  ): Promise<IAccountDocument | null> {
    return this.accountsById.get(id.toString()) || null;
  }

  public override async createAccount(data: CreateAccountInput): Promise<IAccountDocument> {
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
    data: CreateTouristProfileInput,
  ): Promise<ITouristProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(data.accountId.toString()),
      firstName: data.firstName,
      lastName: data.lastName,
      profileImage: 'https://cdn.keralatourism.org/avatars/traveler.jpg',
      preferredLanguage: 'EN',
      followersCount: 0,
      followingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ITouristProfileDocument;
    this.touristProfiles.set(data.accountId.toString(), doc);
    return doc;
  }

  public override async createBusinessProfile(
    data: CreateBusinessProfileInput,
  ): Promise<IBusinessProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(data.accountId.toString()),
      businessName: data.businessName,
      businessType: data.businessType,
      contactNumber: data.contactNumber,
      verificationStatus: data.verificationStatus || VERIFICATION_STATUSES.VERIFIED,
      documents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IBusinessProfileDocument;
    this.businessProfiles.set(data.accountId.toString(), doc);
    return doc;
  }

  public override async findTouristProfile(
    accountId: Types.ObjectId | string,
    _session?: ClientSession,
  ): Promise<ITouristProfileDocument | null> {
    return this.touristProfiles.get(accountId.toString()) || null;
  }

  public override async findBusinessProfile(
    accountId: Types.ObjectId | string,
  ): Promise<IBusinessProfileDocument | null> {
    return this.businessProfiles.get(accountId.toString()) || null;
  }

  public override async findAdminProfile(
    accountId: Types.ObjectId | string,
  ): Promise<IAdminProfileDocument | null> {
    return this.adminProfiles.get(accountId.toString()) || null;
  }

  public async seedAdminProfile(accountId: string): Promise<IAdminProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(accountId),
      displayName: 'Feed Moderator',
      permissions: [ADMIN_PERMISSIONS.MODERATE_POSTS],
      adminLevel: ADMIN_LEVELS.MODERATOR,
      mfaEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAdminProfileDocument;
    this.adminProfiles.set(accountId, doc);
    return doc;
  }
}

class InMemoryFeedFollowRepository extends FollowRepository {
  public follows = new Map<string, IFollowDocument>();

  constructor(private readonly authStore: InMemoryFeedAuthRepository) {
    super();
  }

  private edgeKey(followerId: string, followingId: string): string {
    return `${followerId}:${followingId}`;
  }

  public override async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const fakeSession = { inTransaction: () => true } as unknown as ClientSession;
    return fn(fakeSession);
  }

  public override async findFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
  ): Promise<IFollowDocument | null> {
    return this.follows.get(this.edgeKey(followerId.toString(), followingId.toString())) || null;
  }

  public override async createFollow(
    followerId: string | Types.ObjectId,
    followingId: string | Types.ObjectId,
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
  ): Promise<AdjustedFollowCounts> {
    const followerProfile = this.authStore.touristProfiles.get(followerId.toString());
    const targetProfile = this.authStore.touristProfiles.get(followingId.toString());
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
}

class InMemoryFeedMediaRepository extends MediaRepository {
  public mediaMap = new Map<string, IMediaDocument>();

  public seedMedia(overrides: Partial<IMediaDocument>): IMediaDocument {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      uploaderAccountId: overrides.uploaderAccountId || new Types.ObjectId(),
      destinationId: overrides.destinationId,
      storageKey: overrides.storageKey || `general/${id.toString()}.jpg`,
      url: overrides.url || `https://cdn.keralatourism.org/media/general/${id.toString()}.jpg`,
      mimeType: overrides.mimeType || MEDIA_RULES.ALLOWED_MIME_TYPES[0],
      fileSizeBytes: overrides.fileSizeBytes ?? 150_000,
      dimensions: overrides.dimensions || { width: 1200, height: 800 },
      isPrimary: Boolean(overrides.isPrimary),
      displayOrder: overrides.displayOrder ?? 0,
      isModerated: overrides.isModerated !== undefined ? overrides.isModerated : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IMediaDocument;
    this.mediaMap.set(id.toString(), doc);
    return doc;
  }

  public override async findByIds(ids: (string | Types.ObjectId)[]): Promise<IMediaDocument[]> {
    return ids
      .map((id) => this.mediaMap.get(id.toString()))
      .filter((doc): doc is IMediaDocument => Boolean(doc));
  }
}

class InMemoryFeedDestinationsRepository extends DestinationsRepository {
  public destinations = new Map<string, IDestinationDocument>();

  public seedDestination(overrides: Partial<IDestinationDocument> = {}): IDestinationDocument {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      name: overrides.name || 'Munnar Tea Valleys',
      slug: overrides.slug || `munnar-${id.toString().slice(-6)}`,
      description:
        overrides.description || 'Scenic mist-covered hills and tea plantations in Idukki.',
      categoryIds: overrides.categoryIds || [],
      location: overrides.location || { type: 'Point', coordinates: [77.0595, 10.0889] },
      address: overrides.address || 'Munnar, Idukki, Kerala',
      district: overrides.district || 'Idukki',
      locality: overrides.locality || 'Devikulam',
      images: overrides.images || ['https://cdn.keralatourism.org/destinations/munnar.webp'],
      facilities: overrides.facilities || ['Viewpoint'],
      verificationStatus:
        overrides.verificationStatus || DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus:
        overrides.publicationStatus || DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: overrides.createdBy || new Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IDestinationDocument;
    this.destinations.set(id.toString(), doc);
    return doc;
  }

  public override async findDestinationById(
    id: string | Types.ObjectId,
  ): Promise<IDestinationDocument | null> {
    return this.destinations.get(id.toString()) || null;
  }

  public override async findDestinationsByIds(
    ids: (string | Types.ObjectId)[],
  ): Promise<IDestinationDocument[]> {
    return ids
      .map((id) => this.destinations.get(id.toString()))
      .filter((doc): doc is IDestinationDocument => Boolean(doc));
  }
}

class InMemoryFeedPostsRepository extends PostsRepository {
  public posts = new Map<string, IPostDocument>();

  constructor(
    private readonly authStore: InMemoryFeedAuthRepository,
    private readonly followStore: InMemoryFeedFollowRepository,
  ) {
    super();
  }

  public override async createPost(data: CreatePostPersistenceInput): Promise<IPostDocument> {
    const id = new Types.ObjectId();
    const now = new Date();
    const doc = {
      _id: id,
      id: id.toString(),
      authorId: data.authorId,
      content: data.content,
      mediaIds: data.mediaIds || [],
      destinationId: data.destinationId ?? null,
      visibility: data.visibility || POST_VISIBILITIES.PUBLIC,
      status: data.status || POST_STATUSES.PUBLISHED,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      publishedAt: data.publishedAt ?? null,
      deletedAt: data.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as IPostDocument;
    this.posts.set(id.toString(), doc);
    return doc;
  }

  public seedRawPost(overrides: {
    _id?: Types.ObjectId;
    authorId: Types.ObjectId;
    content: string;
    mediaIds?: Types.ObjectId[];
    destinationId?: Types.ObjectId | null;
    visibility?: PostVisibility;
    status?: PostStatus;
    likesCount?: number;
    commentsCount?: number;
    repostsCount?: number;
    publishedAt?: Date | null;
    deletedAt?: Date | null;
    createdAt?: Date;
  }): IPostDocument {
    const id = overrides._id || new Types.ObjectId();
    const createdAt = overrides.createdAt || new Date();
    const doc = {
      _id: id,
      id: id.toString(),
      authorId: overrides.authorId,
      content: overrides.content,
      mediaIds: overrides.mediaIds || [],
      destinationId: overrides.destinationId ?? null,
      visibility: overrides.visibility || POST_VISIBILITIES.PUBLIC,
      status: overrides.status || POST_STATUSES.PUBLISHED,
      likesCount: overrides.likesCount ?? 0,
      commentsCount: overrides.commentsCount ?? 0,
      repostsCount: overrides.repostsCount ?? 0,
      publishedAt: overrides.publishedAt !== undefined ? overrides.publishedAt : createdAt,
      deletedAt: overrides.deletedAt ?? null,
      createdAt,
      updatedAt: createdAt,
    } as unknown as IPostDocument;
    this.posts.set(id.toString(), doc);
    return doc;
  }

  public override async findTouristProfilesByAccountIds(
    accountIds: (string | Types.ObjectId)[],
  ): Promise<ITouristProfileDocument[]> {
    return accountIds
      .map((id) => this.authStore.touristProfiles.get(id.toString()))
      .filter((p): p is ITouristProfileDocument => Boolean(p));
  }

  public override async findFollowingFeed(
    followerAccountId: string | Types.ObjectId,
    options: FindFollowingFeedOptions,
  ): Promise<{ items: IPostDocument[]; hasMore: boolean }> {
    const callerId = followerAccountId.toString();

    const followedAuthorIds = new Set<string>();
    for (const edge of this.followStore.follows.values()) {
      const fId = edge.followerId.toString();
      const tId = edge.followingId.toString();
      if (fId === callerId && tId !== callerId) {
        const account = this.authStore.accountsById.get(tId);
        if (
          account &&
          account.accountType === ACCOUNT_TYPES.TOURIST &&
          account.status === ACCOUNT_STATUSES.ACTIVE
        ) {
          followedAuthorIds.add(tId);
        }
      }
    }

    const candidates: IPostDocument[] = [];
    for (const post of this.posts.values()) {
      if (!followedAuthorIds.has(post.authorId.toString())) continue;
      if (post.status !== POST_STATUSES.PUBLISHED) continue;
      if (post.deletedAt !== null) continue;
      if (
        post.visibility !== POST_VISIBILITIES.PUBLIC &&
        post.visibility !== POST_VISIBILITIES.FOLLOWERS
      ) {
        continue;
      }
      if (!(post.publishedAt instanceof Date)) continue;

      if (options.cursor) {
        const postTime = post.publishedAt.getTime();
        const cursorTime = options.cursor.publishedAt.getTime();
        const postIdHex = post._id.toString();
        const cursorIdHex = options.cursor.id.toString();
        if (postTime > cursorTime) continue;
        if (postTime === cursorTime && postIdHex >= cursorIdHex) continue;
      }

      candidates.push(post);
    }

    candidates.sort((a, b) => {
      const timeDiff =
        (b.publishedAt as Date).getTime() - (a.publishedAt as Date).getTime();
      if (timeDiff !== 0) return timeDiff;
      const aHex = a._id.toString();
      const bHex = b._id.toString();
      return bHex > aHex ? 1 : bHex < aHex ? -1 : 0;
    });

    const hasMore = candidates.length > options.limit;
    const items = hasMore ? candidates.slice(0, options.limit) : candidates;
    return { items, hasMore };
  }
}

const app = createApp();

let authRepo: InMemoryFeedAuthRepository;
let followRepo: InMemoryFeedFollowRepository;
let mediaRepo: InMemoryFeedMediaRepository;
let destRepo: InMemoryFeedDestinationsRepository;
let postsRepo: InMemoryFeedPostsRepository;

beforeEach(() => {
  resetRateLimiter();
  authRepo = new InMemoryFeedAuthRepository();
  followRepo = new InMemoryFeedFollowRepository(authRepo);
  mediaRepo = new InMemoryFeedMediaRepository();
  destRepo = new InMemoryFeedDestinationsRepository();
  postsRepo = new InMemoryFeedPostsRepository(authRepo, followRepo);

  authMiddleware.setRepository(authRepo);
  authorizationMiddleware.setRepository(authRepo);
  followService.setAuthRepository(authRepo);
  followService.setRepository(followRepo);
  postsService.setAuthRepository(authRepo);
  postsService.setRepository(postsRepo);
  postsService.setMediaRepository(mediaRepo);
  postsService.setDestinationsRepository(destRepo);
});

const createUser = async (
  accountType: AccountType = ACCOUNT_TYPES.TOURIST,
  status: AccountStatus = ACCOUNT_STATUSES.ACTIVE,
  name: { firstName?: string; lastName?: string } = {},
) => {
  const email = `${accountType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const account = await authRepo.createAccount({
    email,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashvalue123456',
    accountType,
    status,
  });

  if (accountType === ACCOUNT_TYPES.TOURIST) {
    await authRepo.createTouristProfile({
      accountId: account._id,
      firstName: name.firstName || 'Ananya',
      lastName: name.lastName || 'Nair',
    });
  } else if (accountType === ACCOUNT_TYPES.BUSINESS) {
    await authRepo.createBusinessProfile({
      accountId: account._id,
      businessName: 'Vembanad Stays',
      businessType: BUSINESS_TYPES.RESORT,
      contactNumber: '+919847099999',
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });
  } else if (accountType === ACCOUNT_TYPES.ADMIN) {
    await authRepo.seedAdminProfile(account._id.toString());
  }

  const token = jwtService.signAccessToken({
    id: account._id.toString(),
    email: account.email,
    accountType: account.accountType,
    status: account.status,
  });

  return { account, token };
};

test('Day 16 — Following-Based Feed & Personalized Timeline Suite', async (t) => {
  await t.test('1. Authenticated active tourist retrieves newest followed posts first', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);
    const authorA = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Aarav',
      lastName: 'Menon',
    });
    const authorB = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Lakshmi',
      lastName: 'Varma',
    });

    await followRepo.createFollow(viewer.account._id, authorA.account._id);
    await followRepo.createFollow(viewer.account._id, authorB.account._id);

    const t1 = new Date('2026-10-01T08:00:00.000Z');
    const t2 = new Date('2026-10-01T09:30:00.000Z');
    const t3 = new Date('2026-10-01T11:00:00.000Z');

    const older = postsRepo.seedRawPost({
      authorId: authorA.account._id,
      content: 'Morning mist over Athirappilly waterfalls.',
      publishedAt: t1,
      likesCount: 4,
      commentsCount: 2,
      repostsCount: 1,
    });
    const middle = postsRepo.seedRawPost({
      authorId: authorB.account._id,
      content: 'Kayaking through Kovalam lagoons.',
      visibility: POST_VISIBILITIES.FOLLOWERS,
      publishedAt: t2,
    });
    const newest = postsRepo.seedRawPost({
      authorId: authorA.account._id,
      content: 'Golden dusk at Bekal Fort!',
      publishedAt: t3,
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(
      res.body.data?.map((p) => p.id),
      [newest._id.toString(), middle._id.toString(), older._id.toString()],
    );
    assert.equal(res.body.data?.[2].likesCount, 4);
    assert.equal(res.body.data?.[2].commentsCount, 2);
    assert.equal(res.body.data?.[2].repostsCount, 1);
    assert.equal(res.body.pagination?.limit, POST_RULES.DEFAULT_FOLLOWING_FEED_LIMIT);
    assert.equal(res.body.pagination?.hasMore, false);
    assert.equal('nextCursor' in (res.body.pagination || {}), false);
  });

  await t.test('2. Unauthenticated request is rejected with 401', async () => {
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  await t.test('3. Non-tourist callers (BUSINESS and ADMIN) are rejected with 403', async () => {
    const business = await createUser(ACCOUNT_TYPES.BUSINESS);
    const admin = await createUser(ACCOUNT_TYPES.ADMIN);

    for (const user of [business, admin]) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/tourist/feed/following',
        headers: { authorization: `Bearer ${user.token}` },
      });

      assert.equal(res.status, 403);
      assert.equal(res.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');
    }
  });

  await t.test('4. Suspended and deactivated tourist callers are rejected with 403', async () => {
    const suspended = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.SUSPENDED);
    const deactivated = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.DEACTIVATED);

    const resSusp = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${suspended.token}` },
    });
    assert.equal(resSusp.status, 403);
    assert.equal(resSusp.body.error?.code, 'ACCOUNT_SUSPENDED');

    const resDeact = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${deactivated.token}` },
    });
    assert.equal(resDeact.status, 403);
    assert.equal(resDeact.body.error?.code, 'ACCOUNT_DEACTIVATED');
  });

  await t.test('5. Unfollowed tourist posts and caller own posts (even with anomalous self-edge) are excluded', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);
    const followed = await createUser(ACCOUNT_TYPES.TOURIST);
    const stranger = await createUser(ACCOUNT_TYPES.TOURIST);

    await followRepo.createFollow(viewer.account._id, followed.account._id);
    // Deliberately inject an anomalous self-follow edge directly in storage
    await followRepo.createFollow(viewer.account._id, viewer.account._id);

    const followedPost = postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Varkala cliff breeze at sunrise.',
      publishedAt: new Date('2026-10-02T07:00:00.000Z'),
    });
    postsRepo.seedRawPost({
      authorId: stranger.account._id,
      content: 'Should not appear because unfollowed.',
      publishedAt: new Date('2026-10-02T08:00:00.000Z'),
    });
    postsRepo.seedRawPost({
      authorId: viewer.account._id,
      content: 'Own post should not clutter following feed.',
      publishedAt: new Date('2026-10-02T09:00:00.000Z'),
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data?.map((p) => p.id),
      [followedPost._id.toString()],
    );
  });

  await t.test('6. Enforces visibility & lifecycle filters (allows PUBLIC/FOLLOWERS+PUBLISHED; excludes PRIVATE, PENDING, REJECTED, REMOVED, deletedAt, null publishedAt)', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);
    const followed = await createUser(ACCOUNT_TYPES.TOURIST);
    await followRepo.createFollow(viewer.account._id, followed.account._id);

    const baseTime = new Date('2026-10-03T10:00:00.000Z');
    const pubPost = postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Eligible PUBLIC post.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: new Date(baseTime.getTime() + 1000),
    });
    const followersPost = postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Eligible FOLLOWERS post.',
      visibility: POST_VISIBILITIES.FOLLOWERS,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: baseTime,
    });

    // All ineligible combinations:
    postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Private journal note.',
      visibility: POST_VISIBILITIES.PRIVATE,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: baseTime,
    });
    postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Pending moderation.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PENDING,
      publishedAt: baseTime,
    });
    postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Rejected post.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.REJECTED,
      publishedAt: baseTime,
    });
    postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Removed post.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.REMOVED,
      publishedAt: baseTime,
    });
    postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Soft deleted post.',
      visibility: POST_VISIBILITIES.FOLLOWERS,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: baseTime,
      deletedAt: new Date(),
    });
    postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Unpublished null timestamp.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: null,
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data?.map((p) => p.id),
      [pubPost._id.toString(), followersPost._id.toString()],
    );
  });

  await t.test('7. Excludes posts from suspended, deactivated, or non-tourist followed accounts', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);
    const activeAuthor = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE);
    const suspendedAuthor = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.SUSPENDED);
    const deactivatedAuthor = await createUser(
      ACCOUNT_TYPES.TOURIST,
      ACCOUNT_STATUSES.DEACTIVATED,
    );
    const bizAuthor = await createUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE);

    await Promise.all([
      followRepo.createFollow(viewer.account._id, activeAuthor.account._id),
      followRepo.createFollow(viewer.account._id, suspendedAuthor.account._id),
      followRepo.createFollow(viewer.account._id, deactivatedAuthor.account._id),
      followRepo.createFollow(viewer.account._id, bizAuthor.account._id),
    ]);

    const okPost = postsRepo.seedRawPost({
      authorId: activeAuthor.account._id,
      content: 'Active tourist post.',
      publishedAt: new Date('2026-10-04T09:00:00.000Z'),
    });
    postsRepo.seedRawPost({
      authorId: suspendedAuthor.account._id,
      content: 'Suspended author post.',
      publishedAt: new Date('2026-10-04T10:00:00.000Z'),
    });
    postsRepo.seedRawPost({
      authorId: deactivatedAuthor.account._id,
      content: 'Deactivated author post.',
      publishedAt: new Date('2026-10-04T11:00:00.000Z'),
    });
    postsRepo.seedRawPost({
      authorId: bizAuthor.account._id,
      content: 'Business account post.',
      publishedAt: new Date('2026-10-04T12:00:00.000Z'),
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data?.map((p) => p.id),
      [okPost._id.toString()],
    );
  });

  await t.test('8. Tourist who follows nobody receives empty data[], hasMore: false, and no nextCursor', async () => {
    const loner = await createUser(ACCOUNT_TYPES.TOURIST);
    const other = await createUser(ACCOUNT_TYPES.TOURIST);

    postsRepo.seedRawPost({
      authorId: other.account._id,
      content: 'Post from unfollowed tourist.',
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${loner.token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, []);
    assert.deepEqual(res.body.pagination, {
      limit: POST_RULES.DEFAULT_FOLLOWING_FEED_LIMIT,
      hasMore: false,
    });
    assert.equal('nextCursor' in (res.body.pagination || {}), false);
  });

  await t.test('9. Multi-page keyset cursor pagination handles identical publishedAt tie-breakers without duplicates or skips', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);
    const followed = await createUser(ACCOUNT_TYPES.TOURIST);
    await followRepo.createFollow(viewer.account._id, followed.account._id);

    const sameTs = new Date('2026-10-05T12:00:00.000Z');
    const olderTs = new Date('2026-10-05T11:00:00.000Z');
    const newestTs = new Date('2026-10-05T13:00:00.000Z');

    // Explicit monotonic ObjectIds with identical sameTs to exercise tie-breaker across page boundary
    const tieId1 = new Types.ObjectId('670000000000000000000001');
    const tieId2 = new Types.ObjectId('670000000000000000000002');
    const tieId3 = new Types.ObjectId('670000000000000000000003');

    const pOldest = postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Oldest post',
      publishedAt: olderTs,
    });
    const pTie1 = postsRepo.seedRawPost({
      _id: tieId1,
      authorId: followed.account._id,
      content: 'Tie 1',
      publishedAt: sameTs,
    });
    const pTie2 = postsRepo.seedRawPost({
      _id: tieId2,
      authorId: followed.account._id,
      content: 'Tie 2',
      publishedAt: sameTs,
    });
    const pTie3 = postsRepo.seedRawPost({
      _id: tieId3,
      authorId: followed.account._id,
      content: 'Tie 3',
      publishedAt: sameTs,
    });
    const pNewest = postsRepo.seedRawPost({
      authorId: followed.account._id,
      content: 'Newest post',
      publishedAt: newestTs,
    });

    const expectedOrder = [
      pNewest._id.toString(),
      pTie3._id.toString(),
      pTie2._id.toString(),
      pTie1._id.toString(),
      pOldest._id.toString(),
    ];

    // Page 1 (limit=2): [pNewest, pTie3]
    const page1 = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following?limit=2',
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(page1.status, 200);
    assert.deepEqual(
      page1.body.data?.map((p) => p.id),
      expectedOrder.slice(0, 2),
    );
    assert.equal(page1.body.pagination?.limit, 2);
    assert.equal(page1.body.pagination?.hasMore, true);
    assert.ok(page1.body.pagination?.nextCursor);

    // Page 2 (limit=2): [pTie2, pTie1] — boundary splits identical publishedAt!
    const page2 = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/tourist/feed/following?limit=2&cursor=${page1.body.pagination?.nextCursor}`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(page2.status, 200);
    assert.deepEqual(
      page2.body.data?.map((p) => p.id),
      expectedOrder.slice(2, 4),
    );
    assert.equal(page2.body.pagination?.hasMore, true);
    assert.ok(page2.body.pagination?.nextCursor);

    // Page 3 (limit=2): [pOldest] — terminal page omits nextCursor
    const page3 = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/tourist/feed/following?limit=2&cursor=${page2.body.pagination?.nextCursor}`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(page3.status, 200);
    assert.deepEqual(
      page3.body.data?.map((p) => p.id),
      expectedOrder.slice(4, 5),
    );
    assert.equal(page3.body.pagination?.hasMore, false);
    assert.equal('nextCursor' in (page3.body.pagination || {}), false);

    // Confirm union equals exact 5 items with zero duplicates
    const seen = [
      ...(page1.body.data || []),
      ...(page2.body.data || []),
      ...(page3.body.data || []),
    ].map((p) => p.id);
    assert.deepEqual(seen, expectedOrder);
    assert.equal(new Set(seen).size, 5);
  });

  await t.test('10. Rejects malformed cursors, invalid limit values, and unknown query params with 400 VALIDATION_ERROR', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);

    const b64 = (obj: unknown): string =>
      Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
    const validId = new Types.ObjectId().toString();
    const validIso = '2026-10-05T12:00:00.000Z';

    const invalidCursors = [
      '',
      'not-valid-base64!',
      Buffer.from('not json', 'utf8').toString('base64url'),
      b64([]),
      b64({ p: validIso }),
      b64({ p: validIso, id: validId, extra: 1 }),
      b64({ p: 'not-a-date', id: validId }),
      b64({ p: '2026-10-05T12:00:00Z', id: validId }), // non-canonical ISO without .000ms
      b64({ p: validIso, id: 'not-an-object-id' }),
      `${encodeFollowingFeedCursor(new Date(validIso), validId)}=`, // invalid padding char
      'a'.repeat(POST_RULES.MAX_CURSOR_LENGTH + 1),
    ];

    for (const badCursor of invalidCursors) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: `/api/v1/tourist/feed/following?cursor=${encodeURIComponent(badCursor)}`,
        headers: { authorization: `Bearer ${viewer.token}` },
      });
      assert.equal(res.status, 400, `Expected 400 for cursor=${badCursor}`);
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
    }

    const badQueries = [
      'limit=0',
      'limit=-5',
      `limit=${POST_RULES.MAX_FEED_LIMIT + 1}`,
      'limit=abc',
      'limit=2.5',
      'unknownParam=1',
      'page=1',
    ];

    for (const q of badQueries) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: `/api/v1/tourist/feed/following?${q}`,
        headers: { authorization: `Bearer ${viewer.token}` },
      });
      assert.equal(res.status, 400, `Expected 400 for query=${q}`);
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
    }

    // Verify encode -> decode roundtrip utility directly
    const encoded = encodeFollowingFeedCursor(new Date(validIso), validId);
    const decoded = decodeFollowingFeedCursor(encoded);
    assert.equal(decoded.publishedAt.toISOString(), validIso);
    assert.equal(decoded.id.toString(), validId);
  });

  await t.test('11. Follow -> feed -> post publish -> unfollow HTTP flow reflects changes immediately', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Viewer',
      lastName: 'One',
    });
    const creator = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Creator',
      lastName: 'Two',
    });

    // Follow via HTTP endpoint
    const followRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${creator.account._id.toString()}/follow`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(followRes.status, 201);

    // Creator publishes a post via HTTP endpoint
    const createPostRes = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${creator.token}` },
      body: {
        content: 'Fresh sunset catch at Marine Drive Kochi!',
        visibility: POST_VISIBILITIES.FOLLOWERS,
      },
    });
    assert.equal(createPostRes.status, 201);
    const createdPostId = createPostRes.body.data?.id;
    assert.ok(createdPostId);

    // Viewer sees post in following feed immediately
    const feedWhileFollowing = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(feedWhileFollowing.status, 200);
    assert.deepEqual(
      feedWhileFollowing.body.data?.map((p) => p.id),
      [createdPostId],
    );

    // Unfollow via HTTP endpoint
    const unfollowRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/users/${creator.account._id.toString()}/follow`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(unfollowRes.status, 200);

    // Subsequent feed reflects unfollow immediately
    const feedAfterUnfollow = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(feedAfterUnfollow.status, 200);
    assert.deepEqual(feedAfterUnfollow.body.data, []);
  });

  await t.test('12. Safe hydration strips author PII and media storageKey while filtering unsafe media and draft destinations', async () => {
    const viewer = await createUser(ACCOUNT_TYPES.TOURIST);
    const author = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Kavya',
      lastName: 'Rao',
    });
    await followRepo.createFollow(viewer.account._id, author.account._id);

    const safeMedia = mediaRepo.seedMedia({
      uploaderAccountId: author.account._id,
      storageKey: 'general/safe-photo.jpg',
      url: 'https://cdn.keralatourism.org/media/general/safe-photo.jpg',
      isModerated: true,
    });
    const unmoderatedMedia = mediaRepo.seedMedia({
      uploaderAccountId: author.account._id,
      storageKey: 'general/pending-photo.jpg',
      url: 'https://cdn.keralatourism.org/media/general/pending-photo.jpg',
      isModerated: false,
    });
    const privateMedia = mediaRepo.seedMedia({
      uploaderAccountId: author.account._id,
      storageKey: 'private/hidden-doc.jpg',
      url: 'https://cdn.keralatourism.org/media/private/hidden-doc.jpg',
      isModerated: true,
    });

    const verifiedDest = destRepo.seedDestination({
      name: 'Munnar Hills',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    });
    const draftDest = destRepo.seedDestination({
      name: 'Unpublished Spot',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
    });

    postsRepo.seedRawPost({
      authorId: author.account._id,
      content: 'Safe hydration post',
      mediaIds: [safeMedia._id, unmoderatedMedia._id, privateMedia._id],
      destinationId: verifiedDest._id,
      publishedAt: new Date('2026-10-06T11:00:00.000Z'),
    });
    postsRepo.seedRawPost({
      authorId: author.account._id,
      content: 'Draft destination summary hidden',
      destinationId: draftDest._id,
      publishedAt: new Date('2026-10-06T10:00:00.000Z'),
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    const [firstPost, secondPost] = res.body.data || [];
    assert.ok(firstPost && secondPost);

    // No author email/passwordHash/status exposed
    const rawAuthor = firstPost.author as unknown as Record<string, unknown>;
    assert.equal(rawAuthor.email, undefined);
    assert.equal(rawAuthor.passwordHash, undefined);
    assert.equal(rawAuthor.status, undefined);
    assert.equal(firstPost.author?.displayName, 'Kavya Rao');

    // Only moderated & non-private/kyc media surfaced; storageKey stripped
    assert.deepEqual(
      firstPost.media.map((m) => m.id),
      [safeMedia._id.toString()],
    );
    const rawMedia = firstPost.media[0] as unknown as Record<string, unknown>;
    assert.equal(rawMedia.storageKey, undefined);

    // Verified+published destination summary included; pending/draft summary withheld
    assert.equal(firstPost.destination?.name, 'Munnar Hills');
    assert.equal(secondPost.destination, undefined);
  });

  await t.test('13. Verifies partial idx_following_feed and idx_follows_following schema index definitions', () => {
    const postIndexes = PostModel.schema.indexes();
    const followingFeedIdx = postIndexes.find(([, opts]) => opts?.name === 'idx_following_feed');
    assert.ok(followingFeedIdx, 'PostModel must define idx_following_feed');
    assert.deepEqual(followingFeedIdx[0], {
      authorId: 1,
      status: 1,
      deletedAt: 1,
      publishedAt: -1,
      _id: -1,
      visibility: 1,
    });
    assert.deepEqual(followingFeedIdx[1]?.partialFilterExpression, {
      status: POST_STATUSES.PUBLISHED,
    });

    const followIndexes = FollowModel.schema.indexes();
    const followingListIdx = followIndexes.find(
      ([, opts]) => opts?.name === 'idx_follows_following',
    );
    assert.ok(followingListIdx, 'FollowModel must define idx_follows_following');
    assert.deepEqual(followingListIdx[0], { followerId: 1, createdAt: -1, _id: -1 });
  });
});
