import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClientSession, Types } from 'mongoose';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { jwtService } from '../shared/security/jwt.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { ConflictError } from '../shared/errors/AppError';
import {
  AuthRepository,
  CreateAccountInput,
  CreateTouristProfileInput,
} from '../modules/auth/auth.repository';
import { DestinationsRepository } from '../modules/destinations/destinations.repository';
import { MediaRepository } from '../modules/media/media.repository';
import { PostsRepository } from '../modules/posts/post.repository';
import { postsService } from '../modules/posts/post.service';
import { PostEngagementRepository } from '../modules/posts/post-engagement.repository';
import { postEngagementService } from '../modules/posts/post-engagement.service';
import { PostModel } from '../modules/posts/post.model';
import { PostLikeModel } from '../modules/posts/post-like.model';
import { PostCommentModel } from '../modules/posts/post-comment.model';
import { PostRepostModel } from '../modules/posts/post-repost.model';
import {
  CreatePostPersistenceInput,
  FindPublicFeedOptions,
} from '../modules/posts/post.types';
import {
  CreateCommentPersistenceInput,
  FindPostCommentsOptions,
  PostCounterField,
} from '../modules/posts/post-engagement.types';
import {
  IAccountDocument,
  IPostCommentDocument,
  IPostDocument,
  IPostLikeDocument,
  IPostRepostDocument,
  ITouristProfileDocument,
} from '../shared/models';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  POST_VISIBILITIES,
} from '@kerala-tourism/constants';
import {
  AccountStatus,
  AccountType,
  PostCommentDto,
  PostDto,
  PostLikeResponseDto,
  PostRepostResponseDto,
  PostStatus,
  PostVisibility,
} from '@kerala-tourism/shared-types';

interface TestApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  commentsCount?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
}

class InMemoryEngagementAuthRepository extends AuthRepository {
  public accountsById: Map<string, IAccountDocument> = new Map();
  public touristProfiles: Map<string, ITouristProfileDocument> = new Map();

  public override async findAccountById(
    id: Types.ObjectId | string,
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
      preferredLanguage: 'EN',
      profileImage: 'https://cdn.keralatourism.org/avatars/traveler.webp',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ITouristProfileDocument;
    this.touristProfiles.set(data.accountId.toString(), doc);
    return doc;
  }
}

class InMemoryPostsStoreRepository extends PostsRepository {
  public posts: Map<string, IPostDocument> = new Map();

  constructor(private readonly authStore: InMemoryEngagementAuthRepository) {
    super();
  }

  public async seedPost(data: {
    authorId: Types.ObjectId;
    content: string;
    visibility?: PostVisibility;
    status?: PostStatus;
    deletedAt?: Date | null;
    publishedAt?: Date | null;
    likesCount?: number;
    commentsCount?: number;
    repostsCount?: number;
  }): Promise<IPostDocument> {
    const id = new Types.ObjectId();
    const now = new Date();
    const doc = {
      _id: id,
      id: id.toString(),
      authorId: data.authorId,
      content: data.content,
      mediaIds: [],
      destinationId: null,
      visibility: data.visibility ?? POST_VISIBILITIES.PUBLIC,
      status: data.status ?? POST_STATUSES.PUBLISHED,
      likesCount: data.likesCount ?? 0,
      commentsCount: data.commentsCount ?? 0,
      repostsCount: data.repostsCount ?? 0,
      publishedAt: data.publishedAt === undefined ? now : data.publishedAt,
      deletedAt: data.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as IPostDocument;
    this.posts.set(id.toString(), doc);
    return doc;
  }

  public override async createPost(data: CreatePostPersistenceInput): Promise<IPostDocument> {
    return this.seedPost({
      authorId: data.authorId,
      content: data.content,
      visibility: data.visibility,
      status: data.status,
      deletedAt: data.deletedAt,
      publishedAt: data.publishedAt,
    });
  }

  public override async findPublicPostById(
    id: string | Types.ObjectId,
  ): Promise<IPostDocument | null> {
    const found = this.posts.get(id.toString());
    if (!found) {
      return null;
    }
    if (
      found.visibility !== POST_VISIBILITIES.PUBLIC ||
      found.status !== POST_STATUSES.PUBLISHED ||
      found.deletedAt !== null
    ) {
      return null;
    }
    return found;
  }

  public override async findPublicFeed(
    options: FindPublicFeedOptions,
  ): Promise<{ items: IPostDocument[]; total: number }> {
    const matched = Array.from(this.posts.values()).filter(
      (p) =>
        p.visibility === POST_VISIBILITIES.PUBLIC &&
        p.status === POST_STATUSES.PUBLISHED &&
        p.deletedAt === null &&
        (!options.destinationId || p.destinationId?.toString() === options.destinationId),
    );
    matched.sort((a, b) => {
      const diff = (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0);
      if (diff !== 0) return diff;
      return b._id.toString().localeCompare(a._id.toString());
    });
    const start = (options.page - 1) * options.limit;
    return { items: matched.slice(start, start + options.limit), total: matched.length };
  }

  public override async findTouristProfilesByAccountIds(
    accountIds: string[],
  ): Promise<ITouristProfileDocument[]> {
    const out: ITouristProfileDocument[] = [];
    for (const id of accountIds) {
      const profile = this.authStore.touristProfiles.get(id);
      if (profile) {
        out.push(profile);
      }
    }
    return out;
  }
}

class InMemoryEngagementRepository extends PostEngagementRepository {
  public likes: Map<string, IPostLikeDocument> = new Map();
  public comments: Map<string, IPostCommentDocument> = new Map();
  public reposts: Map<string, IPostRepostDocument> = new Map();
  public failNextCounterAdjustment = false;
  private txMutex: Promise<void> = Promise.resolve();

