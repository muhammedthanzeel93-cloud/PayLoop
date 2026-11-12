import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { jwtService } from '../shared/security/jwt.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { authorizationController } from '../modules/authorization/authorization.controller';
import { postsService } from '../modules/posts/post.service';
import { PostsRepository } from '../modules/posts/post.repository';
import { CreatePostPersistenceInput, UpdatePostPersistenceInput } from '../modules/posts/post.types';
import { POST_STATUSES, POST_VISIBILITIES } from '@kerala-tourism/constants';
import {
  AuthRepository,
  CreateAccountInput,
  CreateTouristProfileInput,
  CreateBusinessProfileInput,
} from '../modules/auth/auth.repository';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  BUSINESS_TYPES,
  VERIFICATION_STATUSES,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
} from '@kerala-tourism/constants';
import {
  IAccountDocument,
  ITouristProfileDocument,
  IBusinessProfileDocument,
  IAdminProfileDocument,
  IPropertyDocument,
  ITourPackageDocument,
  IPostDocument,
  IBookingDocument,
} from '../shared/models';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { Types } from 'mongoose';
import {
  AccountType,
  AccountStatus,
  VerificationStatus,
  AdminPermission,
} from '@kerala-tourism/shared-types';

interface TestApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
}

/**
 * High-Speed In-Memory Mock Repository for Authorization & RBAC Testing
 */
class InMemoryAuthorizationRepository extends AuthRepository {
  public accounts: Map<string, IAccountDocument> = new Map();
  public accountsById: Map<string, IAccountDocument> = new Map();
  public touristProfiles: Map<string, ITouristProfileDocument> = new Map();
  public businessProfiles: Map<string, IBusinessProfileDocument> = new Map();
  public businessProfilesById: Map<string, IBusinessProfileDocument> = new Map();
  public adminProfiles: Map<string, IAdminProfileDocument> = new Map();

  public properties: Map<string, IPropertyDocument> = new Map();
  public packages: Map<string, ITourPackageDocument> = new Map();
  public posts: Map<string, IPostDocument> = new Map();
  public bookings: Map<string, IBookingDocument> = new Map();

  public override async findAccountById(id: Types.ObjectId | string): Promise<IAccountDocument | null> {
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
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAccountDocument;

    this.accounts.set(doc.email, doc);
    this.accountsById.set(id.toString(), doc);
    return doc;
  }

  public override async createTouristProfile(data: CreateTouristProfileInput): Promise<ITouristProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: data.accountId,
      firstName: data.firstName,
      lastName: data.lastName,
      preferredLanguage: 'EN',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ITouristProfileDocument;

