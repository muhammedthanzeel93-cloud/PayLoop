import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { jwtService } from '../shared/security/jwt.service';
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
import { PostsRepository } from '../modules/posts/post.repository';
import { postsService } from '../modules/posts/post.service';
import { PostModel } from '../modules/posts/post.model';
import {
  CreatePostPersistenceInput,
  FindAuthorPostsOptions,
  FindPublicFeedOptions,
  UpdatePostPersistenceInput,
} from '../modules/posts/post.types';
import {
  IAccountDocument,
  IAdminProfileDocument,
  IBusinessProfileDocument,
  IDestinationDocument,
  IMediaDocument,
  IPostDocument,
  ITouristProfileDocument,
} from '../shared/models';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  BUSINESS_TYPES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  MEDIA_RULES,
  POST_STATUSES,
  POST_VISIBILITIES,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import {
  AccountStatus,
  AccountType,
  PostDto,
  PostStatus,
  PostVisibility,
} from '@kerala-tourism/shared-types';

interface TestApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
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

class InMemoryAuthRepository extends AuthRepository {
  public accountsById: Map<string, IAccountDocument> = new Map();
  public touristProfiles: Map<string, ITouristProfileDocument> = new Map();
  public businessProfiles: Map<string, IBusinessProfileDocument> = new Map();
  public adminProfiles: Map<string, IAdminProfileDocument> = new Map();

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
      profileImage: 'https://cdn.keralatourism.org/avatars/traveler.jpg',
      preferredLanguage: 'EN',
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
      displayName: 'Moderation Officer',
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

class InMemoryMediaRepository extends MediaRepository {
  public mediaMap: Map<string, IMediaDocument> = new Map();

  public override async createMedia(data: Partial<IMediaDocument>): Promise<IMediaDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      uploaderAccountId: data.uploaderAccountId!,
      destinationId: data.destinationId,
      storageKey: data.storageKey || `general/${id.toString()}-photo.jpg`,
      url: data.url || `https://cdn.keralatourism.org/media/general/${id.toString()}-photo.jpg`,
      mimeType: data.mimeType || MEDIA_RULES.ALLOWED_MIME_TYPES[0],
      fileSizeBytes: data.fileSizeBytes ?? 204800,
      dimensions: data.dimensions || { width: 1200, height: 800 },
      isPrimary: Boolean(data.isPrimary),
      displayOrder: data.displayOrder ?? 0,
      isModerated: data.isModerated !== undefined ? data.isModerated : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IMediaDocument;
    this.mediaMap.set(id.toString(), doc);
    return doc;
  }

  public override async findById(id: string | Types.ObjectId): Promise<IMediaDocument | null> {
    return this.mediaMap.get(id.toString()) || null;
  }

  public override async findByIds(ids: (string | Types.ObjectId)[]): Promise<IMediaDocument[]> {
    const results: IMediaDocument[] = [];
    for (const id of ids) {
      const found = this.mediaMap.get(id.toString());
      if (found) results.push(found);
    }
    return results;
  }
}

class InMemoryDestinationsRepository extends DestinationsRepository {
  public destinations: Map<string, IDestinationDocument> = new Map();

  public override async createDestination(
    data: Partial<IDestinationDocument>,
  ): Promise<IDestinationDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      name: data.name || 'Alleppey Backwaters',
      slug: data.slug || `dest-${id.toString().slice(-6)}`,
      description: data.description || 'Scenic serene backwaters in Alappuzha, Kerala.',
      shortDescription: data.shortDescription,
      categoryIds: data.categoryIds || [],
      location: data.location || { type: 'Point', coordinates: [76.3388, 9.4981] },
      address: data.address || 'Alappuzha, Kerala',
      district: data.district || 'Alappuzha',
      locality: data.locality || 'Kuttanad',
      images: data.images || ['https://cdn.keralatourism.org/destinations/alleppey.webp'],
      facilities: data.facilities || ['Houseboat', 'Parking'],
      verificationStatus: data.verificationStatus || DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: data.publicationStatus || DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdBy: data.createdBy || new Types.ObjectId(),
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
    const results: IDestinationDocument[] = [];
    for (const id of ids) {
      const found = this.destinations.get(id.toString());
      if (found) results.push(found);
    }
    return results;
  }
}