  constructor(private readonly postsRepo: InMemoryPostsStoreRepository) {
    super();
  }

  private clonePostsSnapshot(): Map<string, { likesCount: number; commentsCount: number; repostsCount: number }> {
    const snap = new Map<string, { likesCount: number; commentsCount: number; repostsCount: number }>();
    for (const [id, post] of this.postsRepo.posts.entries()) {
      snap.set(id, {
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        repostsCount: post.repostsCount,
      });
    }
    return snap;
  }

  private restorePostsSnapshot(
    snap: Map<string, { likesCount: number; commentsCount: number; repostsCount: number }>,
  ): void {
    for (const [id, counts] of snap.entries()) {
      const post = this.postsRepo.posts.get(id);
      if (post) {
        post.likesCount = counts.likesCount;
        post.commentsCount = counts.commentsCount;
        post.repostsCount = counts.repostsCount;
      }
    }
  }

  public override async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const prevLock = this.txMutex;
    let releaseLock!: () => void;
    this.txMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await prevLock;
    const likesSnap = new Map(this.likes);
    const commentsSnap = new Map(
      Array.from(this.comments.entries()).map(([k, v]) => [k, { ...v } as IPostCommentDocument]),
    );
    const repostsSnap = new Map(this.reposts);
    const postsSnap = this.clonePostsSnapshot();

    const mockSession = { inTransaction: () => true } as unknown as ClientSession;

    try {
      return await fn(mockSession);
    } catch (err) {
      this.likes = likesSnap;
      this.comments = commentsSnap;
      this.reposts = repostsSnap;
      this.restorePostsSnapshot(postsSnap);
      throw err;
    } finally {
      releaseLock();
    }
  }

  public override async findEligiblePublicPostById(
    postId: string | Types.ObjectId,
  ): Promise<IPostDocument | null> {
    return this.postsRepo.findPublicPostById(postId);
  }

  private likeKey(accountId: string | Types.ObjectId, postId: string | Types.ObjectId): string {
    return `${accountId.toString()}:${postId.toString()}`;
  }

  private repostKey(accountId: string | Types.ObjectId, postId: string | Types.ObjectId): string {
    return `${accountId.toString()}:${postId.toString()}`;
  }

  public override async findPostLike(
    accountId: string | Types.ObjectId,
    postId: string | Types.ObjectId,
  ): Promise<IPostLikeDocument | null> {
    return this.likes.get(this.likeKey(accountId, postId)) || null;
  }