    this.touristProfiles.set(data.accountId.toString(), doc);
    return doc;
  }

  public override async findTouristProfile(accountId: Types.ObjectId | string): Promise<ITouristProfileDocument | null> {
    return this.touristProfiles.get(accountId.toString()) || null;
  }

  public override async updateTouristProfile(
    accountId: Types.ObjectId | string,
    data: Record<string, unknown>,
  ): Promise<ITouristProfileDocument | null> {
    const existing = this.touristProfiles.get(accountId.toString());
    if (!existing) return null;
    Object.assign(existing, data, { updatedAt: new Date() });
    return existing;
  }

  public override async createBusinessProfile(data: CreateBusinessProfileInput): Promise<IBusinessProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: data.accountId,
      businessName: data.businessName,
      businessType: data.businessType,
      contactNumber: data.contactNumber,
      verificationStatus: data.verificationStatus || VERIFICATION_STATUSES.PENDING,
      documents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IBusinessProfileDocument;

    this.businessProfiles.set(data.accountId.toString(), doc);
    this.businessProfilesById.set(id.toString(), doc);
    return doc;
  }

  public override async findBusinessProfile(accountId: Types.ObjectId | string): Promise<IBusinessProfileDocument | null> {
    return this.businessProfiles.get(accountId.toString()) || null;
  }

  public override async updateBusinessProfile(
    accountId: Types.ObjectId | string,
    data: Record<string, unknown>,
  ): Promise<IBusinessProfileDocument | null> {
    const existing = this.businessProfiles.get(accountId.toString());
    if (!existing) return null;
    Object.assign(existing, data, { updatedAt: new Date() });
    return existing;
  }

  public override async updateBusinessVerificationStatus(
    businessId: Types.ObjectId | string,
    status: VerificationStatus,
  ): Promise<IBusinessProfileDocument | null> {
    const existing = this.businessProfilesById.get(businessId.toString());
    if (!existing) return null;
    existing.verificationStatus = status;
    return existing;
  }

  public async createAdminProfile(
    accountId: Types.ObjectId | string,
    permissions: AdminPermission[],
  ): Promise<IAdminProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(accountId.toString()),
      displayName: 'System Officer',
      permissions,
      adminLevel: ADMIN_LEVELS.DISTRICT_OFFICER,
      mfaEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAdminProfileDocument;

    this.adminProfiles.set(accountId.toString(), doc);
    return doc;
  }

  public override async findAdminProfile(accountId: Types.ObjectId | string): Promise<IAdminProfileDocument | null> {
    return this.adminProfiles.get(accountId.toString()) || null;
  }

  // Properties
  public override async createProperty(data: Record<string, unknown>): Promise<IPropertyDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IPropertyDocument;
    this.properties.set(id.toString(), doc);
    return doc;
  }

  public override async findPropertyById(id: Types.ObjectId | string): Promise<IPropertyDocument | null> {
    return this.properties.get(id.toString()) || null;
  }

  public override async updateProperty(
    id: Types.ObjectId | string,
    data: Record<string, unknown>,
  ): Promise<IPropertyDocument | null> {
    const existing = this.properties.get(id.toString());
    if (!existing) return null;
    Object.assign(existing, data, { updatedAt: new Date() });
    return existing;
  }

  // Packages
  public override async createTourPackage(data: Record<string, unknown>): Promise<ITourPackageDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ITourPackageDocument;
    this.packages.set(id.toString(), doc);
    return doc;
  }

  public override async findTourPackageById(id: Types.ObjectId | string): Promise<ITourPackageDocument | null> {
    return this.packages.get(id.toString()) || null;
  }

  public override async updateTourPackage(
    id: Types.ObjectId | string,
    data: Record<string, unknown>,
  ): Promise<ITourPackageDocument | null> {
    const existing = this.packages.get(id.toString());
    if (!existing) return null;
    Object.assign(existing, data, { updatedAt: new Date() });
    return existing;
  }

  // Posts (Day 13 alignment for Test #15)
  public override async createPost(data: Record<string, unknown>): Promise<IPostDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IPostDocument;
    this.posts.set(id.toString(), doc);
    return doc;
  }

  public override async findPostById(id: Types.ObjectId | string): Promise<IPostDocument | null> {
    return this.posts.get(id.toString()) || null;
  }

  public override async updatePost(
    id: Types.ObjectId | string,
    data: Record<string, unknown>,
  ): Promise<IPostDocument | null> {
    const existing = this.posts.get(id.toString());
    if (!existing) return null;
    Object.assign(existing, data, { updatedAt: new Date() });
    return existing;
  }

  // Bookings
  public override async createBooking(data: Record<string, unknown>): Promise<IBookingDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IBookingDocument;
    this.bookings.set(id.toString(), doc);
    return doc;
  }

  public override async findBookingById(id: Types.ObjectId | string): Promise<IBookingDocument | null> {
    return this.bookings.get(id.toString()) || null;
  }
}

class InMemoryAuthPostsRepository extends PostsRepository {
  constructor(private readonly store: InMemoryAuthorizationRepository) {
    super();
  }

  public override async createPost(data: CreatePostPersistenceInput): Promise<IPostDocument> {
    return this.store.createPost(data as unknown as Record<string, unknown>);
  }

  public override async findById(id: Types.ObjectId | string): Promise<IPostDocument | null> {
    const found = await this.store.findPostById(id);
    if (!found || found.deletedAt) return null;
    return found;
  }