class InMemoryPostsRepository extends PostsRepository {
  public posts: Map<string, IPostDocument> = new Map();

  constructor(private readonly authStore: InMemoryAuthRepository) {
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
      publishedAt: data.publishedAt ?? null,
      deletedAt: data.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as IPostDocument;
    this.posts.set(id.toString(), doc);
    return doc;
  }

  public async seedRawPost(overrides: {
    authorId: Types.ObjectId;
    content: string;
    mediaIds?: Types.ObjectId[];
    destinationId?: Types.ObjectId | null;
    visibility?: PostVisibility;
    status?: PostStatus;
    publishedAt?: Date | null;
    deletedAt?: Date | null;
    createdAt?: Date;
  }): Promise<IPostDocument> {
    const id = new Types.ObjectId();
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
      publishedAt: overrides.publishedAt !== undefined ? overrides.publishedAt : createdAt,
      deletedAt: overrides.deletedAt ?? null,
      createdAt,
      updatedAt: createdAt,
    } as unknown as IPostDocument;
    this.posts.set(id.toString(), doc);
    return doc;
  }

  public override async findById(
    id: string | Types.ObjectId,
    includeDeleted = false,
  ): Promise<IPostDocument | null> {
    const found = this.posts.get(id.toString());
    if (!found) return null;
    if (!includeDeleted && (found.deletedAt !== null || found.status === POST_STATUSES.REMOVED)) {
      return null;
    }
    return found;
  }

  public override async findPublicPostById(
    id: string | Types.ObjectId,
  ): Promise<IPostDocument | null> {
    const found = this.posts.get(id.toString());
    if (
      !found ||
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
    let list = Array.from(this.posts.values()).filter(
      (p) =>
        p.visibility === POST_VISIBILITIES.PUBLIC &&
        p.status === POST_STATUSES.PUBLISHED &&
        p.deletedAt === null,
    );

    if (options.destinationId) {
      list = list.filter(
        (p) => p.destinationId && p.destinationId.toString() === options.destinationId,
      );
    }

    list.sort((a, b) => {
      const timeDiff =
        (b.publishedAt ? b.publishedAt.getTime() : 0) -
        (a.publishedAt ? a.publishedAt.getTime() : 0);
      if (timeDiff !== 0) return timeDiff;
      return b._id.toString().localeCompare(a._id.toString());
    });

    const total = list.length;
    const start = (options.page - 1) * options.limit;
    const items = list.slice(start, start + options.limit);
    return { items, total };
  }

  public override async findByAuthor(
    authorId: string | Types.ObjectId,
    options: FindAuthorPostsOptions,
  ): Promise<{ items: IPostDocument[]; total: number }> {
    let list = Array.from(this.posts.values()).filter(
      (p) =>
        p.authorId.toString() === authorId.toString() &&
        p.deletedAt === null &&
        p.status !== POST_STATUSES.REMOVED,
    );

    if (options.visibility) {
      list = list.filter((p) => p.visibility === options.visibility);
    }
    if (options.status) {
      list = list.filter((p) => p.status === options.status);
    }

    list.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b._id.toString().localeCompare(a._id.toString());
    });

    const total = list.length;
    const start = (options.page - 1) * options.limit;
    return { items: list.slice(start, start + options.limit), total };
  }

  public override async updatePost(
    id: string | Types.ObjectId,
    updates: UpdatePostPersistenceInput,
  ): Promise<IPostDocument | null> {
    const existing = await this.findById(id, false);
    if (!existing) return null;
    Object.assign(existing, updates, { updatedAt: new Date() });
    return existing;
  }

  public override async softDeletePost(
    id: string | Types.ObjectId,
  ): Promise<IPostDocument | null> {
    const existing = await this.findById(id, false);
    if (!existing) return null;
    existing.status = POST_STATUSES.REMOVED;
    existing.deletedAt = new Date();
    existing.updatedAt = new Date();
    return existing;
  }

  public override async findTouristProfilesByAccountIds(
    accountIds: string[],
  ): Promise<ITouristProfileDocument[]> {
    const results: ITouristProfileDocument[] = [];
    for (const accId of accountIds) {
      const prof = this.authStore.touristProfiles.get(accId);
      if (prof) results.push(prof);
    }
    return results;
  }
}

