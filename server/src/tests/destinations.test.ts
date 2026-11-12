import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { jwtService } from '../shared/security/jwt.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { destinationsService } from '../modules/destinations/destinations.service';
import { DestinationsRepository } from '../modules/destinations/destinations.repository';
import {
  AuthRepository,
  CreateAccountInput,
  CreateTouristProfileInput,
} from '../modules/auth/auth.repository';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  KERALA_DISTRICTS,
  DESTINATION_VERIFICATION_STATUSES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_SUBMISSION_STATUSES,
  ADMIN_PERMISSIONS,
} from '@kerala-tourism/constants';
import {
  DestinationModel,
  IDestinationDocument,
  DestinationCategoryModel,
  IDestinationCategoryDocument,
  DestinationSubmissionModel,
  IDestinationSubmissionDocument,
  IAccountDocument,
  ITouristProfileDocument,
  IAdminProfileDocument,
} from '../shared/models';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { Types } from 'mongoose';
import {
  AccountType,
  AccountStatus,
  AdminPermission,
} from '@kerala-tourism/shared-types';
import { DestinationQueryInput } from '../modules/destinations/destinations.types';

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

/**
 * High-Speed In-Memory Auth Repository for JWT & RBAC Verification
 */
class InMemoryAuthRepository extends AuthRepository {
  public accountsById: Map<string, IAccountDocument> = new Map();
  public touristProfiles: Map<string, ITouristProfileDocument> = new Map();
  public adminProfiles: Map<string, IAdminProfileDocument> = new Map();

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

  public override async findAdminProfile(accountId: Types.ObjectId | string): Promise<IAdminProfileDocument | null> {
    return this.adminProfiles.get(accountId.toString()) || null;
  }

  public async setAdminProfile(accountId: string, profile: Partial<IAdminProfileDocument>): Promise<IAdminProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: new Types.ObjectId(accountId),
      displayName: profile.displayName || 'Tourism Officer',
      permissions: profile.permissions || [],
      adminLevel: profile.adminLevel || 'DISTRICT_OFFICER',
      mfaEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAdminProfileDocument;
    this.adminProfiles.set(accountId, doc);
    return doc;
  }
}

/**
 * High-Speed In-Memory Destination Repository
 */
class InMemoryDestinationsRepository extends DestinationsRepository {
  public destinations: Map<string, IDestinationDocument> = new Map();
  public categories: Map<string, IDestinationCategoryDocument> = new Map();
  public submissions: Map<string, IDestinationSubmissionDocument> = new Map();