  public override async updatePost(
    id: Types.ObjectId | string,
    updates: UpdatePostPersistenceInput,
  ): Promise<IPostDocument | null> {
    return this.store.updatePost(id, updates as unknown as Record<string, unknown>);
  }

  public override async findTouristProfilesByAccountIds(): Promise<ITouristProfileDocument[]> {
    return [];
  }
}

// Suite Setup
const app = createApp();
let mockRepo: InMemoryAuthorizationRepository;

beforeEach(async () => {
  resetRateLimiter();
  mockRepo = new InMemoryAuthorizationRepository();
  authMiddleware.setRepository(mockRepo);
  authorizationMiddleware.setRepository(mockRepo);
  authorizationController.setRepository(mockRepo);
  postsService.setRepository(new InMemoryAuthPostsRepository(mockRepo));
  postsService.setAuthRepository(mockRepo);
});

test('Authorization, RBAC & Resource Ownership Security Suite (Day 10)', async (t) => {
  // Helper to generate auth token
  const createTestUser = async (
    accountType: AccountType,
    status: AccountStatus = ACCOUNT_STATUSES.ACTIVE,
    options: { verificationStatus?: VerificationStatus; permissions?: AdminPermission[] } = {},
  ) => {
    const email = `${accountType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const account = await mockRepo.createAccount({
      email,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforauth',
      accountType,
      status,
    });

    let profile: unknown = null;
    if (accountType === ACCOUNT_TYPES.TOURIST) {
      profile = await mockRepo.createTouristProfile({
        accountId: account._id,
        firstName: 'Rahul',
        lastName: 'Menon',
      });
    } else if (accountType === ACCOUNT_TYPES.BUSINESS) {
      profile = await mockRepo.createBusinessProfile({
        accountId: account._id,
        businessName: 'Alleppey Houseboat Escapes',
        businessType: BUSINESS_TYPES.HOMESTAY,
        contactNumber: '+919847011223',
        verificationStatus: options.verificationStatus || VERIFICATION_STATUSES.PENDING,
      });
    } else if (accountType === ACCOUNT_TYPES.ADMIN) {
      profile = await mockRepo.createAdminProfile(
        account._id,
        options.permissions || [ADMIN_PERMISSIONS.VIEW_ANALYTICS],
      );
    }

    const token = jwtService.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });

    return { account, profile, token };
  };

  // --------------------------------------------------------------------------
  // AUTHENTICATION & ACCOUNT STATUS (Tests 1-3)
  // --------------------------------------------------------------------------

  await t.test('1. Unauthenticated user cannot access protected routes (Returns 401)', async () => {
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/profile',
      headers: { 'x-bypass-rate-limit': 'true' },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  await t.test('2. Suspended account cannot access protected routes (Returns 403 ACCOUNT_SUSPENDED)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.SUSPENDED);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'ACCOUNT_SUSPENDED');
  });

  await t.test('3. Deactivated account cannot access protected routes (Returns 403 ACCOUNT_DEACTIVATED)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST, ACCOUNT_STATUSES.DEACTIVATED);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'ACCOUNT_DEACTIVATED');
  });

  // --------------------------------------------------------------------------
  // ROLE AUTHORIZATION (Tests 4-9)
  // --------------------------------------------------------------------------

  await t.test('4. Tourist cannot access business routes (Returns 403 FORBIDDEN_ACCOUNT_TYPE)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/business/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');
  });

  await t.test('5. Business cannot access tourist-only routes (Returns 403 FORBIDDEN_ACCOUNT_TYPE)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.BUSINESS);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');
  });

  await t.test('6. Tourist cannot access admin routes (Returns 403 FORBIDDEN_ACCOUNT_TYPE or ADMIN_ONLY)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
  });

  await t.test('7. Business cannot access admin routes (Returns 403 FORBIDDEN_ACCOUNT_TYPE or ADMIN_ONLY)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.BUSINESS);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
  });

  await t.test('8. Admin with the correct permission can access the protected route (Returns 200 OK)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, {
      permissions: [ADMIN_PERMISSIONS.VIEW_ANALYTICS],
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('9. Admin without the required permission receives 403 (INSUFFICIENT_PERMISSIONS)', async () => {
    // Admin only has VIEW_ANALYTICS, but route requires MANAGE_USERS
    const { token } = await createTestUser(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, {
      permissions: [ADMIN_PERMISSIONS.VIEW_ANALYTICS],
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'INSUFFICIENT_PERMISSIONS');
  });

  // --------------------------------------------------------------------------
  // BUSINESS VERIFICATION GATEKEEPING (Tests 10-12)
  // --------------------------------------------------------------------------

  await t.test('10. Pending business cannot create a property (Returns 403 BUSINESS_NOT_VERIFIED)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.PENDING,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/business/properties',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        name: 'Kumarakom Backwater Heritage Villa',
        category: 'HOMESTAY',
        district: 'Kottayam',
        address: 'Cheepungal Road, Kumarakom',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'BUSINESS_NOT_VERIFIED');
  });

  await t.test('11. Rejected business cannot create a package (Returns 403 BUSINESS_NOT_VERIFIED)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.REJECTED,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/business/packages',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        title: 'Munnar Tea Plantation 3D2N Tour',
        durationDays: 3,
        durationNights: 2,
        pricePerPerson: 7500,
        inclusions: ['Breakfast', 'Jeep Safari'],
        maxGroupSize: 10,
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'BUSINESS_NOT_VERIFIED');
  });

  await t.test('12. Verified business can access verified-business operations (Returns 201 Created)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/business/properties',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        name: 'Marari Beach Eco Heritage Resort',
        category: 'RESORT',
        district: 'Alappuzha',
        address: 'Mararikulam Beach Road',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
  });

  // --------------------------------------------------------------------------
  // RESOURCE OWNERSHIP SECURITY & BOLA/IDOR DEFENSE (Tests 13-19)
  // --------------------------------------------------------------------------

  await t.test('13. Tourist can access their own profile (Returns 200 OK)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test("14. Tourist cannot modify another tourist's profile (rejects or anchors strictly to req.user.id)", async () => {
    const victim = await createTestUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createTestUser(ACCOUNT_TYPES.TOURIST);

    // Attacker sends request to update profile
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${attacker.token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        firstName: 'HackedName',
      },
    });

    assert.equal(res.status, 200);

    // Verify victim's profile was completely unaffected
    const victimProfile = await mockRepo.findTouristProfile(victim.account._id);
    assert.equal(victimProfile?.firstName, 'Rahul');

    // Attacker's own profile was updated
    const attackerProfile = await mockRepo.findTouristProfile(attacker.account._id);
    assert.equal(attackerProfile?.firstName, 'HackedName');
  });

  await t.test("15. Tourist cannot modify another user's post (Returns 404 RESOURCE_NOT_FOUND)", async () => {
    const owner = await createTestUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createTestUser(ACCOUNT_TYPES.TOURIST);

    // Create post owned by owner
    const post = await mockRepo.createPost({
      authorId: owner.account._id,
      content: 'Sunset at Kovalam Beach',
      mediaIds: [],
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/tourist/posts/${post._id}`,
      headers: {
        authorization: `Bearer ${attacker.token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: { content: 'Defaced post caption' },
    });

    // Conceals existence with 404 to defeat IDOR enumeration
    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');

    // Post remains untouched
    const postAfter = await mockRepo.findPostById(post._id);
    assert.equal(postAfter?.content, 'Sunset at Kovalam Beach');
  });

  await t.test('16. Business can access and update its own property (Returns 200 OK)', async () => {
    const biz = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });

    const property = await mockRepo.createProperty({
      ownerId: biz.account._id.toString(),
      name: 'Varkala Cliffside Villas',
      category: 'RESORT',
      district: 'Thiruvananthapuram',
      address: 'North Cliff, Varkala',
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/business/properties/${property._id}`,
      headers: {
        authorization: `Bearer ${biz.token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: { name: 'Varkala Cliffside Luxury Suites' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test("17. Business cannot modify another business's property (Returns 404 RESOURCE_NOT_FOUND)", async () => {
    const legitimateBiz = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });
    const rivalBiz = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });

    const property = await mockRepo.createProperty({
      ownerId: legitimateBiz.account._id.toString(),
      name: 'Bekal Fort Heritage Homestay',
      category: 'HOMESTAY',
      district: 'Kasaragod',
      address: 'Bekal Beach Road',
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/business/properties/${property._id}`,
      headers: {
        authorization: `Bearer ${rivalBiz.token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: { name: 'Unauthorized takeover' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  await t.test("18. Business cannot modify another business's package (Returns 404 RESOURCE_NOT_FOUND)", async () => {
    const agency1 = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });
    const agency2 = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });

    const pkg = await mockRepo.createTourPackage({
      agencyId: agency1.account._id.toString(),
      title: 'Wayanad Chembra Peak Trek',
      durationDays: 2,
      durationNights: 1,
      pricePerPerson: 3500,
      inclusions: ['Guide', 'Trek Permits'],
      maxGroupSize: 8,
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/business/packages/${pkg._id}`,
      headers: {
        authorization: `Bearer ${agency2.token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: { title: 'Hijacked package title' },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  await t.test("19. Business cannot access another business's private bookings (Returns 404 RESOURCE_NOT_FOUND)", async () => {
    const bizA = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });
    const bizB = await createTestUser(ACCOUNT_TYPES.BUSINESS, ACCOUNT_STATUSES.ACTIVE, {
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    });

    const propertyA = await mockRepo.createProperty({
      ownerId: bizA.account._id.toString(),
      name: 'Property A',
      category: 'HOTEL',
      district: 'Ernakulam',
      address: 'MG Road, Kochi',
    });

    const booking = await mockRepo.createBooking({
      bookingNumber: 'BK-100234',
      touristId: new Types.ObjectId().toString(),
      propertyId: propertyA._id.toString(),
      roomId: new Types.ObjectId().toString(),
      mode: 'DAILY',
      checkInTime: new Date(),
      checkOutTime: new Date(Date.now() + 86400000),
      guestsCount: 2,
      totalAmount: 4500,
    });

    // Business B attempts to view Booking for Property A
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/business/bookings/${booking._id}`,
      headers: {
        authorization: `Bearer ${bizB.token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // PRIVILEGE ESCALATION ATTACKS (Tests 20-23)
  // --------------------------------------------------------------------------

  await t.test('20. Client cannot become ADMIN by sending accountType in the request body (Returns 400 Bad Request)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        firstName: 'Malicious',
        accountType: 'ADMIN', // Unauthorized field injection
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('21. Client cannot modify their admin permissions via profile updates (Returns 400 Bad Request)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        firstName: 'Malicious',
        permissions: ['MANAGE_USERS', 'MANAGE_SYSTEM_SETTINGS'],
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('22. Client cannot bypass ownership by submitting another accountId in body (Returns 400 Bad Request)', async () => {
    const { token } = await createTestUser(ACCOUNT_TYPES.TOURIST);
    const foreignAccountId = new Types.ObjectId().toString();

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: '/api/v1/tourist/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-bypass-rate-limit': 'true',
      },
      body: {
        firstName: 'Malicious',
        accountId: foreignAccountId, // Unauthorized field injection
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('23. Client cannot bypass ownership through query parameters (Query params ignored)', async () => {
    const victim = await createTestUser(ACCOUNT_TYPES.TOURIST);
    const attacker = await createTestUser(ACCOUNT_TYPES.TOURIST);

    // Attacker tries to read profile passing victim's account ID via query params
    const res = await dispatchRequest<TestApiResponse<{ accountId: string }>>(app, {
      method: 'GET',
      url: `/api/v1/tourist/profile?accountId=${victim.account._id}&ownerId=${victim.account._id}`,
      headers: {
        authorization: `Bearer ${attacker.token}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 200);
    // Verified that caller received their OWN profile, not the victim's profile!
    assert.equal(res.body.data?.accountId, attacker.account._id.toString());
  });
});
