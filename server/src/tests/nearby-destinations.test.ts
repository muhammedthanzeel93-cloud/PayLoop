import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { jwtService } from '../shared/security/jwt.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { destinationsService } from '../modules/destinations/destinations.service';
import { DestinationsRepository } from '../modules/destinations/destinations.repository';
import { mediaService } from '../modules/media/media.service';
import { MediaRepository } from '../modules/media/media.repository';
import { IMediaDocument } from '../modules/media/media.model';
import { MockStorageProvider } from '../modules/media/storage.interface';
import {
  AuthRepository,
  CreateAccountInput,
  CreateTouristProfileInput,
} from '../modules/auth/auth.repository';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  DESTINATION_PUBLICATION_STATUSES,
  ADMIN_PERMISSIONS,
  ADMIN_LEVELS,
} from '@kerala-tourism/constants';
import {
  IDestinationDocument,
  IDestinationCategoryDocument,
  IAccountDocument,
  ITouristProfileDocument,
  IAdminProfileDocument,
} from '../shared/models';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { Types } from 'mongoose';
import { NearbyDestinationQueryInput } from '../modules/destinations/destinations.types';
import {
  NearbyDestinationDto,
  MediaDto,
  MapConfigDto,
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

/**
 * Haversine distance calculation in kilometers
 */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * High-Speed In-Memory Auth Repository
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
      adminLevel: profile.adminLevel || ADMIN_LEVELS.DISTRICT_OFFICER,
      mfaEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAdminProfileDocument;
    this.adminProfiles.set(accountId, doc);
    return doc;
  }
}

/**
 * High-Speed In-Memory Destination Repository with Geospatial Nearby Discovery
 */
class InMemoryDestinationsRepository extends DestinationsRepository {
  public destinations: Map<string, IDestinationDocument> = new Map();
  public categories: Map<string, IDestinationCategoryDocument> = new Map();

  public override async findDestinationById(id: string | Types.ObjectId): Promise<IDestinationDocument | null> {
    return this.destinations.get(id.toString()) || null;
  }

  public override async findNearbyDestinations(
    query: NearbyDestinationQueryInput,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const maxRadiusKm = query.radiusKm || 25;

    // 1. Filter only VERIFIED & PUBLISHED
    let list = Array.from(this.destinations.values()).filter(
      (d) =>
        d.verificationStatus === DESTINATION_VERIFICATION_STATUSES.VERIFIED &&
        d.publicationStatus === DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    );

    // 2. Filter by categoryId if provided
    if (query.categoryId) {
      list = list.filter((d) =>
        (d.categoryIds || []).some((id) => id.toString() === query.categoryId),
      );
    }

    // 3. Compute spherical distance for each destination
    const withDistance = list
      .map((d) => {
        const [lng, lat] = d.location.coordinates;
        const distKm = haversineDistanceKm(query.latitude, query.longitude, lat, lng);
        return {
          ...d,
          _id: d._id,
          name: d.name,
          slug: d.slug,
          description: d.description,
          categoryIds: d.categoryIds,
          location: d.location,
          address: d.address,
          district: d.district,
          images: d.images,
          facilities: d.facilities,
          entryFee: d.entryFee,
          verificationStatus: d.verificationStatus,
          publicationStatus: d.publicationStatus,
          createdBy: d.createdBy,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          distanceMeters: Math.round(distKm * 1000),
          distanceKm: Number(distKm.toFixed(2)),
        };
      })
      .filter((item) => item.distanceKm <= maxRadiusKm);

    // 4. Sort nearest-first
    withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const total = withDistance.length;
    const page = query.page || 1;
    const limit = query.limit || 10;
    const start = (page - 1) * limit;
    const items = withDistance.slice(start, start + limit);

    return { items, total };
  }