  public override async findPublishedDestinations(
    query: DestinationQueryInput,
  ): Promise<{ items: IDestinationDocument[]; total: number }> {
    let list = Array.from(this.destinations.values()).filter(
      (d) =>
        d.verificationStatus === DESTINATION_VERIFICATION_STATUSES.VERIFIED &&
        d.publicationStatus === DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    );

    if (query.district) {
      list = list.filter((d) => d.district.toLowerCase() === query.district!.toLowerCase());
    }

    if (query.categoryId) {
      list = list.filter((d) =>
        (d.categoryIds || []).some((id) => id.toString() === query.categoryId),
      );
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q),
      );
    }

    // Sort
    const sortField = query.sortBy === 'name' ? 'name' : 'createdAt';
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const valA = (a as unknown as Record<string, string | number>)[sortField]!;
      const valB = (b as unknown as Record<string, string | number>)[sortField]!;
      if (valA < valB) return -1 * sortDir;
      if (valA > valB) return 1 * sortDir;
      return 0;
    });

    const total = list.length;
    const start = (query.page - 1) * query.limit;
    const items = list.slice(start, start + query.limit);

    return { items, total };
  }

  public override async findPublishedBySlug(slug: string): Promise<IDestinationDocument | null> {
    const s = slug.toLowerCase().trim();
    for (const d of this.destinations.values()) {
      if (
        d.slug === s &&
        d.verificationStatus === DESTINATION_VERIFICATION_STATUSES.VERIFIED &&
        d.publicationStatus === DESTINATION_PUBLICATION_STATUSES.PUBLISHED
      ) {
        return d;
      }
    }
    return null;
  }

  public override async findDestinationById(id: string | Types.ObjectId): Promise<IDestinationDocument | null> {
    return this.destinations.get(id.toString()) || null;
  }

  public override async findDestinationBySlug(slug: string): Promise<IDestinationDocument | null> {
    const s = slug.toLowerCase().trim();
    for (const d of this.destinations.values()) {
      if (d.slug === s) return d;
    }
    return null;
  }

  public override async createDestination(data: Partial<IDestinationDocument>): Promise<IDestinationDocument> {
    const id = new Types.ObjectId();
    const slug =
      data.slug ||
      (data.name ? data.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'destination');
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      slug,
      images: data.images || [],
      facilities: data.facilities || [],
      entryFee: data.entryFee || { amount: 0, currency: 'INR', isFree: true },
      verificationStatus: data.verificationStatus || DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: data.publicationStatus || DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IDestinationDocument;

    this.destinations.set(id.toString(), doc);
    return doc;
  }

  public override async updateDestination(
    id: string | Types.ObjectId,
    updates: Partial<IDestinationDocument>,
  ): Promise<IDestinationDocument | null> {
    const doc = this.destinations.get(id.toString());
    if (!doc) return null;
    Object.assign(doc, updates, { updatedAt: new Date() });
    return doc;
  }

  public override async createCategory(data: Partial<IDestinationCategoryDocument>): Promise<IDestinationCategoryDocument> {
    const id = new Types.ObjectId();
    const slug =
      data.slug ||
      (data.name ? data.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'cat');
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      slug,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IDestinationCategoryDocument;
    this.categories.set(id.toString(), doc);
    return doc;
  }

  public override async findCategoryById(id: string | Types.ObjectId): Promise<IDestinationCategoryDocument | null> {
    return this.categories.get(id.toString()) || null;
  }

  public override async listActiveCategories(): Promise<IDestinationCategoryDocument[]> {
    return Array.from(this.categories.values())
      .filter((c) => c.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public override async createSubmission(
    data: Partial<IDestinationSubmissionDocument>,
  ): Promise<IDestinationSubmissionDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      ...data,
      categoryIds: data.categoryIds || [],
      imageMediaIds: data.imageMediaIds || [],
      submissionStatus: data.submissionStatus || DESTINATION_SUBMISSION_STATUSES.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IDestinationSubmissionDocument;

    this.submissions.set(id.toString(), doc);
    return doc;
  }

  public override async findSubmissionById(id: string | Types.ObjectId): Promise<IDestinationSubmissionDocument | null> {
    return this.submissions.get(id.toString()) || null;
  }

  public override async findSubmissionsByTourist(
    touristAccountId: string | Types.ObjectId,
    page = 1,
    limit = 20,
  ): Promise<{ items: IDestinationSubmissionDocument[]; total: number }> {
    const tId = touristAccountId.toString();
    const list = Array.from(this.submissions.values()).filter(
      (s) => s.submittedBy.toString() === tId,
    );
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = list.length;
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit);
    return { items, total };
  }

  public override async listSubmissions(filter: {
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: IDestinationSubmissionDocument[]; total: number }> {
    let list = Array.from(this.submissions.values());
    if (filter.status) {
      list = list.filter((s) => s.submissionStatus === filter.status);
    }
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = list.length;
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit);
    return { items, total };
  }

  public override async updateSubmission(
    id: string | Types.ObjectId,
    updates: Partial<IDestinationSubmissionDocument>,
  ): Promise<IDestinationSubmissionDocument | null> {
    const doc = this.submissions.get(id.toString());
    if (!doc) return null;
    Object.assign(doc, updates, { updatedAt: new Date() });
    return doc;
  }
}

// Global Test Setup
const app = createApp();
let mockAuthRepo: InMemoryAuthRepository;
let mockDestRepo: InMemoryDestinationsRepository;

beforeEach(async () => {
  resetRateLimiter();
  mockAuthRepo = new InMemoryAuthRepository();
  mockDestRepo = new InMemoryDestinationsRepository();

  authMiddleware.setRepository(mockAuthRepo);
  authorizationMiddleware.setRepository(mockAuthRepo);
  destinationsService.setRepository(mockDestRepo);
});