  public override async createPostLike(
    accountId: string | Types.ObjectId,
    postId: string | Types.ObjectId,
  ): Promise<IPostLikeDocument> {
    const key = this.likeKey(accountId, postId);
    if (this.likes.has(key)) {
      throw new ConflictError('You have already liked this post');
    }
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(accountId.toString()),
      postId: new Types.ObjectId(postId.toString()),
      createdAt: new Date(),
    } as unknown as IPostLikeDocument;
    this.likes.set(key, doc);
    return doc;
  }

  public override async deletePostLike(
    accountId: string | Types.ObjectId,
    postId: string | Types.ObjectId,
  ): Promise<IPostLikeDocument | null> {
    const key = this.likeKey(accountId, postId);
    const existing = this.likes.get(key) || null;
    if (existing) {
      this.likes.delete(key);
    }
    return existing;
  }

  public override async createComment(
    data: CreateCommentPersistenceInput,
  ): Promise<IPostCommentDocument> {
    const id = new Types.ObjectId();
    const now = new Date();
    const doc = {
      _id: id,
      id: id.toString(),
      postId: data.postId,
      authorId: data.authorId,
      content: data.content,
      status: POST_COMMENT_STATUSES.ACTIVE,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } as unknown as IPostCommentDocument;
    this.comments.set(id.toString(), doc);
    return doc;
  }

  public override async findActiveCommentById(
    commentId: string | Types.ObjectId,
  ): Promise<IPostCommentDocument | null> {
    const found = this.comments.get(commentId.toString());
    if (!found || found.status !== POST_COMMENT_STATUSES.ACTIVE || found.deletedAt !== null) {
      return null;
    }
    return found;
  }

  public override async findActiveCommentsByPost(
    postId: string | Types.ObjectId,
    options: FindPostCommentsOptions,
  ): Promise<{ items: IPostCommentDocument[]; total: number }> {
    const matched = Array.from(this.comments.values()).filter(
      (c) =>
        c.postId.toString() === postId.toString() &&
        c.status === POST_COMMENT_STATUSES.ACTIVE &&
        c.deletedAt === null,
    );
    matched.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b._id.toString().localeCompare(a._id.toString());
    });
    const start = (options.page - 1) * options.limit;
    return {
      items: matched.slice(start, start + options.limit),
      total: matched.length,
    };
  }

  public override async updateCommentContent(
    commentId: string | Types.ObjectId,
    content: string,
  ): Promise<IPostCommentDocument | null> {
    const found = await this.findActiveCommentById(commentId);
    if (!found) {
      return null;
    }
    found.content = content;
    found.updatedAt = new Date();
    return found;
  }

  public override async softDeleteActiveComment(
    commentId: string | Types.ObjectId,
  ): Promise<IPostCommentDocument | null> {
    const found = await this.findActiveCommentById(commentId);
    if (!found) {
      return null;
    }
    found.status = POST_COMMENT_STATUSES.REMOVED;
    found.deletedAt = new Date();
    return found;
  }

  public override async findPostRepost(
    accountId: string | Types.ObjectId,
    originalPostId: string | Types.ObjectId,
  ): Promise<IPostRepostDocument | null> {
    return this.reposts.get(this.repostKey(accountId, originalPostId)) || null;
  }

  public override async createPostRepost(
    accountId: string | Types.ObjectId,
    originalPostId: string | Types.ObjectId,
  ): Promise<IPostRepostDocument> {
    const key = this.repostKey(accountId, originalPostId);
    if (this.reposts.has(key)) {
      throw new ConflictError('You have already reposted this post');
    }
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(accountId.toString()),
      originalPostId: new Types.ObjectId(originalPostId.toString()),
      createdAt: new Date(),
    } as unknown as IPostRepostDocument;
    this.reposts.set(key, doc);
    return doc;
  }

  public override async deletePostRepost(
    accountId: string | Types.ObjectId,
    originalPostId: string | Types.ObjectId,
  ): Promise<IPostRepostDocument | null> {
    const key = this.repostKey(accountId, originalPostId);
    const existing = this.reposts.get(key) || null;
    if (existing) {
      this.reposts.delete(key);
    }
    return existing;
  }

  public override async adjustPostCounter(
    postId: string | Types.ObjectId,
    field: PostCounterField,
    delta: 1 | -1,
  ): Promise<number> {
    if (this.failNextCounterAdjustment) {
      this.failNextCounterAdjustment = false;
      throw new Error('Simulated counter adjustment failure');
    }

    const post = this.postsRepo.posts.get(postId.toString());
    if (!post) {
      return 0;
    }

    if (delta < 0 && post[field] <= 0) {
      post[field] = 0;
      return 0;
    }

    post[field] = Math.max(0, (post[field] ?? 0) + delta);
    return post[field];
  }
}

class InMemoryNoopDestinationsRepository extends DestinationsRepository {}
class InMemoryNoopMediaRepository extends MediaRepository {}

const app = createApp();
let authRepo: InMemoryEngagementAuthRepository;
let postsRepo: InMemoryPostsStoreRepository;
let engageRepo: InMemoryEngagementRepository;

beforeEach(() => {
  resetRateLimiter();
  authRepo = new InMemoryEngagementAuthRepository();
  postsRepo = new InMemoryPostsStoreRepository(authRepo);
  engageRepo = new InMemoryEngagementRepository(postsRepo);

  authMiddleware.setRepository(authRepo);
  authorizationMiddleware.setRepository(authRepo);

  postsService.setRepository(postsRepo);
  postsService.setAuthRepository(authRepo);
  postsService.setDestinationsRepository(new InMemoryNoopDestinationsRepository());
  postsService.setMediaRepository(new InMemoryNoopMediaRepository());

  postEngagementService.setRepository(engageRepo);
  postEngagementService.setPostsRepository(postsRepo);
  postEngagementService.setAuthRepository(authRepo);
});