const app = createApp();
let authRepo: InMemoryAuthRepository;
let mediaRepo: InMemoryMediaRepository;
let destRepo: InMemoryDestinationsRepository;
let postsRepo: InMemoryPostsRepository;

beforeEach(() => {
  resetRateLimiter();
  authRepo = new InMemoryAuthRepository();
  mediaRepo = new InMemoryMediaRepository();
  destRepo = new InMemoryDestinationsRepository();
  postsRepo = new InMemoryPostsRepository(authRepo);

  authMiddleware.setRepository(authRepo);
  authorizationMiddleware.setRepository(authRepo);
  postsService.setRepository(postsRepo);
  postsService.setMediaRepository(mediaRepo);
  postsService.setDestinationsRepository(destRepo);
  postsService.setAuthRepository(authRepo);
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
      firstName: name.firstName || 'Meera',
      lastName: name.lastName || 'Krishnan',
    });
  } else if (accountType === ACCOUNT_TYPES.BUSINESS) {
    await authRepo.createBusinessProfile({
      accountId: account._id,
      businessName: 'Backwater Cruises',
      businessType: BUSINESS_TYPES.TRAVEL_AGENCY,
      contactNumber: '+919847011111',
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

test('Day 13 — Social Feed Architecture & Post Management Suite', async (t) => {
  await t.test('1. Successful tourist post creation with server-derived authorId', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Golden hour at Fort Kochi Chinese fishing nets!' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data?.authorId, tourist.account._id.toString());
    assert.equal(res.body.data?.author?.displayName, 'Meera Krishnan');
    assert.equal(res.body.data?.visibility, POST_VISIBILITIES.PUBLIC);
    assert.equal(res.body.data?.status, POST_STATUSES.PUBLISHED);
    assert.ok(res.body.data?.publishedAt);
  });

  await t.test('2. Unauthenticated post creation rejected with 401', async () => {
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      body: { content: 'Attempting unauthenticated post' },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  await t.test('3. Business account post creation rejected with 403', async () => {
    const biz = await createUser(ACCOUNT_TYPES.BUSINESS);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${biz.token}` },
      body: { content: 'Commercial promotion disguised as tourist story' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');
  });

  await t.test('4. Suspended account post creation rejected with 403', async () => {
    const suspended = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.SUSPENDED);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${suspended.token}` },
      body: { content: 'Suspended account trying to post' },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'ACCOUNT_SUSPENDED');
  });

  await t.test('5. Missing or empty content fails Zod validation (400)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const emptyRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: '    ' },
    });
    assert.equal(emptyRes.status, 400);
    assert.equal(emptyRes.body.error?.code, 'VALIDATION_ERROR');

    const missingRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {},
    });
    assert.equal(missingRes.status, 400);
    assert.equal(missingRes.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('6. Invalid visibility value rejected (400)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Valid content', visibility: 'FRIENDS_ONLY' },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('7. Client status injection rejected by strict Zod schema (400)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Trying to tamper status', status: POST_STATUSES.PENDING },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('8. Client-supplied authorId rejected (400)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const victimId = new Types.ObjectId().toString();

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Trying to impersonate author', authorId: victimId },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('9. Successful text-only post creation (empty mediaIds)', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Misty morning walk through Munnar tea estates.' },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data?.mediaIds, []);
    assert.deepEqual(res.body.data?.media, []);
  });

  await t.test('10. Successful image-associated post with safe media DTO projection', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const media = await mediaRepo.createMedia({
      uploaderAccountId: tourist.account._id,
      storageKey: 'general/munnar-mist-123.webp',
      url: 'https://cdn.keralatourism.org/media/general/munnar-mist-123.webp',
      mimeType: 'image/webp',
      fileSizeBytes: 512000,
      isModerated: true,
    });

    const res = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Tea plantation views in Idukki',
        mediaIds: [media._id.toString()],
      },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data?.mediaIds, [media._id.toString()]);
    assert.equal(res.body.data?.media.length, 1);
    assert.equal(
      res.body.data?.media[0].url,
      'https://cdn.keralatourism.org/media/general/munnar-mist-123.webp',
    );
    const rawJson = JSON.stringify(res.body);
    assert.equal(rawJson.includes('storageKey'), false, 'Internal storageKey must not be exposed');
  });

  await t.test('11. Invalid or ineligible media references rejected', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const nonexistentMediaId = new Types.ObjectId().toString();

    const missingRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Post with missing media', mediaIds: [nonexistentMediaId] },
    });
    assert.equal(missingRes.status, 404);
    assert.equal(missingRes.body.error?.code, 'MEDIA_NOT_FOUND');

    const malformedRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Post with bad media ID', mediaIds: ['not-an-objectid'] },
    });
    assert.equal(malformedRes.status, 400);

    const unmoderatedMedia = await mediaRepo.createMedia({
      uploaderAccountId: tourist.account._id,
      isModerated: false,
    });
    const unmodRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Unmoderated image', mediaIds: [unmoderatedMedia._id.toString()] },
    });
    assert.equal(unmodRes.status, 400);

    const oversizedMedia = await mediaRepo.createMedia({
      uploaderAccountId: tourist.account._id,
      fileSizeBytes: MEDIA_RULES.MAX_FILE_SIZE_BYTES + 1024,
      isModerated: true,
    });
    const sizeRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Oversized image', mediaIds: [oversizedMedia._id.toString()] },
    });
    assert.equal(sizeRes.status, 400);
  });

  await t.test('12. Unauthorized media association rejected (owned by another user)', async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createUser(ACCOUNT_TYPES.TOURIST);
    const ownersMedia = await mediaRepo.createMedia({
      uploaderAccountId: owner.account._id,
      isModerated: true,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${attacker.token}` },
      body: {
        content: 'Stealing someone else uploaded photo',
        mediaIds: [ownersMedia._id.toString()],
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'UNAUTHORIZED_MEDIA_ACCESS');
  });

  await t.test('13. Invalid destination reference rejected', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const notFoundRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Visiting mystery spot',
        destinationId: new Types.ObjectId().toString(),
      },
    });
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.error?.code, 'DESTINATION_NOT_FOUND');

    const badFormatRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Visiting invalid ID spot',
        destinationId: 'bad-dest-id',
      },
    });
    assert.equal(badFormatRes.status, 400);
    assert.equal(badFormatRes.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('14. Unpublished or unverified destination association rejected', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const draftDest = await destRepo.createDestination({
      name: 'Secret Draft Waterfall',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Tagging draft destination',
        destinationId: draftDest._id.toString(),
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');

    // Verified+published destination succeeds and populates canonical destination metadata
    const validDest = await destRepo.createDestination({
      name: 'Athirappilly Falls',
      slug: 'athirappilly-falls',
      district: 'Thrissur',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    });
    const okRes = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'At Athirappilly Falls today!',
        destinationId: validDest._id.toString(),
      },
    });
    assert.equal(okRes.status, 201);
    assert.equal(okRes.body.data?.destination?.name, 'Athirappilly Falls');
    assert.equal(okRes.body.data?.destination?.district, 'Thrissur');
  });

  await t.test('15. Public feed returns published public posts without leaking PII', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.ACTIVE, {
      firstName: 'Ananya',
      lastName: 'Nair',
    });

    await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Kayaking in Kumarakom',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data?.length, 1);
    assert.equal(res.body.data?.[0].content, 'Kayaking in Kumarakom');
    assert.equal(res.body.data?.[0].author?.displayName, 'Ananya Nair');

    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(tourist.account.email), false, 'Email must never leak');
    assert.equal(serialized.includes('passwordHash'), false, 'Password hash must never leak');
  });

  await t.test('16. Public feed and public detail exclude PRIVATE and FOLLOWERS posts', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const privPost = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Private journal entry',
      visibility: POST_VISIBILITIES.PRIVATE,
      status: POST_STATUSES.PUBLISHED,
    });
    const followersPost = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Followers only update',
      visibility: POST_VISIBILITIES.FOLLOWERS,
      status: POST_STATUSES.PUBLISHED,
    });

    const feedRes = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(feedRes.status, 200);
    assert.equal(feedRes.body.data?.length, 0);

    const privDetailRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${privPost._id}`,
    });
    assert.equal(privDetailRes.status, 404);
    assert.equal(privDetailRes.body.error?.code, 'RESOURCE_NOT_FOUND');

    const followDetailRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${followersPost._id}`,
    });
    assert.equal(followDetailRes.status, 404);
  });

  await t.test('17. Public feed and public detail exclude REJECTED posts', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const rejected = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Moderated rejected post',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.REJECTED,
    });

    const feedRes = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(feedRes.status, 200);
    assert.equal(feedRes.body.data?.length, 0);

    const detailRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${rejected._id}`,
    });
    assert.equal(detailRes.status, 404);
  });

  await t.test('18. Public feed and public detail exclude REMOVED posts', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const removed = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Soft deleted post',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.REMOVED,
      deletedAt: new Date(),
    });

    const feedRes = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(feedRes.status, 200);
    assert.equal(feedRes.body.data?.length, 0);

    const detailRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${removed._id}`,
    });
    assert.equal(detailRes.status, 404);
  });

  await t.test('19. Tourist can retrieve their own posts including PRIVATE posts', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const privPost = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'My personal private notes from Wayanad',
      visibility: POST_VISIBILITIES.PRIVATE,
      status: POST_STATUSES.PUBLISHED,
    });

    const listRes = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data?.length, 1);
    assert.equal(listRes.body.data?.[0].id, privPost._id.toString());

    const detailRes = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'GET',
      url: `/api/v1/tourist/posts/${privPost._id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data?.content, 'My personal private notes from Wayanad');
  });

  await t.test('20. Tourist cannot retrieve another user private post (404 BOLA concealment)', async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const otherTourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const privPost = await postsRepo.seedRawPost({
      authorId: owner.account._id,
      content: 'Strictly confidential draft',
      visibility: POST_VISIBILITIES.PRIVATE,
      status: POST_STATUSES.PUBLISHED,
    });

    const touristEndpointRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/tourist/posts/${privPost._id}`,
      headers: { authorization: `Bearer ${otherTourist.token}` },
    });
    assert.equal(touristEndpointRes.status, 404);
    assert.equal(touristEndpointRes.body.error?.code, 'RESOURCE_NOT_FOUND');

    const publicEndpointRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${privPost._id}`,
    });
    assert.equal(publicEndpointRes.status, 404);
  });

  await t.test('21. Tourist can update their own post', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Initial Varkala cliff photo text',
      visibility: POST_VISIBILITIES.PRIVATE,
      status: POST_STATUSES.PUBLISHED,
    });

    const updateRes = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'PATCH',
      url: `/api/v1/tourist/posts/${post._id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Updated Varkala sunset story!',
        visibility: POST_VISIBILITIES.PUBLIC,
      },
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data?.content, 'Updated Varkala sunset story!');
    assert.equal(updateRes.body.data?.visibility, POST_VISIBILITIES.PUBLIC);
  });

  await t.test("22. Tourist cannot update another user's post (404 RESOURCE_NOT_FOUND)", async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedRawPost({
      authorId: owner.account._id,
      content: 'Untouched Bekal Fort caption',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/tourist/posts/${post._id}`,
      headers: { authorization: `Bearer ${attacker.token}` },
      body: { content: 'Defaced content' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');

    const persisted = await postsRepo.findById(post._id);
    assert.equal(persisted?.content, 'Untouched Bekal Fort caption');
  });

  await t.test('23. Tourist can soft-delete their own post and it leaves feeds', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Post to be removed',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
    });

    const delRes = await dispatchRequest<TestApiResponse<{ id: string; status: string }>>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data?.status, POST_STATUSES.REMOVED);

    const rawStored = await postsRepo.findById(post._id, true);
    assert.equal(rawStored?.status, POST_STATUSES.REMOVED);
    assert.ok(rawStored?.deletedAt);

    const feedRes = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(feedRes.body.data?.length, 0);

    const ownListRes = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(ownListRes.body.data?.length, 0);
  });

  await t.test("24. Tourist cannot delete another user's post (404 RESOURCE_NOT_FOUND)", async () => {
    const owner = await createUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createUser(ACCOUNT_TYPES.TOURIST);
    const post = await postsRepo.seedRawPost({
      authorId: owner.account._id,
      content: 'Protected Wayanad trek memory',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}`,
      headers: { authorization: `Bearer ${attacker.token}` },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');

    const persisted = await postsRepo.findById(post._id);
    assert.ok(persisted);
    assert.equal(persisted?.status, POST_STATUSES.PUBLISHED);
  });

  await t.test('25. Pagination returns accurate pages and totals', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const baseTime = Date.now();
    for (let i = 1; i <= 5; i += 1) {
      await postsRepo.seedRawPost({
        authorId: tourist.account._id,
        content: `Post #${i}`,
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date(baseTime + i * 1000),
      });
    }

    const page1 = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts?page=1&limit=2',
    });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.data?.length, 2);
    assert.equal(page1.body.pagination?.total, 5);
    assert.equal(page1.body.pagination?.totalPages, 3);

    const page2 = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts?page=2&limit=2',
    });
    assert.equal(page2.status, 200);
    assert.equal(page2.body.data?.length, 2);
    assert.notEqual(page1.body.data?.[0].id, page2.body.data?.[0].id);

    const page3 = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts?page=3&limit=2',
    });
    assert.equal(page3.status, 200);
    assert.equal(page3.body.data?.length, 1);
  });

  await t.test('26. Feed sorts strictly newest-first by publishedAt', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Oldest post',
      publishedAt: new Date('2026-11-01T10:00:00Z'),
    });
    await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Middle post',
      publishedAt: new Date('2026-11-05T10:00:00Z'),
    });
    await postsRepo.seedRawPost({
      authorId: tourist.account._id,
      content: 'Newest post',
      publishedAt: new Date('2026-11-10T10:00:00Z'),
    });

    const res = await dispatchRequest<TestApiResponse<PostDto[]>>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data?.map((p) => p.content),
      ['Newest post', 'Middle post', 'Oldest post'],
    );
  });

  await t.test('27. Invalid post ID returns safe 400/404 without stack trace leaks', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const badPublicId = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/posts/not-a-valid-object-id',
    });
    assert.equal(badPublicId.status, 400);
    assert.equal(badPublicId.body.error?.code, 'VALIDATION_ERROR');

    const badTouristId = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/posts/xyz-123',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Valid content' },
    });
    assert.equal(badTouristId.status, 400);
    assert.equal(badTouristId.body.error?.code, 'VALIDATION_ERROR');

    const nonexistentRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/posts/${new Types.ObjectId().toString()}`,
    });
    assert.equal(nonexistentRes.status, 404);
    assert.equal(nonexistentRes.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  await t.test('28. Unexpected request body and query fields are strictly rejected', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    const unexpectedBody = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Legit content',
        likesCount: 99999,
      },
    });
    assert.equal(unexpectedBody.status, 400);
    assert.equal(unexpectedBody.body.error?.code, 'VALIDATION_ERROR');

    const unexpectedQuery = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/posts?status=REJECTED',
    });
    assert.equal(unexpectedQuery.status, 400);
    assert.equal(unexpectedQuery.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('29. Duplicate media references are deduplicated cleanly preserving order', async () => {
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);
    const m1 = await mediaRepo.createMedia({
      uploaderAccountId: tourist.account._id,
      isModerated: true,
    });
    const m2 = await mediaRepo.createMedia({
      uploaderAccountId: tourist.account._id,
      isModerated: true,
    });

    const res = await dispatchRequest<TestApiResponse<PostDto>>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${tourist.token}` },
      body: {
        content: 'Duplicate media array cleanup check',
        mediaIds: [m1._id.toString(), m1._id.toString(), m2._id.toString(), m1._id.toString()],
      },
    });

    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data?.mediaIds, [m1._id.toString(), m2._id.toString()]);
    assert.equal(res.body.data?.media.length, 2);
  });

  await t.test('30. Rate limiting blocks excessive post creation requests (429)', async () => {
    resetRateLimiter();
    const tourist = await createUser(ACCOUNT_TYPES.TOURIST);

    let hitRateLimit = false;
    for (let i = 0; i < 25; i += 1) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/posts',
        headers: { authorization: `Bearer ${tourist.token}` },
        body: { content: `Rapid post ${i + 1}` },
      });

      if (res.status === 429) {
        hitRateLimit = true;
        assert.equal(res.body.error?.code, 'TOO_MANY_REQUESTS');
        assert.ok(res.headers['retry-after']);
        assert.ok(res.headers['ratelimit-limit']);
        break;
      }

      assert.equal(res.status, 201);
    }

    assert.equal(hitRateLimit, true, 'Rapid post creation must trigger HTTP 429 Rate Limit');
  });

  await t.test('31. Deactivated tourist and Admin accounts cannot create tourist posts (403)', async () => {
    const deactivated = await createUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.DEACTIVATED);
    const admin = await createUser(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE);

    const deactRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${deactivated.token}` },
      body: { content: 'Deactivated tourist post attempt' },
    });
    assert.equal(deactRes.status, 403);
    assert.equal(deactRes.body.error?.code, 'ACCOUNT_DEACTIVATED');

    const adminRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { content: 'Admin trying tourist route' },
    });
    assert.equal(adminRes.status, 403);
    assert.equal(adminRes.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');
  });

  await t.test('32. PostModel schema defines expected ESR indexes and validation limits', () => {
    const indexes = PostModel.schema.indexes();
    const indexNames = indexes.map(([, opts]) => opts?.name);

    assert.ok(indexNames.includes('idx_public_feed'), 'Missing idx_public_feed');
    assert.ok(indexNames.includes('idx_author_posts'), 'Missing idx_author_posts');
    assert.ok(indexNames.includes('idx_destination_posts'), 'Missing idx_destination_posts');
    assert.ok(indexNames.includes('idx_moderation_queue'), 'Missing idx_moderation_queue');

    const invalidDoc = new PostModel({
      authorId: new Types.ObjectId(),
      content: 'Test doc with duplicate media',
      mediaIds: [new Types.ObjectId('66e04d3e89a4b2c1d8e1f001'), new Types.ObjectId('66e04d3e89a4b2c1d8e1f001')],
    });
    const syncErr = invalidDoc.validateSync();
    assert.ok(syncErr?.errors.mediaIds, 'Schema must prevent duplicate mediaIds at persistence layer');
  });
});