// Helper for generating authenticated accounts
const createTestPrincipal = async (
  accountType: AccountType,
  status: AccountStatus = ACCOUNT_STATUSES.ACTIVE,
  permissions: AdminPermission[] = [],
) => {
  const email = `${accountType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  const account = await mockAuthRepo.createAccount({
    email,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtestvalue',
    accountType,
    status,
  });

  if (accountType === ACCOUNT_TYPES.TOURIST) {
    await mockAuthRepo.createTouristProfile({
      accountId: account._id,
      firstName: 'Arjun',
      lastName: 'Nair',
    });
  } else if (accountType === ACCOUNT_TYPES.ADMIN) {
    await mockAuthRepo.setAdminProfile(account._id.toString(), {
      permissions,
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

// Helper for sending formatted in-memory requests
const makeRequest = async <T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  token?: string,
) => {
  const headers: Record<string, string> = {};
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  return dispatchRequest<T>(app, {
    method,
    url,
    headers,
    body,
  });
};

test('Destination Management System Test Suite (Day 11)', async (t) => {
  // ==============================================================================
  // 1. DESTINATION MODEL TESTS
  // ==============================================================================

  await t.test('1. Successful destination creation with valid fields & coordinates', () => {
    const destination = new DestinationModel({
      name: 'Munnar Tea Hills',
      description: 'Picturesque hill station situated at the confluence of three mountain streams in the Western Ghats.',
      district: 'Idukki',
      location: {
        type: 'Point',
        coordinates: [77.0595, 10.0889], // Valid Kerala bounds [lng, lat]
      },
      address: 'Munnar, Idukki District, Kerala 685612',
      createdBy: new Types.ObjectId(),
    });

    const error = destination.validateSync();
    assert.strictEqual(error, undefined, 'Valid destination must pass schema validation');
    assert.strictEqual(destination.verificationStatus, DESTINATION_VERIFICATION_STATUSES.PENDING);
    assert.strictEqual(destination.publicationStatus, DESTINATION_PUBLICATION_STATUSES.DRAFT);
  });

  await t.test('2. Missing required name rejected by validation', () => {
    const destination = new DestinationModel({
      description: 'Scenic backwater village with lush green paddy fields and canals.',
      district: 'Alappuzha',
      location: {
        type: 'Point',
        coordinates: [76.3388, 9.4981],
      },
      address: 'Kuttanad, Alappuzha, Kerala',
      createdBy: new Types.ObjectId(),
    });

    const error = destination.validateSync();
    assert.ok(error, 'Missing name must produce validation error');
    assert.ok(error.errors.name, 'Validation error must highlight missing name');
  });

  await t.test('3. Invalid coordinates outside Kerala bounds rejected', () => {
    // Test coordinates outside Kerala (e.g. London coordinates)
    const destination = new DestinationModel({
      name: 'Offshore Spot',
      description: 'Coordinates placed far into the Arabian sea or another country.',
      district: 'Ernakulam',
      location: {
        type: 'Point',
        coordinates: [10.0, 50.0], // Out of Kerala bounds
      },
      address: 'Invalid location address',
      createdBy: new Types.ObjectId(),
    });

    const error = destination.validateSync();
    assert.ok(error, 'Coordinates outside Kerala bounds must fail validation');
    assert.ok(error.errors['location.coordinates'], 'Must flag invalid coordinates');
  });

  await t.test('4. Invalid district rejected by validation', () => {
    const destination = new DestinationModel({
      name: 'Unknown District Haven',
      description: 'Attempting to assign an unapproved non-Kerala district name.',
      district: 'Bangalore' as unknown as typeof KERALA_DISTRICTS[0],
      location: {
        type: 'Point',
        coordinates: [76.2673, 9.9312],
      },
      address: 'Some address in Kerala',
      createdBy: new Types.ObjectId(),
    });

    const error = destination.validateSync();
    assert.ok(error, 'Non-Kerala district must fail schema validation');
    assert.ok(error.errors.district, 'Must report invalid district');
  });

  await t.test('5. Duplicate slug rejected by unique index definition', () => {
    const indexes = DestinationModel.schema.indexes();
    const slugIndex = indexes.find(
      ([fields]) => 'slug' in fields && fields.slug === 1,
    );

    assert.ok(slugIndex, 'Destination schema must define index on slug');
    const [fields, options] = slugIndex;
    assert.strictEqual(fields.slug, 1);
    assert.strictEqual(options?.unique, true, 'Slug index must enforce unique constraint');
  });

  await t.test('6. Invalid verification status rejected', () => {
    const destination = new DestinationModel({
      name: 'Illegal Status Spot',
      description: 'Spot with unauthorized verification status.',
      district: 'Wayanad',
      location: {
        type: 'Point',
        coordinates: [76.132, 11.6854],
      },
      address: 'Kalpetta, Wayanad',
      verificationStatus: 'SUPER_APPROVED' as unknown as typeof DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      createdBy: new Types.ObjectId(),
    });

    const error = destination.validateSync();
    assert.ok(error, 'Invalid verification status must be rejected');
    assert.ok(error.errors.verificationStatus);
  });

  await t.test('7. Invalid publication status rejected', () => {
    const destination = new DestinationModel({
      name: 'Illegal Pub Status Spot',
      description: 'Spot with unauthorized publication status.',
      district: 'Thrissur',
      location: {
        type: 'Point',
        coordinates: [76.2144, 10.5276],
      },
      address: 'Round, Thrissur',
      publicationStatus: 'WORLDWIDE_BROADCAST' as unknown as typeof DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const error = destination.validateSync();
    assert.ok(error, 'Invalid publication status must be rejected');
    assert.ok(error.errors.publicationStatus);
  });

  await t.test('8. GeoJSON 2dsphere index is defined on location', () => {
    const indexes = DestinationModel.schema.indexes();
    const geoIndex = indexes.find(
      ([fields]) => 'location' in fields && fields.location === '2dsphere',
    );

    assert.ok(geoIndex, 'Destination schema must declare 2dsphere index on location field');
  });

  // ==============================================================================
  // 2. CATEGORY MODEL & PUBLIC API TESTS
  // ==============================================================================

  await t.test('9. Successful category creation & slug auto-generation', () => {
    const category = new DestinationCategoryModel({
      name: 'Heritage Forts & Palaces',
      description: 'Historic colonial and royal monuments across Kerala.',
      icon: 'castle',
    });

    const error = category.validateSync();
    assert.strictEqual(error, undefined, 'Category must pass validation');
    assert.strictEqual(category.slug, 'heritage-forts-palaces', 'Slug must be automatically generated');
    assert.strictEqual(category.isActive, true, 'Default isActive must be true');
  });

  await t.test('10. Duplicate category slug rejected by index definition', () => {
    const indexes = DestinationCategoryModel.schema.indexes();
    const slugIndex = indexes.find(
      ([fields]) => 'slug' in fields && fields.slug === 1,
    );

    assert.ok(slugIndex, 'Category schema must define index on slug');
    const [, options] = slugIndex;
    assert.strictEqual(options?.unique, true, 'Category slug index must enforce unique constraint');
  });

  await t.test('11. Inactive categories excluded from public category results', async () => {
    await mockDestRepo.createCategory({ name: 'Active Backwaters', isActive: true });
    await mockDestRepo.createCategory({ name: 'Hidden Closed Category', isActive: false });

    const res = await makeRequest<TestApiResponse<Array<{ name: string; slug: string }>>>(
      'GET',
      '/api/v1/destination-categories',
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    const names = res.body.data.map((c) => c.name);
    assert.ok(names.includes('Active Backwaters'));
    assert.ok(!names.includes('Hidden Closed Category'), 'Inactive categories must be excluded');
  });

  // ==============================================================================
  // 3. PUBLIC DESTINATION API TESTS
  // ==============================================================================

  await t.test('12. Published & verified destinations are returned in public query', async () => {
    await mockDestRepo.createDestination({
      name: 'Varkala Cliff Beach',
      district: 'Thiruvananthapuram',
      description: 'Unique red sedimentary cliffs adjacent to the Arabian Sea.',
      location: { type: 'Point', coordinates: [76.7163, 8.7379] },
      address: 'Varkala, Thiruvananthapuram, Kerala 695141',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string; slug: string }>>>(
      'GET',
      '/api/v1/destinations',
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(names.includes('Varkala Cliff Beach'));
  });

  await t.test('13. Draft destinations are hidden from public discovery', async () => {
    await mockDestRepo.createDestination({
      name: 'Unpublished Secret Waterfall',
      district: 'Idukki',
      description: 'Draft destination that is verified but not yet published.',
      location: { type: 'Point', coordinates: [76.9744, 9.8512] },
      address: 'Secret Valley, Idukki',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT, // DRAFT
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string }>>>(
      'GET',
      '/api/v1/destinations',
    );

    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(!names.includes('Unpublished Secret Waterfall'), 'Draft destination must be hidden');
  });

  await t.test('14. Pending destinations are hidden from public discovery', async () => {
    await mockDestRepo.createDestination({
      name: 'Pending Tourist Proposal',
      district: 'Palakkad',
      description: 'Submission pending admin verification.',
      location: { type: 'Point', coordinates: [76.6548, 10.7867] },
      address: 'Silent Valley buffer, Palakkad',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string }>>>(
      'GET',
      '/api/v1/destinations',
    );

    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(!names.includes('Pending Tourist Proposal'), 'Pending destination must be hidden');
  });

  await t.test('15. Rejected destinations are hidden from public discovery', async () => {
    await mockDestRepo.createDestination({
      name: 'Rejected Inaccessible Cliff',
      district: 'Kozhikode',
      description: 'Rejected due to extreme safety hazards.',
      location: { type: 'Point', coordinates: [75.7804, 11.2588] },
      address: 'Danger point, Kozhikode',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.REJECTED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string }>>>(
      'GET',
      '/api/v1/destinations',
    );

    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(!names.includes('Rejected Inaccessible Cliff'), 'Rejected destination must be hidden');
  });

  await t.test('16. Archived destinations are hidden from public discovery', async () => {
    await mockDestRepo.createDestination({
      name: 'Temporarily Closed Sanctuary',
      district: 'Wayanad',
      description: 'Closed for forest rehabilitation.',
      location: { type: 'Point', coordinates: [76.2625, 11.7511] },
      address: 'Tholpetty, Wayanad',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.ARCHIVED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string }>>>(
      'GET',
      '/api/v1/destinations',
    );

    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(!names.includes('Temporarily Closed Sanctuary'), 'Archived destination must be hidden');
  });

  await t.test('17. Destination detail lookup works by slug', async () => {
    const dest = await mockDestRepo.createDestination({
      name: 'Athirappilly Waterfalls',
      slug: 'athirappilly-waterfalls',
      district: 'Thrissur',
      description: 'Majestic 80-foot waterfall on the Chalakudy River, known as the Niagara of India.',
      location: { type: 'Point', coordinates: [76.5688, 10.285] },
      address: 'Athirappilly, Thrissur District, Kerala 680721',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<{ name: string; slug: string; district: string }>>(
      'GET',
      `/api/v1/destinations/${dest.slug}`,
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data?.name, 'Athirappilly Waterfalls');
    assert.strictEqual(res.body.data?.district, 'Thrissur');
  });

  await t.test('18. Invalid pagination is rejected or safely normalized', async () => {
    const res = await makeRequest<TestApiResponse>(
      'GET',
      '/api/v1/destinations?page=1&limit=50',
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.pagination?.limit, 50);

    // Negative page should be rejected by Zod schema
    const invalidRes = await makeRequest<TestApiResponse>(
      'GET',
      '/api/v1/destinations?page=-1',
    );
    assert.strictEqual(invalidRes.status, 400, 'Negative page number must be rejected');
  });

  await t.test('19. District filtering works accurately', async () => {
    await mockDestRepo.createDestination({
      name: 'Kumarakom Bird Sanctuary',
      district: 'Kottayam',
      description: 'Lush 14-acre bird sanctuary situated on the banks of Vembanad Lake.',
      location: { type: 'Point', coordinates: [76.4279, 9.6175] },
      address: 'Kumarakom, Kottayam, Kerala 686563',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string; district: string }>>>(
      'GET',
      '/api/v1/destinations?district=Kottayam',
    );

    assert.strictEqual(res.status, 200);
    assert.ok((res.body.data?.length ?? 0) > 0);
    for (const item of res.body.data ?? []) {
      assert.strictEqual(item.district, 'Kottayam');
    }
  });

  await t.test('20. Category filtering works accurately', async () => {
    const cat = await mockDestRepo.createCategory({ name: 'Hill Stations', isActive: true });

    await mockDestRepo.createDestination({
      name: 'Ponmudi Golden Peak',
      district: 'Thiruvananthapuram',
      categoryIds: [cat._id],
      description: 'Winding 22 hairpin curves climbing into cool misty tea gardens.',
      location: { type: 'Point', coordinates: [77.1147, 8.7601] },
      address: 'Ponmudi, Thiruvananthapuram 695551',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string }>>>(
      'GET',
      `/api/v1/destinations?categoryId=${cat._id.toString()}`,
    );

    assert.strictEqual(res.status, 200);
    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(names.includes('Ponmudi Golden Peak'));
  });

  // ==============================================================================
  // 4. TOURIST DESTINATION SUBMISSIONS TESTS
  // ==============================================================================

  await t.test('21. Unauthenticated tourist submission rejected (401)', async () => {
    const res = await makeRequest<TestApiResponse>(
      'POST',
      '/api/v1/tourist/destination-submissions',
      {
        name: 'Secret Pool',
        description: 'Unauthenticated proposal that should fail immediately.',
        submittedLocation: { type: 'Point', coordinates: [76.5, 9.5] },
        submittedAddress: 'Somewhere in Kerala',
        imageMediaIds: ['img-1'],
      },
    );

    assert.strictEqual(res.status, 401);
  });

  await t.test('22. Authenticated tourist can submit destination suggestion', async () => {
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    const res = await makeRequest<TestApiResponse<{ id: string; name: string; submissionStatus: string }>>(
      'POST',
      '/api/v1/tourist/destination-submissions',
      {
        name: 'Hidden Stream in Marayoor',
        description: 'A crystal-clear natural stream passing through the natural sandalwood forests.',
        submittedLocation: { type: 'Point', coordinates: [77.1593, 10.2798] },
        submittedAddress: 'Near Marayoor Sandalwood Reserve, Idukki',
        imageMediaIds: ['media-upload-001', 'media-upload-002'],
      },
      tourist.token,
    );

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data?.name, 'Hidden Stream in Marayoor');
    assert.strictEqual(res.body.data?.submissionStatus, DESTINATION_SUBMISSION_STATUSES.PENDING);
  });

  await t.test('23. submittedBy strictly set to authenticated principal ID', async () => {
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    const res = await makeRequest<TestApiResponse<{ id: string; submittedBy: string }>>(
      'POST',
      '/api/v1/tourist/destination-submissions',
      {
        name: 'Kallada River Bank Camp',
        description: 'Peaceful camping grounds near the river with safe wading waters.',
        submittedLocation: { type: 'Point', coordinates: [76.6892, 9.0211] },
        submittedAddress: 'Kallada River Basin, Kollam',
        imageMediaIds: ['media-photo-1'],
      },
      tourist.token,
    );

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data?.submittedBy, tourist.account._id.toString());
  });

  await t.test('24. Tourist cannot submit as another account via body injection', async () => {
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);
    const forgedAccountId = new Types.ObjectId().toString();

    const res = await makeRequest<TestApiResponse>(
      'POST',
      '/api/v1/tourist/destination-submissions',
      {
        name: 'Forged Account Submission',
        description: 'Attempting to inject a foreign submittedBy parameter in body.',
        submittedBy: forgedAccountId, // Malicious injection
        submittedLocation: { type: 'Point', coordinates: [76.5, 9.5] },
        submittedAddress: 'Test Address',
        imageMediaIds: ['img-test'],
      },
      tourist.token,
    );

    // Zod .strict() rejects unrecognized field 'submittedBy'
    assert.strictEqual(res.status, 400, 'Injected submittedBy field must be rejected');
  });

  await t.test('25. Tourist cannot approve their own submission', async () => {
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);
    const submissionId = new Types.ObjectId().toString();

    // Tourist attempting to invoke admin review endpoint
    const res = await makeRequest<TestApiResponse>(
      'PATCH',
      `/api/v1/admin/destination-submissions/${submissionId}/review`,
      {
        action: 'APPROVE',
        reviewNotes: 'Self-approval attempt',
      },
      tourist.token,
    );

    assert.strictEqual(res.status, 403, 'Tourist must be forbidden from admin review endpoints');
  });

  await t.test("26. Tourist cannot access another tourist's submission (404 Concealment)", async () => {
    const touristA = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);
    const touristB = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    // Tourist A creates submission
    const submission = await mockDestRepo.createSubmission({
      submittedBy: touristA.account._id,
      name: "Tourist A's Hidden Cove",
      description: 'Private submission belonging to tourist A.',
      submittedLocation: { type: 'Point', coordinates: [76.2, 9.8] },
      submittedAddress: 'Address A',
      imageMediaIds: ['img-a'],
    });

    // Tourist B attempts to read Tourist A's submission
    const res = await makeRequest<TestApiResponse>(
      'GET',
      `/api/v1/tourist/destination-submissions/${submission._id.toString()}`,
      undefined,
      touristB.token,
    );

    assert.strictEqual(res.status, 404, 'Must return 404 Not Found to conceal resource existence');
  });

  await t.test('27. New submissions default to PENDING status', async () => {
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    const res = await makeRequest<TestApiResponse<{ submissionStatus: string }>>(
      'POST',
      '/api/v1/tourist/destination-submissions',
      {
        name: 'Pazhassi Dam Garden',
        description: 'Vast reservoir with landscaped gardens and boat rides.',
        submittedLocation: { type: 'Point', coordinates: [75.5925, 11.9542] },
        submittedAddress: 'Mattannur, Kannur 670702',
        imageMediaIds: ['img-pazhassi'],
      },
      tourist.token,
    );

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data?.submissionStatus, DESTINATION_SUBMISSION_STATUSES.PENDING);

    // Verify DestinationSubmissionModel index definition
    const subIndexes = DestinationSubmissionModel.schema.indexes();
    const geoIndex = subIndexes.find(([fields]) => 'submittedLocation' in fields);
    assert.ok(geoIndex, 'DestinationSubmission schema must declare 2dsphere index on submittedLocation');
  });

  // ==============================================================================
  // 5. ADMIN DESTINATION MANAGEMENT TESTS
  // ==============================================================================

  await t.test('28. Admin without MANAGE_DESTINATIONS cannot create destinations', async () => {
    // Admin with only VIEW_ANALYTICS permission
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.VIEW_ANALYTICS,
    ]);

    const res = await makeRequest<TestApiResponse>(
      'POST',
      '/api/v1/admin/destinations',
      {
        name: 'Unauthorized Admin Destination',
        description: 'Creation attempt by admin lacking MANAGE_DESTINATIONS permission.',
        district: 'Ernakulam',
        location: { type: 'Point', coordinates: [76.2673, 9.9312] },
        address: 'Marine Drive, Kochi',
      },
      admin.token,
    );

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error?.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await t.test('29. Admin with MANAGE_DESTINATIONS can create destinations in DRAFT state', async () => {
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.MANAGE_DESTINATIONS,
    ]);

    const res = await makeRequest<TestApiResponse<{ name: string; verificationStatus: string; publicationStatus: string }>>(
      'POST',
      '/api/v1/admin/destinations',
      {
        name: 'Fort Kochi Heritage Promenade',
        description: 'Colonial coastal pathway passing Vasco da Gama square and ancient Chinese fishing nets.',
        district: 'Ernakulam',
        location: { type: 'Point', coordinates: [76.2415, 9.9658] },
        address: 'Fort Kochi, Kochi, Kerala 682001',
        facilities: ['WALKWAY', 'PARKING', 'RESTROOMS'],
      },
      admin.token,
    );

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data?.name, 'Fort Kochi Heritage Promenade');
    assert.strictEqual(res.body.data?.verificationStatus, DESTINATION_VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(res.body.data?.publicationStatus, DESTINATION_PUBLICATION_STATUSES.DRAFT);
  });

  await t.test('30. Admin without VERIFY_DESTINATIONS cannot review submissions', async () => {
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.MANAGE_USERS,
    ]);
    const submissionId = new Types.ObjectId().toString();

    const res = await makeRequest<TestApiResponse>(
      'PATCH',
      `/api/v1/admin/destination-submissions/${submissionId}/review`,
      {
        action: 'APPROVE',
        reviewNotes: 'Audit attempt',
      },
      admin.token,
    );

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error?.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await t.test('31. Approved submission creates official destination with VERIFIED status', async () => {
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.VERIFY_DESTINATIONS,
    ]);
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    // Create tourist submission
    const submission = await mockDestRepo.createSubmission({
      submittedBy: tourist.account._id,
      name: 'Cheeyappara Cascades View',
      description: 'Stunning tiered natural waterfall visible on the Kochi-Madurai national highway.',
      submittedLocation: { type: 'Point', coordinates: [76.8921, 10.0124] },
      submittedAddress: 'Cheeyappara, Idukki District, Kerala',
      imageMediaIds: ['cheeyappara-1.jpg'],
    });

    const res = await makeRequest<TestApiResponse<{ submission: { submissionStatus: string }; destination: { name: string; verificationStatus: string; publicationStatus: string } }>>(
      'PATCH',
      `/api/v1/admin/destination-submissions/${submission._id.toString()}/review`,
      {
        action: 'APPROVE',
        reviewNotes: 'Survey verified coordinates and parking safety.',
      },
      admin.token,
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data?.submission.submissionStatus, DESTINATION_SUBMISSION_STATUSES.APPROVED);
    assert.ok(res.body.data?.destination, 'Official destination must be created');
    assert.strictEqual(res.body.data?.destination.name, 'Cheeyappara Cascades View');
    assert.strictEqual(res.body.data?.destination.verificationStatus, DESTINATION_VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(res.body.data?.destination.publicationStatus, DESTINATION_PUBLICATION_STATUSES.DRAFT);
  });

  await t.test('32. Rejected submission records reviewer, reviewNotes, and review timestamp', async () => {
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.VERIFY_DESTINATIONS,
    ]);
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    const submission = await mockDestRepo.createSubmission({
      submittedBy: tourist.account._id,
      name: 'Dangerous Forest Zone',
      description: 'Proposal located in a core tiger reserve without public transit access.',
      submittedLocation: { type: 'Point', coordinates: [76.9, 9.8] },
      submittedAddress: 'Restricted Forest Core, Idukki',
      imageMediaIds: ['core-danger.jpg'],
    });

    const res = await makeRequest<TestApiResponse<{ submission: { submissionStatus: string; reviewNotes: string; reviewedBy: string; reviewedAt: string } }>>(
      'PATCH',
      `/api/v1/admin/destination-submissions/${submission._id.toString()}/review`,
      {
        action: 'REJECT',
        reviewNotes: 'Rejected due to Forest Dept clearance restrictions in core eco-fragile zone.',
      },
      admin.token,
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data?.submission.submissionStatus, DESTINATION_SUBMISSION_STATUSES.REJECTED);
    assert.ok(res.body.data?.submission.reviewNotes.includes('Forest Dept clearance restrictions'));
    assert.strictEqual(res.body.data?.submission.reviewedBy, admin.account._id.toString());
    assert.ok(res.body.data?.submission.reviewedAt);
  });

  await t.test('33. Repeated approval does not create duplicate destinations (idempotency)', async () => {
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.VERIFY_DESTINATIONS,
    ]);
    const tourist = await createTestPrincipal(ACCOUNT_TYPES.TOURIST);

    const submission = await mockDestRepo.createSubmission({
      submittedBy: tourist.account._id,
      name: 'Idempotent Viewpoint',
      description: 'Testing idempotent retry behavior on admin approval workflow.',
      submittedLocation: { type: 'Point', coordinates: [76.4, 9.5] },
      submittedAddress: 'Scenic Way, Kottayam',
      imageMediaIds: ['photo-1.jpg'],
    });

    // First approval call
    const firstRes = await makeRequest<TestApiResponse<{ destination: { id: string } }>>(
      'PATCH',
      `/api/v1/admin/destination-submissions/${submission._id.toString()}/review`,
      { action: 'APPROVE' },
      admin.token,
    );
    assert.strictEqual(firstRes.status, 200);
    const destinationId = firstRes.body.data?.destination.id;

    const destCountBefore = mockDestRepo.destinations.size;

    // Second approval retry call
    const secondRes = await makeRequest<TestApiResponse<{ destination: { id: string } }>>(
      'PATCH',
      `/api/v1/admin/destination-submissions/${submission._id.toString()}/review`,
      { action: 'APPROVE' },
      admin.token,
    );
    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.body.data?.destination.id, destinationId);

    const destCountAfter = mockDestRepo.destinations.size;
    assert.strictEqual(destCountAfter, destCountBefore, 'Must not create duplicate destination on repeated approval');
  });

  await t.test('34. Publishing an unverified destination is rejected (400)', async () => {
    const admin = await createTestPrincipal(ACCOUNT_TYPES.ADMIN, ACCOUNT_STATUSES.ACTIVE, [
      ADMIN_PERMISSIONS.MANAGE_DESTINATIONS,
    ]);

    // Create destination that is PENDING verification
    const unverifiedDest = await mockDestRepo.createDestination({
      name: 'Unverified Cave',
      district: 'Kozhikode',
      description: 'Cave exploration site awaiting government safety inspection.',
      location: { type: 'Point', coordinates: [75.8, 11.3] },
      address: 'Cave Road, Kozhikode',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse>(
      'PATCH',
      `/api/v1/admin/destinations/${unverifiedDest._id.toString()}/publish`,
      {},
      admin.token,
    );

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, 'CANNOT_PUBLISH_UNVERIFIED_DESTINATION');
  });

  await t.test('35. Search endpoint returns matching verified published destinations', async () => {
    await mockDestRepo.createDestination({
      name: 'Munnar Eravikulam National Park',
      district: 'Idukki',
      description: 'Home to the endangered Nilgiri Tahr and the blooming Neelakurinji flowers.',
      location: { type: 'Point', coordinates: [77.0601, 10.1983] },
      address: 'Eravikulam, Munnar, Idukki 685612',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse<Array<{ name: string }>>>(
      'GET',
      '/api/v1/destinations/search?q=Eravikulam',
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    const names = res.body.data?.map((d) => d.name) || [];
    assert.ok(names.includes('Munnar Eravikulam National Park'));
  });

  await t.test('36. Slug detail lookup for draft destination returns 404', async () => {
    const draftDest = await mockDestRepo.createDestination({
      name: 'Private Hidden Glade',
      slug: 'private-hidden-glade',
      district: 'Wayanad',
      description: 'Validly verified spot that is still in draft state.',
      location: { type: 'Point', coordinates: [76.1, 11.6] },
      address: 'Wayanad woods',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdBy: new Types.ObjectId(),
    });

    const res = await makeRequest<TestApiResponse>(
      'GET',
      `/api/v1/destinations/${draftDest.slug}`,
    );

    assert.strictEqual(res.status, 404, 'Draft destination must return 404 on public slug lookup');
    assert.strictEqual(res.body.error?.code, 'DESTINATION_NOT_FOUND');
  });
});