const createUser = async (
  accountType: AccountType,
  status: AccountStatus = ACCOUNT_STATUSES.ACTIVE,
  name: { firstName: string; lastName: string } = { firstName: 'Meera', lastName: 'Nair' },
) => {
  const email = `${accountType.toLowerCase()}-${new Types.ObjectId().toString()}@example.com`;
  const account = await authRepo.createAccount({
    email,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashvalueforunit123456',
    accountType,
    status,
  });
  if (accountType === ACCOUNT_TYPES.TOURIST) {
    await authRepo.createTouristProfile({
      accountId: account._id,
      firstName: name.firstName,
      lastName: name.lastName,
    });
  }
  const token = jwtService.signAccessToken({
    id: account._id.toString(),
    email: account.email,
    accountType: account.accountType,
    status: account.status,
  });
  return { account, token };
};

test('Day 14 — Social Engagement System In-Memory API & Security Suite', async (t) => {
  // ============================================================================
  // LIKES
  // ============================================================================
  await t.test('1. Successful like creation by active tourist returns 201 and increments likesCount', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const liker = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Backwaters sunrise from Kumarakom',
    });

    const res = await dispatchRequest<TestApiResponse<PostLikeResponseDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${liker.token}` },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data?.liked, true);
    assert.equal(res.body.data?.likesCount, 1);
    assert.equal(res.body.data?.like?.accountId, liker.account._id.toString());
    assert.equal(post.likesCount, 1);
  });

  await t.test('2. Duplicate like prevention rejects second attempt with 409 Conflict', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Alleppey houseboat view',
    });

    const first = await dispatchRequest<TestApiResponse<PostLikeResponseDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(first.status, 201);

    const dup = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error?.code, 'CONFLICT');
    assert.equal(post.likesCount, 1);
  });

  await t.test('3. Successful unlike removes caller like and decrements likesCount', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Varkala cliffs sunset',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    const unlike = await dispatchRequest<TestApiResponse<PostLikeResponseDto>>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    assert.equal(unlike.status, 200);
    assert.equal(unlike.body.data?.liked, false);
    assert.equal(unlike.body.data?.likesCount, 0);
    assert.equal(post.likesCount, 0);
  });

  await t.test('4. Unauthenticated like and unlike requests rejected with 401', async () => {
    const postId = new Types.ObjectId().toString();

    const postLike = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${postId}/likes`,
    });
    assert.equal(postLike.status, 401);
    assert.equal(postLike.body.error?.code, 'AUTHENTICATION_REQUIRED');

    const delLike = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${postId}/likes`,
    });
    assert.equal(delLike.status, 401);
  });

  await t.test('5. Business and Admin accounts restricted from liking posts (403)', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const business = await createUser(ACCOUNT_TYPES.BUSINESS);
    const admin = await createUser(ACCOUNT_TYPES.ADMIN);
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Athirappilly waterfalls roar',
    });

    const bizRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${business.token}` },
    });
    assert.equal(bizRes.status, 403);
    assert.equal(bizRes.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');

    const adminRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(adminRes.status, 403);
    assert.equal(adminRes.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');
  });

  await t.test('6. Suspended and deactivated tourist accounts rejected (403)', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const suspended = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.SUSPENDED);
    const deactivated = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.DEACTIVATED);
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Silent Valley rainforest canopy',
    });

    const suspRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${suspended.token}` },
    });
    assert.equal(suspRes.status, 403);
    assert.equal(suspRes.body.error?.code, 'ACCOUNT_SUSPENDED');

    const deactRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${deactivated.token}` },
    });
    assert.equal(deactRes.status, 403);
    assert.equal(deactRes.body.error?.code, 'ACCOUNT_DEACTIVATED');
  });

  await t.test('7. Invalid post ID on like and unlike returns 400 VALIDATION_ERROR', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const likeRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts/not-an-objectid/likes',
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(likeRes.status, 400);
    assert.equal(likeRes.body.error?.code, 'VALIDATION_ERROR');

    const unlikeRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: '/api/v1/tourist/posts/12345/likes',
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(unlikeRes.status, 400);
    assert.equal(unlikeRes.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('8. Liking nonexistent post returns 404 RESOURCE_NOT_FOUND', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const missingId = new Types.ObjectId().toString();

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${missingId}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  await t.test('9. Liking REJECTED or REMOVED post rejected cleanly (404)', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const liker = await createUser(ACCOUNT_TYPES.TOURIST);
    const rejected = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Moderation rejected post',
      status: POST_STATUSES.REJECTED,
    });
    const removed = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Soft deleted post',
      status: POST_STATUSES.REMOVED,
      deletedAt: new Date(),
    });

    const rejRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${rejected._id}/likes`,
      headers: { authorization: `Bearer ${liker.token}` },
    });
    assert.equal(rejRes.status, 404);

    const remRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${removed._id}/likes`,
      headers: { authorization: `Bearer ${liker.token}` },
    });
    assert.equal(remRes.status, 404);
  });

  await t.test('10. Public visibility restrictions: liking PRIVATE, FOLLOWERS, or PENDING posts rejected (404)', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const other = await createUser(ACCOUNT_TYPES.TOURIST);
    const priv = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Private journal',
      visibility: POST_VISIBILITIES.PRIVATE,
    });
    const followers = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Followers post',
      visibility: POST_VISIBILITIES.FOLLOWERS,
    });
    const pending = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Pending moderation',
      status: POST_STATUSES.PENDING,
    });

    for (const post of [priv, followers, pending]) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/likes`,
        headers: { authorization: `Bearer ${other.token}` },
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
    }
  });

  await t.test('11. Concurrent duplicate like attempts and unauthorized unlike preserve exact likesCount', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const liker1 = await createUser(ACCOUNT_TYPES.TOURIST);
    const liker2 = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Theyyam festival in Kannur',
    });

    const results = await Promise.all([
      dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/likes`,
        headers: { authorization: `Bearer ${liker1.token}` },
      }),
      dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/likes`,
        headers: { authorization: `Bearer ${liker1.token}` },
      }),
      dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/likes`,
        headers: { authorization: `Bearer ${liker1.token}` },
      }),
    ]);

    const createdCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409).length;
    assert.equal(createdCount, 1);
    assert.equal(conflictCount, 2);
    assert.equal(post.likesCount, 1);

    // Liker2 cannot remove Liker1's like
    const otherUnlike = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${liker2.token}` },
    });
    assert.equal(otherUnlike.status, 404);
    assert.equal(post.likesCount, 1);
  });

  // ============================================================================
  // COMMENTS
  // ============================================================================
  await t.test('12. Successful comment creation derives authorId strictly from req.user.id and increments commentsCount', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const commenter = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Arjun',
      lastName: 'Menon',
    });
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Wayanad mist morning',
    });

    const res = await dispatchRequest<TestApiResponse<PostCommentDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${commenter.token}` },
      body: { content: 'Looks breathtaking at sunrise!' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data?.authorId, commenter.account._id.toString());
    assert.equal(res.body.data?.author?.displayName, 'Arjun Menon');
    assert.equal(res.body.data?.content, 'Looks breathtaking at sunrise!');
    assert.equal(res.body.data?.status, POST_COMMENT_STATUSES.ACTIVE);
    assert.equal(res.body.commentsCount, 1);
    assert.equal(post.commentsCount, 1);
  });

  await t.test('13. Empty or whitespace comment rejected with 400 VALIDATION_ERROR', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Periyar lake boat trip',
    });

    const empty = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: '   ' },
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('14. Comment exceeding 1000 characters rejected with 400 VALIDATION_ERROR', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Kovalam lighthouse view',
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'K'.repeat(1001) },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('15. Comment mass assignment (authorId, status, postId, parentCommentId) rejected (400)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const victimId = new Types.ObjectId().toString();
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Munroe Island canoeing',
    });

    for (const payload of [
      { content: 'Spoofed author', authorId: victimId },
      { content: 'Nested attempt', parentCommentId: new Types.ObjectId().toString() },
      { content: 'Status attempt', status: POST_COMMENT_STATUSES.REMOVED },
    ]) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/comments`,
        headers: { authorization: `Bearer ${tourist.token}` },
        body: payload,
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
    }
  });

  await t.test('16. Commenting on PRIVATE, PENDING, REJECTED, or REMOVED post rejected (404)', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const other = await createUser(ACCOUNT_TYPES.TOURIST);
    const priv = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Private diary',
      visibility: POST_VISIBILITIES.PRIVATE,
    });
    const rej = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Rejected note',
      status: POST_STATUSES.REJECTED,
    });
    const rem = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Removed note',
      status: POST_STATUSES.REMOVED,
      deletedAt: new Date(),
    });

    for (const p of [priv, rej, rem]) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${p._id}/comments`,
        headers: { authorization: `Bearer ${other.token}` },
        body: { content: 'Can I comment here?' },
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
    }
  });

  await t.test('17. Public comment listing returns active comments newest-first with safe author DTO and zero PII', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const commenter = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Lakshmi',
      lastName: 'Pillai',
    });
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Bekal Fort sunset',
    });

    const c1 = await engageRepo.createComment({
      postId: post._id,
      authorId: commenter.account._id,
      content: 'First comment',
    });
    c1.createdAt = new Date('2026-11-11T05:00:00Z');
    const c2 = await engageRepo.createComment({
      postId: post._id,
      authorId: commenter.account._id,
      content: 'Newest comment',
    });
    c2.createdAt = new Date('2026-11-11T06:00:00Z');

    const res = await dispatchRequest<TestApiResponse<PostCommentDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id}/comments`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data?.length, 2);
    assert.equal(res.body.data?.[0].content, 'Newest comment');
    assert.equal(res.body.data?.[1].content, 'First comment');
    assert.equal(res.body.data?.[0].author?.displayName, 'Lakshmi Pillai');
    const raw = JSON.stringify(res.body);
    assert.equal(raw.includes('email'), false);
    assert.equal(raw.includes('passwordHash'), false);
  });

  await t.test('18. Public comment listing supports accurate pagination', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Munnar tea garden trek',
    });

    for (let i = 1; i <= 5; i += 1) {
      const c = await engageRepo.createComment({
        postId: post._id,
        authorId: tourist.account._id,
        content: `Comment #${i}`,
      });
      c.createdAt = new Date(Date.now() + i * 1000);
    }

    const page1 = await dispatchRequest<TestApiResponse<PostCommentDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id}/comments?page=1&limit=2`,
    });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.data?.length, 2);
    assert.equal(page1.body.data?.[0].content, 'Comment #5');
    assert.equal(page1.body.pagination?.total, 5);
    assert.equal(page1.body.pagination?.totalPages, 3);

    const page3 = await dispatchRequest<TestApiResponse<PostCommentDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id}/comments?page=3&limit=2`,
    });
    assert.equal(page3.status, 200);
    assert.equal(page3.body.data?.length, 1);
    assert.equal(page3.body.data?.[0].content, 'Comment #1');
  });

  await t.test('19. Soft-deleted REMOVED comments are excluded from public comment listing', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Kuttanad paddy fields',
    });

    const active = await engageRepo.createComment({
      postId: post._id,
      authorId: tourist.account._id,
      content: 'Visible comment',
    });
    const deleted = await engageRepo.createComment({
      postId: post._id,
      authorId: tourist.account._id,
      content: 'Hidden deleted comment',
    });
    await engageRepo.softDeleteActiveComment(deleted._id);

    const res = await dispatchRequest<TestApiResponse<PostCommentDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id}/comments`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data?.length, 1);
    assert.equal(res.body.data?.[0].id, active._id.toString());
  });

  await t.test('20. Public comments endpoint conceals PRIVATE, REJECTED, and REMOVED posts with 404', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const priv = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Private story',
      visibility: POST_VISIBILITIES.PRIVATE,
    });
    await engageRepo.createComment({
      postId: priv._id,
      authorId: tourist.account._id,
      content: 'Should not leak',
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${priv._id}/comments`,
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  await t.test('21. Author can edit their own active comment (200 OK)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Padmanabhapuram Palace visit',
    });
    const comment = await engageRepo.createComment({
      postId: post._id,
      authorId: tourist.account._id,
      content: 'Original note',
    });

    const res = await dispatchRequest<TestApiResponse<PostCommentDto>>(app, {
      method: 'PATCH',
      url: `/api/v1/tourist/comments/${comment._id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Updated accurate note' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data?.content, 'Updated accurate note');

    const badMassAssign = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/tourist/comments/${comment._id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Trying spoof', authorId: new Types.ObjectId().toString() },
    });
    assert.equal(badMassAssign.status, 400);
  });

  await t.test("22. Editing another user's comment rejected with 404 RESOURCE_NOT_FOUND", async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: owner.account._id,
      content: 'Silent Valley bridge',
    });
    const comment = await engageRepo.createComment({
      postId: post._id,
      authorId: owner.account._id,
      content: 'Untouched comment',
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/tourist/comments/${comment._id}`,
      headers: { authorization: `Bearer ${attacker.token}` },
      body: { content: 'Defaced!' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
    assert.equal(comment.content, 'Untouched comment');
  });

  await t.test('23. Author can soft-delete their own comment and decrement commentsCount', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Poovar golden sands',
    });

    const created = await dispatchRequest<TestApiResponse<PostCommentDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Temporary comment' },
    });
    const commentId = created.body.data!.id;
    assert.equal(post.commentsCount, 1);

    const delRes = await dispatchRequest<TestApiResponse<{ status: string; commentsCount: number }>>(
      app,
      {
        method: 'DELETE',
        url: `/api/v1/tourist/comments/${commentId}`,
        headers: { authorization: `Bearer ${tourist.token}` },
      },
    );

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data?.status, POST_COMMENT_STATUSES.REMOVED);
    assert.equal(delRes.body.data?.commentsCount, 0);
    assert.equal(post.commentsCount, 0);
  });

  await t.test("24. Deleting another user's comment rejected with 404 RESOURCE_NOT_FOUND", async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: owner.account._id,
      content: 'Thekkady spice walk',
      commentsCount: 1,
    });
    const comment = await engageRepo.createComment({
      postId: post._id,
      authorId: owner.account._id,
      content: 'Protected comment',
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/comments/${comment._id}`,
      headers: { authorization: `Bearer ${attacker.token}` },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
    assert.equal(comment.status, POST_COMMENT_STATUSES.ACTIVE);
    assert.equal(post.commentsCount, 1);
  });

  await t.test('25. Invalid commentId (400) and unauthenticated comment mutations (401) rejected', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const badPatch = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/comments/bad-id',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Valid text' },
    });
    assert.equal(badPatch.status, 400);
    assert.equal(badPatch.body.error?.code, 'VALIDATION_ERROR');

    const unauthDel = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/comments/${new Types.ObjectId().toString()}`,
    });
    assert.equal(unauthDel.status, 401);
  });

  // ============================================================================
  // REPOSTS
  // ============================================================================
  await t.test('26. Successful repost creates reference record without duplicating post content or media', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const sharer = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Vagamon pine forest trail',
    });

    const res = await dispatchRequest<TestApiResponse<PostRepostResponseDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${sharer.token}` },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data?.reposted, true);
    assert.equal(res.body.data?.repostsCount, 1);
    assert.equal(res.body.data?.repost?.accountId, sharer.account._id.toString());
    assert.equal(res.body.data?.repost?.originalPostId, post._id.toString());
    assert.equal(postsRepo.posts.size, 1, 'Repost must not duplicate Post documents');
  });

  await t.test('27. Duplicate repost prevention rejects repeat attempt with 409', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Marari beach palms',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    const dup = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    assert.equal(dup.status, 409);
    assert.equal(dup.body.error?.code, 'CONFLICT');
    assert.equal(post.repostsCount, 1);
  });

  await t.test('28. Successful unrepost deletes caller repost and decrements repostsCount', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Gavi ecotourism drive',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    const delRes = await dispatchRequest<TestApiResponse<PostRepostResponseDto>>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data?.reposted, false);
    assert.equal(delRes.body.data?.repostsCount, 0);
    assert.equal(post.repostsCount, 0);
  });

  await t.test('29. Reposting PRIVATE or FOLLOWERS post rejected with 404', async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const other = await createUser(ACCOUNT_TYPES.TOURIST);
    const priv = await postsRepo.seedPost({
      authorId: owner.account._id,
      content: 'Private memories',
      visibility: POST_VISIBILITIES.PRIVATE,
    });
    const fol = await postsRepo.seedPost({
      authorId: owner.account._id,
      content: 'Followers only memories',
      visibility: POST_VISIBILITIES.FOLLOWERS,
    });

    for (const p of [priv, fol]) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${p._id}/reposts`,
        headers: { authorization: `Bearer ${other.token}` },
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
    }
  });

  await t.test('30. Reposting REMOVED post rejected with 404', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const removed = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Deleted post',
      status: POST_STATUSES.REMOVED,
      deletedAt: new Date(),
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${removed._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(res.status, 404);
  });

  await t.test('31. Reposting unpublished (PENDING or REJECTED) post rejected with 404', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const pending = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Pending moderation post',
      status: POST_STATUSES.PENDING,
    });
    const rejected = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Rejected post',
      status: POST_STATUSES.REJECTED,
    });

    for (const p of [pending, rejected]) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${p._id}/reposts`,
        headers: { authorization: `Bearer ${tourist.token}` },
      });
      assert.equal(res.status, 404);
    }
  });

  await t.test("32. Repost ownership protection blocks removing another user's repost (404)", async () => {
    const sharer = await createUser(ACCOUNT_TYPES.TOURIST);
    const intruder = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: sharer.account._id,
      content: 'Kakkayam Dam valley',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${sharer.token}` },
    });

    const intruderDelete = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${intruder.token}` },
    });

    assert.equal(intruderDelete.status, 404);
    assert.equal(post.repostsCount, 1);
  });

  await t.test('33. Concurrent duplicate repost attempts permit only one repost and preserve repostsCount = 1', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Illikkal Kallu peak',
    });

    const responses = await Promise.all([
      dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/reposts`,
        headers: { authorization: `Bearer ${tourist.token}` },
      }),
      dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/reposts`,
        headers: { authorization: `Bearer ${tourist.token}` },
      }),
      dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/reposts`,
        headers: { authorization: `Bearer ${tourist.token}` },
      }),
    ]);

    assert.equal(responses.filter((r) => r.status === 201).length, 1);
    assert.equal(responses.filter((r) => r.status === 409).length, 2);
    assert.equal(post.repostsCount, 1);
  });

  // ============================================================================
  // ENGAGEMENT COUNTS, ROLLBACK, RATE LIMITING & SCHEMAS
  // ============================================================================
  await t.test('34. Post feed and detail reflect accurate counts and reject client-submitted counts', async () => {
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const t2 = await createUser(ACCOUNT_TYPES.TOURIST);

    const injectedPost = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${author.token}` },
      body: { content: 'Injected counts test', likesCount: 999 },
    });
    assert.equal(injectedPost.status, 400);

    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Kumarakom bird sanctuary',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${author.token}` },
    });
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${t2.token}` },
    });
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${t2.token}` },
      body: { content: 'Saw kingfishers today!' },
    });
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${t2.token}` },
    });

    const detail = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id}`,
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data?.likesCount, 2);
    assert.equal(detail.body.data?.commentsCount, 1);
    assert.equal(detail.body.data?.repostsCount, 1);

    const feed = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(feed.status, 200);
    assert.equal(feed.body.data?.[0].likesCount, 2);
    assert.equal(feed.body.data?.[0].commentsCount, 1);
    assert.equal(feed.body.data?.[0].repostsCount, 1);
  });

  await t.test('35. Counts remain consistent after deletion and unaffected by duplicate requests', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Ashtamudi lake kayak',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    const commentRes = await dispatchRequest<TestApiResponse<PostCommentDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Peaceful waters' },
    });
    await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/comments/${commentRes.body.data!.id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    assert.equal(post.likesCount, 0);
    assert.equal(post.commentsCount, 0);
  });

  await t.test('36. Engagement counts never become negative under extra unlike, comment delete, or unrepost attempts', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Zero floor guard post',
    });

    const unlikeMissing = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(unlikeMissing.status, 404);
    assert.equal(post.likesCount, 0);

    const unrepostMissing = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(unrepostMissing.status, 404);
    assert.equal(post.repostsCount, 0);

    const commentRes = await dispatchRequest<TestApiResponse<PostCommentDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Delete twice guard' },
    });
    const cId = commentRes.body.data!.id;

    await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/comments/${cId}`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    const secondDelete = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/comments/${cId}`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(secondDelete.status, 404);
    assert.equal(post.commentsCount, 0);
  });

  await t.test('37. Failed counter update rolls back transaction without corrupting counts or leaving orphans', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: tourist.account._id,
      content: 'Transaction rollback verification',
    });

    engageRepo.failNextCounterAdjustment = true;
    const likeFail = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(likeFail.status, 500);
    assert.equal(engageRepo.likes.size, 0);
    assert.equal(post.likesCount, 0);

    engageRepo.failNextCounterAdjustment = true;
    const commentFail = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Should roll back' },
    });
    assert.equal(commentFail.status, 500);
    assert.equal(engageRepo.comments.size, 0);
    assert.equal(post.commentsCount, 0);

    engageRepo.failNextCounterAdjustment = true;
    const repostFail = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(repostFail.status, 500);
    assert.equal(engageRepo.reposts.size, 0);
    assert.equal(post.repostsCount, 0);
  });

  await t.test('38. Rate limiting blocks excessive engagement calls (429) and schemas define expected indexes', async () => {
    resetRateLimiter();
    const author = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedPost({
      authorId: author.account._id,
      content: 'Rate limiter verification spot',
    });

    let triggered429 = false;
    for (let i = 0; i < 65; i += 1) {
      const commenter = await createUser(ACCOUNT_TYPES.TOURIST);
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: `/api/v1/tourist/posts/${post._id}/comments`,
        headers: { authorization: `Bearer ${commenter.token}` },
        body: { content: `Burst comment ${i + 1}` },
      });
      if (res.status === 429) {
        triggered429 = true;
        assert.equal(res.body.error?.code, 'TOO_MANY_REQUESTS');
        break;
      }
      assert.equal(res.status, 201);
    }
    assert.equal(triggered429, true);

    const likeIndex = PostLikeModel.schema
      .indexes()
      .find(([, opts]) => opts?.name === 'idx_post_likes_unique');
    assert.ok(likeIndex && likeIndex[1]?.unique === true, 'Missing unique idx_post_likes_unique');

    const commentIndex = PostCommentModel.schema
      .indexes()
      .find(([, opts]) => opts?.name === 'idx_post_comments_public');
    assert.ok(commentIndex, 'Missing idx_post_comments_public');

    const repostIndex = PostRepostModel.schema
      .indexes()
      .find(([, opts]) => opts?.name === 'idx_post_reposts_unique');
    assert.ok(
      repostIndex && repostIndex[1]?.unique === true,
      'Missing unique idx_post_reposts_unique',
    );

    const negativePost = new PostModel({
      authorId: new Types.ObjectId(),
      content: 'Negative counter guard test',
      likesCount: -1,
    });
    const syncErr = negativePost.validateSync();
    assert.ok(syncErr?.errors.likesCount, 'Schema must forbid negative likesCount');
  });
});