  public override async createDestination(
    data: Partial<IDestinationDocument>,
  ): Promise<IDestinationDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      name: data.name!,
      slug: data.slug || data.name!.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: data.description!,
      shortDescription: data.shortDescription,
      categoryIds: data.categoryIds || [],
      location: data.location!,
      address: data.address!,
      district: data.district!,
      locality: data.locality,
      images: data.images || [],
      facilities: data.facilities || [],
      bestTimeToVisit: data.bestTimeToVisit,
      entryFee: data.entryFee || { amount: 0, currency: 'INR', isFree: true },
      verificationStatus: data.verificationStatus || DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: data.publicationStatus || DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdBy: data.createdBy!,
      verifiedBy: data.verifiedBy,
      publishedAt: data.publishedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      save: async function () {
        return this;
      },
    } as unknown as IDestinationDocument;

    this.destinations.set(id.toString(), doc);
    return doc;
  }

  public override async updateDestination(
    id: string | Types.ObjectId,
    updates: Partial<IDestinationDocument>,
  ): Promise<IDestinationDocument | null> {
    const dest = this.destinations.get(id.toString());
    if (!dest) return null;
    Object.assign(dest, updates, { updatedAt: new Date() });
    return dest;
  }
}

/**
 * High-Speed In-Memory Media Repository
 */
class InMemoryMediaRepository extends MediaRepository {
  public mediaMap: Map<string, IMediaDocument> = new Map();

  public override async createMedia(data: Partial<IMediaDocument>): Promise<IMediaDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      uploaderAccountId: data.uploaderAccountId!,
      destinationId: data.destinationId,
      storageKey: data.storageKey!,
      url: data.url!,
      mimeType: data.mimeType!,
      fileSizeBytes: data.fileSizeBytes!,
      dimensions: data.dimensions,
      isPrimary: data.isPrimary ?? false,
      displayOrder: data.displayOrder ?? 0,
      isModerated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IMediaDocument;

    this.mediaMap.set(id.toString(), doc);
    return doc;
  }

  public override async findById(id: string | Types.ObjectId): Promise<IMediaDocument | null> {
    return this.mediaMap.get(id.toString()) || null;
  }

  public override async findByStorageKey(storageKey: string): Promise<IMediaDocument | null> {
    for (const m of this.mediaMap.values()) {
      if (m.storageKey === storageKey) return m;
    }
    return null;
  }

  public override async findByDestination(
    destinationId: string | Types.ObjectId,
  ): Promise<IMediaDocument[]> {
    const list = Array.from(this.mediaMap.values()).filter(
      (m) => m.destinationId?.toString() === destinationId.toString(),
    );
    list.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.displayOrder - b.displayOrder;
    });
    return list;
  }

  public override async unsetPrimaryForDestination(
    destinationId: string | Types.ObjectId,
  ): Promise<void> {
    for (const m of this.mediaMap.values()) {
      if (m.destinationId?.toString() === destinationId.toString() && m.isPrimary) {
        m.isPrimary = false;
      }
    }
  }

  public override async updateMedia(
    id: string | Types.ObjectId,
    updates: Partial<IMediaDocument>,
  ): Promise<IMediaDocument | null> {
    const item = this.mediaMap.get(id.toString());
    if (!item) return null;
    Object.assign(item, updates, { updatedAt: new Date() });
    return item;
  }

  public override async deleteMedia(id: string | Types.ObjectId): Promise<IMediaDocument | null> {
    const item = this.mediaMap.get(id.toString());
    if (!item) return null;
    this.mediaMap.delete(id.toString());
    return item;
  }
}

test('Geospatial Nearby Discovery & Media Management Test Suite (Day 12)', async (t) => {
  const app = createApp();
  let authRepo: InMemoryAuthRepository;
  let destRepo: InMemoryDestinationsRepository;
  let mediaRepo: InMemoryMediaRepository;
  let storageProvider: MockStorageProvider;

  let adminToken: string;
  let adminId: string;
  let touristCreatorToken: string;
  let touristCreatorId: string;
  let touristOtherToken: string;
  let touristOtherId: string;

  let heritageCategoryId: Types.ObjectId;
  let beachCategoryId: Types.ObjectId;

  let mattancherryId: string;
  let fortKochiId: string;

  beforeEach(async () => {
    resetRateLimiter();
    authRepo = new InMemoryAuthRepository();
    destRepo = new InMemoryDestinationsRepository();
    mediaRepo = new InMemoryMediaRepository();
    storageProvider = new MockStorageProvider();

    authMiddleware.setRepository(authRepo);
    authorizationMiddleware.setRepository(authRepo);
    destinationsService.setRepository(destRepo);
    mediaService.setStorageProvider(storageProvider);
    mediaService.setRepository(mediaRepo);
    mediaService.setDestinationsRepository(destRepo);
    mediaService.setAuthRepository(authRepo);

    // Create Admin Account with MANAGE_DESTINATIONS
    const adminAccount = await authRepo.createAccount({
      email: 'admin.heritage@kerala.gov.in',
      passwordHash: 'argon_admin_hash_123',
      accountType: ACCOUNT_TYPES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    adminId = adminAccount.id;
    await authRepo.setAdminProfile(adminId, {
      displayName: 'State Tourism Officer',
      permissions: [ADMIN_PERMISSIONS.MANAGE_DESTINATIONS],
      adminLevel: ADMIN_LEVELS.DISTRICT_OFFICER,
    });
    adminToken = jwtService.signAccessToken({
      id: adminId,
      email: adminAccount.email,
      accountType: ACCOUNT_TYPES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    });

    // Create Tourist 1 (Destination Creator)
    const tourist1 = await authRepo.createAccount({
      email: 'creator.tourist@example.com',
      passwordHash: 'argon_tourist_1_hash',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    touristCreatorId = tourist1.id;
    await authRepo.createTouristProfile({
      accountId: tourist1._id,
      firstName: 'Rahul',
      lastName: 'Nair',
    });
    touristCreatorToken = jwtService.signAccessToken({
      id: touristCreatorId,
      email: tourist1.email,
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });

    // Create Tourist 2 (Other Tourist)
    const tourist2 = await authRepo.createAccount({
      email: 'other.tourist@example.com',
      passwordHash: 'argon_tourist_2_hash',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    touristOtherId = tourist2.id;
    await authRepo.createTouristProfile({
      accountId: tourist2._id,
      firstName: 'Ananya',
      lastName: 'Menon',
    });
    touristOtherToken = jwtService.signAccessToken({
      id: touristOtherId,
      email: tourist2.email,
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });

    heritageCategoryId = new Types.ObjectId();
    beachCategoryId = new Types.ObjectId();

    // 1. Mattancherry Palace (Lat: 9.9583, Lng: 76.2592) - VERIFIED & PUBLISHED (~3.1 km from Kochi center)
    const dest1 = await destRepo.createDestination({
      name: 'Mattancherry Palace',
      slug: 'mattancherry-palace',
      description: 'Portuguese palace in Mattancherry, Kochi featuring Kerala murals.',
      categoryIds: [heritageCategoryId],
      location: { type: 'Point', coordinates: [76.2592, 9.9583] },
      address: 'Mattancherry, Kochi, Kerala 682002',
      district: 'Ernakulam',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(touristCreatorId),
      publishedAt: new Date(),
    });
    mattancherryId = dest1.id;

    // 2. Fort Kochi Beach (Lat: 9.9658, Lng: 76.2415) - VERIFIED & PUBLISHED (~4.8 km from Kochi center)
    const dest2 = await destRepo.createDestination({
      name: 'Fort Kochi Beach',
      slug: 'fort-kochi-beach',
      description: 'Tranquil beach along the Arabian Sea with Chinese fishing nets.',
      categoryIds: [beachCategoryId],
      location: { type: 'Point', coordinates: [76.2415, 9.9658] },
      address: 'Fort Kochi, Kochi, Kerala 682001',
      district: 'Ernakulam',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(adminId),
      publishedAt: new Date(),
    });
    fortKochiId = dest2.id;

    // 3. Munnar Tea Gardens (Lat: 10.0889, Lng: 77.0595) - VERIFIED & PUBLISHED (~90 km from Kochi center)
    await destRepo.createDestination({
      name: 'Munnar Tea Gardens',
      slug: 'munnar-tea-gardens',
      description: 'Lush green tea estates situated in the Western Ghats mountain range.',
      categoryIds: [heritageCategoryId],
      location: { type: 'Point', coordinates: [77.0595, 10.0889] },
      address: 'Munnar, Idukki, Kerala 685612',
      district: 'Idukki',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(adminId),
      publishedAt: new Date(),
    });

    // 4. Marine Drive Promenade (Lat: 9.9784, Lng: 76.2764) - DRAFT & VERIFIED (~5 km from Kochi center)
    await destRepo.createDestination({
      name: 'Marine Drive Promenade',
      slug: 'marine-drive-promenade',
      description: 'Scenic promenade facing the backwaters of Kochi.',
      categoryIds: [heritageCategoryId],
      location: { type: 'Point', coordinates: [76.2764, 9.9784] },
      address: 'Marine Drive, Ernakulam, Kerala 682031',
      district: 'Ernakulam',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT, // Draft!
      createdBy: new Types.ObjectId(adminId),
    });

    // 5. Cherai Beach Archived (Lat: 10.1416, Lng: 76.1783) - ARCHIVED & VERIFIED (~25 km from Kochi)
    await destRepo.createDestination({
      name: 'Cherai Beach Archived',
      slug: 'cherai-beach-archived',
      description: 'Shallow golden beach located in Vypin island.',
      categoryIds: [beachCategoryId],
      location: { type: 'Point', coordinates: [76.1783, 10.1416] },
      address: 'Cherai, Ernakulam, Kerala 683514',
      district: 'Ernakulam',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.ARCHIVED, // Archived!
      createdBy: new Types.ObjectId(adminId),
    });

    // 6. Bolgatty Palace Pending (Lat: 9.9892, Lng: 76.2655) - PUBLISHED & PENDING (~6 km from Kochi)
    await destRepo.createDestination({
      name: 'Bolgatty Palace Pending',
      slug: 'bolgatty-palace-pending',
      description: 'Dutch palace built by Dutch traders in 1744.',
      categoryIds: [heritageCategoryId],
      location: { type: 'Point', coordinates: [76.2655, 9.9892] },
      address: 'Mulavukad, Kochi, Kerala 682504',
      district: 'Ernakulam',
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING, // Pending verification!
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(adminId),
    });
  });

  const makeRequest = (method: string, url: string, body?: unknown, token?: string) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    return dispatchRequest(app, {
      method,
      url,
      headers,
      body,
    });
  };

  // ==============================================================================
  // STEP 2: NEARBY DESTINATION DISCOVERY TESTS (1 - 14)
  // ==============================================================================

  await t.test('1. Valid nearby search returns destinations within radius', async () => {
    // Search from central Kochi (Lat: 9.9312, Lng: 76.2673, Radius: 10km)
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=10',
    );
    assert.strictEqual(res.status, 200);
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
    // Mattancherry (~3.1km) and Fort Kochi (~4.8km) are within 10km; Munnar (~90km) is not.
    assert.strictEqual(body.data.length, 2);
  });

  await t.test('2. Invalid latitude (> 90 or < -90) returns 400 Bad Request', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=95.5&longitude=76.2673&radiusKm=10',
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('3. Invalid longitude (> 180 or < -180) returns 400 Bad Request', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=185.0&radiusKm=10',
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('4. Invalid radius (<= 0 or non-numeric) returns 400 Bad Request', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=-5',
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('5. Radius exceeding maximum (> 100 km) returns 400 Bad Request', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=120',
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('6. Category filtering returns only destinations matching categoryId', async () => {
    const res = await makeRequest(
      'GET',
      `/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=25&categoryId=${beachCategoryId.toString()}`,
    );
    assert.strictEqual(res.status, 200);
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data?.length, 1);
    assert.strictEqual(body.data![0].name, 'Fort Kochi Beach');
  });

  await t.test('7. Pagination (page and limit) works on nearby results', async () => {
    // 2 results within 25km. With limit=1, page 1 returns 1, page 2 returns 1.
    const resPage1 = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=25&page=1&limit=1',
    );
    assert.strictEqual(resPage1.status, 200);
    const body1 = resPage1.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.strictEqual(body1.data?.length, 1);
    assert.strictEqual(body1.pagination?.page, 1);
    assert.strictEqual(body1.pagination?.limit, 1);
    assert.strictEqual(body1.pagination?.total, 2);

    const resPage2 = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=25&page=2&limit=1',
    );
    assert.strictEqual(resPage2.status, 200);
    const body2 = resPage2.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.strictEqual(body2.data?.length, 1);
    assert.strictEqual(body2.pagination?.page, 2);
    assert.notStrictEqual(body1.data![0].id, body2.data![0].id);
  });

  await t.test('8. Nearest-first sorting puts closest destination first', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=25',
    );
    assert.strictEqual(res.status, 200);
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.strictEqual(body.data?.length, 2);
    // Mattancherry is ~3.1km away, Fort Kochi is ~4.8km away
    assert.strictEqual(body.data![0].name, 'Mattancherry Palace');
    assert.strictEqual(body.data![1].name, 'Fort Kochi Beach');
    assert.ok(body.data![0].distanceKm < body.data![1].distanceKm);
  });

  await t.test('9. Distance calculation returns distanceKm accurately', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=10',
    );
    assert.strictEqual(res.status, 200);
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.ok(typeof body.data![0].distanceKm === 'number');
    assert.ok(body.data![0].distanceKm > 2.0 && body.data![0].distanceKm < 4.0);
  });

  await t.test('10. Exclusion of draft destinations from nearby results', async () => {
    // Marine Drive is ~5km from Kochi, but is in DRAFT state
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=15',
    );
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    const names = body.data!.map((d) => d.name);
    assert.strictEqual(names.includes('Marine Drive Promenade'), false);
  });

  await t.test('11. Exclusion of archived destinations from nearby results', async () => {
    // Cherai Beach is in ARCHIVED state
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=35',
    );
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    const names = body.data!.map((d) => d.name);
    assert.strictEqual(names.includes('Cherai Beach Archived'), false);
  });

  await t.test('12. Exclusion of unverified (pending) destinations from nearby results', async () => {
    // Bolgatty Palace is ~6km away but verificationStatus is PENDING
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=15',
    );
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    const names = body.data!.map((d) => d.name);
    assert.strictEqual(names.includes('Bolgatty Palace Pending'), false);
  });

  await t.test('13. Empty nearby results when coordinates have no destinations within radius', async () => {
    // Coordinates far out at sea or north of Kerala with small radius
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=8.20&longitude=75.00&radiusKm=5',
    );
    assert.strictEqual(res.status, 200);
    const body = res.body as TestApiResponse<NearbyDestinationDto[]>;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data?.length, 0);
    assert.strictEqual(body.pagination?.total, 0);
  });

  await t.test('14. Invalid category ID returns 400 Bad Request', async () => {
    const res = await makeRequest(
      'GET',
      '/api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=25&categoryId=not-a-mongo-id',
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  // ==============================================================================
  // STEP 5: DESTINATION MEDIA MANAGEMENT TESTS (15 - 20)
  // ==============================================================================

  await t.test('15. Valid image metadata successfully attached by destination creator', async () => {
    const payload = {
      storageKey: 'destinations/mattancherry/mural-art.webp',
      url: 'https://cdn.keralatourism.org/media/destinations/mattancherry/mural-art.webp',
      mimeType: 'image/webp',
      fileSizeBytes: 245000,
      dimensions: { width: 1920, height: 1080 },
      isPrimary: true,
      displayOrder: 1,
    };

    const res = await makeRequest(
      'POST',
      `/api/v1/destinations/${mattancherryId}/media`,
      payload,
      touristCreatorToken,
    );
    assert.strictEqual(res.status, 201);
    const body = res.body as TestApiResponse<MediaDto>;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data?.storageKey, payload.storageKey);
    assert.strictEqual(body.data?.isPrimary, true);
  });

  await t.test('16. Unsupported MIME type (e.g. application/pdf) returns 400 Bad Request', async () => {
    const payload = {
      storageKey: 'destinations/mattancherry/brochure.pdf',
      url: 'https://cdn.keralatourism.org/media/destinations/mattancherry/brochure.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 150000,
    };

    const res = await makeRequest(
      'POST',
      `/api/v1/destinations/${mattancherryId}/media`,
      payload,
      touristCreatorToken,
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('17. File exceeding size limit (> 5MB) returns 400 Bad Request', async () => {
    const payload = {
      storageKey: 'destinations/mattancherry/huge-raw.png',
      url: 'https://cdn.keralatourism.org/media/destinations/mattancherry/huge-raw.png',
      mimeType: 'image/png',
      fileSizeBytes: 6 * 1024 * 1024, // 6 MB (Limit: 5MB)
    };

    const res = await makeRequest(
      'POST',
      `/api/v1/destinations/${mattancherryId}/media`,
      payload,
      touristCreatorToken,
    );
    assert.strictEqual(res.status, 400);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'VALIDATION_ERROR');
  });

  await t.test('18. Unauthorized media attachment by non-owner tourist returns 403 Forbidden', async () => {
    const payload = {
      storageKey: 'destinations/mattancherry/unauthorized-photo.jpg',
      url: 'https://cdn.keralatourism.org/media/destinations/mattancherry/unauthorized-photo.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 180000,
    };

    // touristOther is not the creator of Mattancherry Palace and not an admin
    const res = await makeRequest(
      'POST',
      `/api/v1/destinations/${mattancherryId}/media`,
      payload,
      touristOtherToken,
    );
    assert.strictEqual(res.status, 403);
    const body = res.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'FORBIDDEN');
  });

  await t.test('19. Unauthorized primary-image modification by non-owner returns 403 Forbidden', async () => {
    // First creator attaches media
    const attachRes = await makeRequest(
      'POST',
      `/api/v1/destinations/${mattancherryId}/media`,
      {
        storageKey: 'destinations/mattancherry/front-view.jpg',
        url: 'https://cdn.keralatourism.org/media/destinations/mattancherry/front-view.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 120000,
        isPrimary: false,
      },
      touristCreatorToken,
    );
    const mediaId = (attachRes.body as TestApiResponse<MediaDto>).data!.id;

    // Unauthorized tourist attempts to set as primary
    const patchRes = await makeRequest(
      'PATCH',
      `/api/v1/destinations/${mattancherryId}/media/${mediaId}`,
      { isPrimary: true },
      touristOtherToken,
    );
    assert.strictEqual(patchRes.status, 403);
    const body = patchRes.body as TestApiResponse;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'FORBIDDEN');
  });

  await t.test('20. Valid authorized media association by Admin with MANAGE_DESTINATIONS', async () => {
    const payload = {
      storageKey: 'destinations/fort-kochi/nets-at-sunset.webp',
      url: 'https://cdn.keralatourism.org/media/destinations/fort-kochi/nets-at-sunset.webp',
      mimeType: 'image/webp',
      fileSizeBytes: 310000,
      isPrimary: true,
      displayOrder: 1,
    };

    const res = await makeRequest(
      'POST',
      `/api/v1/destinations/${fortKochiId}/media`,
      payload,
      adminToken,
    );
    assert.strictEqual(res.status, 201);
    const body = res.body as TestApiResponse<MediaDto>;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data?.isPrimary, true);

    // Public list media endpoint returns this media
    const listRes = await makeRequest('GET', `/api/v1/destinations/${fortKochiId}/media`);
    assert.strictEqual(listRes.status, 200);
    const listBody = listRes.body as TestApiResponse<MediaDto[]>;
    assert.strictEqual(listBody.data?.length, 1);
    assert.strictEqual(listBody.data![0].storageKey, payload.storageKey);
  });

  await t.test('21. Map config endpoint (/api/v1/maps/config) returns provider config without secret keys', async () => {
    const res = await makeRequest('GET', '/api/v1/maps/config');
    assert.strictEqual(res.status, 200);
    const body = res.body as TestApiResponse<MapConfigDto>;
    assert.strictEqual(body.success, true);
    assert.ok(body.data?.provider);
    assert.ok(body.data?.defaultCenter);
    assert.ok(body.data?.bounds);
    // Secret keys must never be in client response
    assert.strictEqual((body.data as unknown as Record<string, unknown>).apiKey, undefined);
    assert.strictEqual((body.data as unknown as Record<string, unknown>).secret, undefined);
  });
});
