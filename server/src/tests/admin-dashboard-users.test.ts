import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { ClientSession, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  BUSINESS_TYPES,
  PREFERRED_LANGUAGES,
  SESSION_REVOCATION_REASONS,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import type {
  AccountStatus,
  AccountType,
  AdminDashboardOverviewDto,
  AdminLevel,
  AdminPermission,
  AuditLogEntryDto,
  BusinessType,
  VerificationStatus,
} from '@kerala-tourism/shared-types';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import {
  AdminRepository,
  adminRepository,
} from '../modules/admin/admin.repository';
import { adminService } from '../modules/admin/admin.service';
import type {
  SafeAccountLean,
  SafeAdminProfileLean,
  TransitionAccountStatusParams,
} from '../modules/admin/admin.types';
import type { AdminUsersQueryInput } from '../modules/admin/admin.validation';
import { AuditLogModel } from '../modules/admin/audit-log.model';
import {
  AuditLogService,
  auditLogService,
  RecordAdminAuditInput,
  sanitizeAuditStateSnapshot,
  sanitizeAuditText,
} from '../modules/admin/audit-log.service';
import { AuthRepository } from '../modules/auth/auth.repository';
import {
  IAccountDocument,
  IAdminProfileDocument,
  IBusinessProfileDocument,
  ITouristProfileDocument,
} from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
import { dispatchRequest } from './testUtils';

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

interface StoredSession {
  id: string;
  accountId: string;
  revokedAt: Date | null;
  revocationReason: string | null;
}

class InMemoryAuthRepo extends AuthRepository {
  public accounts = new Map<string, IAccountDocument>();
  public adminProfiles = new Map<string, IAdminProfileDocument>();
  public touristProfiles = new Map<string, ITouristProfileDocument>();
  public businessProfiles = new Map<string, IBusinessProfileDocument>();

  public override async findAccountById(
    id: Types.ObjectId | string,
  ): Promise<IAccountDocument | null> {
    return this.accounts.get(id.toString()) ?? null;
  }

  public override async findAdminProfile(
    accountId: Types.ObjectId | string,
  ): Promise<IAdminProfileDocument | null> {
    return this.adminProfiles.get(accountId.toString()) ?? null;
  }

  public override async findTouristProfile(
    accountId: Types.ObjectId | string,
  ): Promise<ITouristProfileDocument | null> {
    return this.touristProfiles.get(accountId.toString()) ?? null;
  }

  public override async findBusinessProfile(
    accountId: Types.ObjectId | string,
  ): Promise<IBusinessProfileDocument | null> {
    return this.businessProfiles.get(accountId.toString()) ?? null;
  }
}

class InMemoryAdminRepo extends AdminRepository {
  public sessions: StoredSession[] = [];
  public dashboardStats: AdminDashboardOverviewDto = {
    users: {
      total: 0,
      tourists: 0,
      businesses: 0,
      admins: 0,
      active: 0,
      suspended: 0,
    },
    destinations: {
      total: 0,
      verified: 0,
      pending: 0,
      published: 0,
    },
    social: {
      totalPosts: 0,
      pendingPosts: 0,
      publishedPosts: 0,
    },
    businessVerification: {
      pending: 0,
      verified: 0,
      rejected: 0,
    },
  };

  constructor(private readonly authStore: InMemoryAuthRepo) {
    super();
  }

  public override async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    return fn(undefined);
  }

  public override async getDashboardOverviewAggregates(): Promise<AdminDashboardOverviewDto> {
    return structuredClone(this.dashboardStats);
  }

  public override async findUsersPaginated(query: AdminUsersQueryInput) {
    const allAccounts = Array.from(this.authStore.accounts.values());
    const filtered = allAccounts.filter((acc) => {
      if (query.accountType && acc.accountType !== query.accountType) {
        return false;
      }
      if (query.status && acc.status !== query.status) {
        return false;
      }
      if (query.search) {
        const trimmed = query.search.trim();
        if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
          if (acc._id.toString() !== trimmed) {
            return false;
          }
        } else if (!acc.email.toLowerCase().includes(trimmed.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    const dir = query.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) {
        return timeDiff * dir;
      }
      return a._id.toString().localeCompare(b._id.toString()) * dir;
    });

    const skip = (query.page - 1) * query.limit;
    const sliced = filtered.slice(skip, skip + query.limit);

    const items = await this.hydrateAccountsWithProfiles(
      sliced.map((a) => this.toSafeAccountLean(a)),
    );

    return {
      items,
      total: filtered.length,
    };
  }

  public override async findSafeUserById(userId: Types.ObjectId | string) {
    const account = this.authStore.accounts.get(userId.toString());
    if (!account) {
      return null;
    }
    const [hydrated] = await this.hydrateAccountsWithProfiles([
      this.toSafeAccountLean(account),
    ]);
    return hydrated ?? null;
  }

  public override async findAccountForStatusCheck(accountId: Types.ObjectId | string) {
    const acc = this.authStore.accounts.get(accountId.toString());
    if (!acc) {
      return null;
    }
    return {
      _id: acc._id,
      accountType: acc.accountType,
      status: acc.status,
    };
  }

  public override async findAdminProfileByAccountId(
    accountId: Types.ObjectId | string,
  ): Promise<SafeAdminProfileLean | null> {
    const profile = this.authStore.adminProfiles.get(accountId.toString());
    if (!profile) {
      return null;
    }
    return {
      _id: profile._id,
      accountId: profile.accountId,
      displayName: profile.displayName,
      adminLevel: profile.adminLevel,
      permissions: profile.permissions,
      mfaEnabled: profile.mfaEnabled,
    };
  }

  public override async transitionAccountStatusAtomic(
    params: TransitionAccountStatusParams,
  ): Promise<SafeAccountLean | null> {
    const acc = this.authStore.accounts.get(params.targetId.toString());
    if (!acc || !params.allowedCurrentStatuses.includes(acc.status)) {
      return null;
    }
    acc.status = params.nextStatus;
    acc.updatedAt = new Date();
    return this.toSafeAccountLean(acc);
  }

  public override async revokeActiveSessionsForAccount(
    accountId: Types.ObjectId | string,
    reason: string,
  ): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const s of this.sessions) {
      if (s.accountId === accountId.toString() && s.revokedAt === null) {
        s.revokedAt = now;
        s.revocationReason = reason;
        count += 1;
      }
    }
    return count;
  }

  public override async restoreAccountStatusCompensating(
    accountId: Types.ObjectId | string,
    previousStatus: AccountStatus,
  ): Promise<void> {
    const acc = this.authStore.accounts.get(accountId.toString());
    if (acc) {
      acc.status = previousStatus;
    }
  }

  public override async hydrateAccountsWithProfiles(accounts: SafeAccountLean[]) {
    return accounts.map((acc) => {
      const idStr = acc._id.toString();
      let profile = null;

      if (acc.accountType === ACCOUNT_TYPES.TOURIST) {
        const tp = this.authStore.touristProfiles.get(idStr);
        if (tp) {
          profile = {
            id: tp._id.toString(),
            firstName: tp.firstName,
            lastName: tp.lastName,
            preferredLanguage: tp.preferredLanguage,
            followersCount: tp.followersCount ?? 0,
            followingCount: tp.followingCount ?? 0,
          };
        }
      } else if (acc.accountType === ACCOUNT_TYPES.BUSINESS) {
        const bp = this.authStore.businessProfiles.get(idStr);
        if (bp) {
          profile = {
            id: bp._id.toString(),
            businessName: bp.businessName,
            businessType: bp.businessType,
            contactNumber: bp.contactNumber,
            verificationStatus: bp.verificationStatus,
            documentsCount: Array.isArray(bp.documents) ? bp.documents.length : 0,
          };
        }
      } else if (acc.accountType === ACCOUNT_TYPES.ADMIN) {
        const ap = this.authStore.adminProfiles.get(idStr);
        if (ap) {
          profile = {
            id: ap._id.toString(),
            displayName: ap.displayName,
            adminLevel: ap.adminLevel,
            permissions: ap.permissions,
            mfaEnabled: Boolean(ap.mfaEnabled),
          };
        }
      }

      return {
        id: idStr,
        email: acc.email,
        accountType: acc.accountType,
        status: acc.status,
        emailVerifiedAt: acc.emailVerifiedAt ? new Date(acc.emailVerifiedAt).toISOString() : null,
        lastLoginAt: acc.lastLoginAt ? new Date(acc.lastLoginAt).toISOString() : null,
        createdAt: new Date(acc.createdAt).toISOString(),
        updatedAt: new Date(acc.updatedAt).toISOString(),
        profile,
      };
    });
  }

  private toSafeAccountLean(acc: IAccountDocument): SafeAccountLean {
    return {
      _id: acc._id,
      email: acc.email,
      accountType: acc.accountType,
      status: acc.status,
      emailVerifiedAt: acc.emailVerifiedAt,
      lastLoginAt: acc.lastLoginAt,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    };
  }
}

class InMemoryAuditService extends AuditLogService {
  public logs: AuditLogEntryDto[] = [];

  public override async recordAdminAction(
    input: RecordAdminAuditInput,
  ): Promise<AuditLogEntryDto> {
    const entry: AuditLogEntryDto = {
      id: new Types.ObjectId().toString(),
      actorAccountId: input.actorAccountId.toString(),
      actorAccountType: input.actorAccountType,
      actorAdminLevel: input.actorAdminLevel,
      action: input.action,
      targetEntityId: input.targetEntityId.toString(),
      targetEntityType: input.targetEntityType ?? 'ACCOUNT',
      reason: input.reason.trim(),
      beforeState: { ...input.beforeState },
      afterState: { ...input.afterState },
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      timestamp: new Date().toISOString(),
    };
    this.logs.push(entry);
    return entry;
  }
}

test('Day 17: Admin Dashboard Overview & User Management Security Suite', async (t) => {
  const app = createApp();
  let authStore: InMemoryAuthRepo;
  let adminRepo: InMemoryAdminRepo;
  let auditStore: InMemoryAuditService;

  const seedAccount = (params: {
    email: string;
    accountType: AccountType;
    status?: AccountStatus;
    createdAt?: Date;
    lastLoginAt?: Date | null;
    adminLevel?: AdminLevel;
    permissions?: AdminPermission[];
    omitAdminProfile?: boolean;
    businessVerificationStatus?: VerificationStatus;
    businessType?: BusinessType;
  }): { id: string; token: string } => {
    const id = new Types.ObjectId();
    const createdAt = params.createdAt ?? new Date();
    const status = params.status ?? ACCOUNT_STATUSES.ACTIVE;

    const accountDoc = {
      _id: id,
      email: params.email.toLowerCase(),
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$SUPER_SECRET_PASSWORD_HASH',
      accountType: params.accountType,
      status,
      emailVerifiedAt: null,
      lastLoginAt: params.lastLoginAt ?? null,
      createdAt,
      updatedAt: createdAt,
    } as unknown as IAccountDocument;

    authStore.accounts.set(id.toString(), accountDoc);

    if (params.accountType === ACCOUNT_TYPES.TOURIST) {
      authStore.touristProfiles.set(id.toString(), {
        _id: new Types.ObjectId(),
        accountId: id,
        firstName: 'Asha',
        lastName: 'Menon',
        preferredLanguage: PREFERRED_LANGUAGES.EN,
        followersCount: 12,
        followingCount: 5,
        phoneNumber: '+919876543210',
        createdAt,
        updatedAt: createdAt,
      } as unknown as ITouristProfileDocument);
    } else if (params.accountType === ACCOUNT_TYPES.BUSINESS) {
      authStore.businessProfiles.set(id.toString(), {
        _id: new Types.ObjectId(),
        accountId: id,
        businessName: 'Backwater Bliss Homestay',
        businessType: params.businessType ?? BUSINESS_TYPES.HOMESTAY,
        contactNumber: '+914842223344',
        verificationStatus: params.businessVerificationStatus ?? VERIFICATION_STATUSES.VERIFIED,
        documents: [
          {
            documentType: 'GST_CERTIFICATE',
            storageKey: 'kyc/private/secret-gst-doc-key.pdf',
            fileName: 'gst.pdf',
            fileSize: 2048,
            mimeType: 'application/pdf',
          },
        ],
        createdAt,
        updatedAt: createdAt,
      } as unknown as IBusinessProfileDocument);
    } else if (params.accountType === ACCOUNT_TYPES.ADMIN && !params.omitAdminProfile) {
      authStore.adminProfiles.set(id.toString(), {
        _id: new Types.ObjectId(),
        accountId: id,
        displayName: 'Directorate Officer',
        adminLevel: params.adminLevel ?? ADMIN_LEVELS.SUPER_ADMIN,
        permissions: params.permissions ?? [ADMIN_PERMISSIONS.VIEW_DASHBOARD],
        mfaEnabled: true,
        createdAt,
        updatedAt: createdAt,
      } as unknown as IAdminProfileDocument);
    }

    const token = jwtService.signAccessToken({
      id: id.toString(),
      email: accountDoc.email,
      accountType: accountDoc.accountType,
      status: accountDoc.status,
    });

    return { id: id.toString(), token };
  };

  beforeEach(() => {
    resetRateLimiter();
    authStore = new InMemoryAuthRepo();
    adminRepo = new InMemoryAdminRepo(authStore);
    auditStore = new InMemoryAuditService();

    authMiddleware.setRepository(authStore);
    authorizationMiddleware.setRepository(authStore);
    adminService.setRepository(adminRepo);
    adminService.setAuditService(auditStore);
  });

  after(() => {
    resetRateLimiter();
    authMiddleware.setRepository(new AuthRepository());
    authorizationMiddleware.setRepository(new AuthRepository());
    adminService.setRepository(adminRepository);
    adminService.setAuditService(auditLogService);
  });

  // =========================================================================
  // Dashboard Overview Tests
  // =========================================================================

  await t.test('1. Admin with VIEW_DASHBOARD retrieves overview stats and legacy /dashboard still works', async () => {
    adminRepo.dashboardStats = {
      users: { total: 10, tourists: 6, businesses: 3, admins: 1, active: 8, suspended: 1 },
      destinations: { total: 5, verified: 4, pending: 1, published: 3 },
      social: { totalPosts: 20, pendingPosts: 4, publishedPosts: 15 },
      businessVerification: { pending: 2, verified: 1, rejected: 0 },
    };

    const { token } = seedAccount({
      email: 'overview.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.VIEW_DASHBOARD, ADMIN_PERMISSIONS.VIEW_ANALYTICS],
    });

    const overviewRes = await dispatchRequest<TestApiResponse<AdminDashboardOverviewDto>>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(overviewRes.status, 200);
    assert.equal(overviewRes.body.success, true);
    assert.deepEqual(overviewRes.body.data, adminRepo.dashboardStats);

    const legacyRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(legacyRes.status, 200);
  });

  await t.test('2. Empty dashboard stats default safely to 0 without leaking internal errors', async () => {
    const { token } = seedAccount({
      email: 'empty.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.VIEW_DASHBOARD],
    });

    const res = await dispatchRequest<TestApiResponse<AdminDashboardOverviewDto>>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data?.users.total, 0);
    assert.equal(res.body.data?.destinations.published, 0);
    assert.equal(res.body.data?.social.totalPosts, 0);
    assert.equal(res.body.data?.businessVerification.pending, 0);
  });

  await t.test('3. Unauthenticated, Tourist, Business, Suspended Admin, and lacking-permission Admin are rejected on overview', async () => {
    const tourist = seedAccount({ email: 't@example.com', accountType: ACCOUNT_TYPES.TOURIST });
    const business = seedAccount({ email: 'b@example.com', accountType: ACCOUNT_TYPES.BUSINESS });
    const suspendedAdmin = seedAccount({
      email: 'susp.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      status: ACCOUNT_STATUSES.SUSPENDED,
      permissions: [ADMIN_PERMISSIONS.VIEW_DASHBOARD],
    });
    const analyticsOnlyAdmin = seedAccount({
      email: 'analytics.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.VIEW_ANALYTICS],
    });

    const unauth = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
    });
    assert.equal(unauth.status, 401);

    const touristRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(touristRes.status, 403);
    assert.equal(touristRes.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');

    const bizRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${business.token}` },
    });
    assert.equal(bizRes.status, 403);
    assert.equal(bizRes.body.error?.code, 'FORBIDDEN_ACCOUNT_TYPE');

    const suspRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${suspendedAdmin.token}` },
    });
    assert.equal(suspRes.status, 403);
    assert.equal(suspRes.body.error?.code, 'ACCOUNT_SUSPENDED');

    const forbiddenAdminRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${analyticsOnlyAdmin.token}` },
    });
    assert.equal(forbiddenAdminRes.status, 403);
    assert.equal(forbiddenAdminRes.body.error?.code, 'INSUFFICIENT_PERMISSIONS');
  });

  // =========================================================================
  // List Users & Get User Details Tests
  // =========================================================================

  await t.test('4. Admin with VIEW_USERS or MANAGE_USERS lists users with pagination, sorting, filters, and search', async () => {
    const viewAdmin = seedAccount({
      email: 'viewer@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.VIEW_USERS],
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
    const t1 = seedAccount({
      email: 'ananya.nair@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
      createdAt: new Date('2026-10-02T10:00:00Z'),
    });
    seedAccount({
      email: 'rahul.das@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.SUSPENDED,
      createdAt: new Date('2026-10-03T10:00:00Z'),
    });
    seedAccount({
      email: 'resort.owner@kerala.travel',
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.ACTIVE,
      createdAt: new Date('2026-10-04T10:00:00Z'),
    });

    // Pagination + ascending sort
    const page1 = await dispatchRequest<TestApiResponse<{ items: Array<{ id: string; email: string }>; pagination: { total: number; totalPages: number; page: number; limit: number } }>>(app, {
      method: 'GET',
      url: '/api/v1/admin/users?page=1&limit=2&sortOrder=asc',
      headers: { authorization: `Bearer ${viewAdmin.token}` },
    });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.data?.pagination.total, 4);
    assert.equal(page1.body.data?.pagination.totalPages, 2);
    assert.equal(page1.body.data?.items[0]?.email, 'viewer@kerala.gov.in');
    assert.equal(page1.body.data?.items[1]?.email, 'ananya.nair@example.com');

    // Filter by accountType & status
    const filtered = await dispatchRequest<TestApiResponse<{ items: Array<{ email: string }> }>>(app, {
      method: 'GET',
      url: '/api/v1/admin/users?accountType=TOURIST&status=SUSPENDED',
      headers: { authorization: `Bearer ${viewAdmin.token}` },
    });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.data?.items.length, 1);
    assert.equal(filtered.body.data?.items[0]?.email, 'rahul.das@example.com');

    // Search by email
    const emailSearch = await dispatchRequest<TestApiResponse<{ items: Array<{ email: string }> }>>(app, {
      method: 'GET',
      url: '/api/v1/admin/users?search=kerala.travel',
      headers: { authorization: `Bearer ${viewAdmin.token}` },
    });
    assert.equal(emailSearch.status, 200);
    assert.equal(emailSearch.body.data?.items.length, 1);
    assert.equal(emailSearch.body.data?.items[0]?.email, 'resort.owner@kerala.travel');

    // Search by exact ObjectId
    const idSearch = await dispatchRequest<TestApiResponse<{ items: Array<{ id: string }> }>>(app, {
      method: 'GET',
      url: `/api/v1/admin/users?search=${t1.id}`,
      headers: { authorization: `Bearer ${viewAdmin.token}` },
    });
    assert.equal(idSearch.status, 200);
    assert.equal(idSearch.body.data?.items.length, 1);
    assert.equal(idSearch.body.data?.items[0]?.id, t1.id);

    // Ensure Business documents[].storageKey and passwordHash never appear in response JSON
    const serialized = JSON.stringify(page1.body) + JSON.stringify(emailSearch.body);
    assert.equal(serialized.includes('SUPER_SECRET_PASSWORD_HASH'), false);
    assert.equal(serialized.includes('storageKey'), false);
    assert.equal(serialized.includes('secret-gst-doc-key.pdf'), false);

    // Admin without VIEW_USERS or MANAGE_USERS is denied
    const suspendOnlyAdmin = seedAccount({
      email: 'suspender@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const denied = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { authorization: `Bearer ${suspendOnlyAdmin.token}` },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error?.code, 'INSUFFICIENT_PERMISSIONS');
  });

  await t.test('5. Invalid query filters return 400 and buildUsersFilter escapes ReDoS regex metacharacters', async () => {
    const viewAdmin = seedAccount({
      email: 'filter.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.VIEW_USERS],
    });

    const invalidLimit = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/users?limit=250',
      headers: { authorization: `Bearer ${viewAdmin.token}` },
    });
    assert.equal(invalidLimit.status, 400);

    const unknownParam = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/users?sortBy=passwordHash',
      headers: { authorization: `Bearer ${viewAdmin.token}` },
    });
    assert.equal(unknownParam.status, 400);

    const mongoFilter = adminRepository.buildUsersFilter({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      search: 'user+(test).*?$',
    });
    assert.deepEqual(mongoFilter.email, {
      $regex: 'user\\+\\(test\\)\\.\\*\\?\\$',
      $options: 'i',
    });
  });

  await t.test('6. Get User Details returns safe profile summary, rejects invalid ObjectId (400), and returns 404 when missing', async () => {
    const manager = seedAccount({
      email: 'manager@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.MANAGE_USERS],
    });
    const loginTime = new Date('2026-11-11T12:00:00Z');
    const business = seedAccount({
      email: 'ayurveda@kerala.travel',
      accountType: ACCOUNT_TYPES.BUSINESS,
      lastLoginAt: loginTime,
    });

    const okRes = await dispatchRequest<TestApiResponse<{
      id: string;
      email: string;
      lastLoginAt: string;
      profile: { businessName: string; documentsCount: number; storageKey?: string };
    }>>(app, {
      method: 'GET',
      url: `/api/v1/admin/users/${business.id}`,
      headers: { authorization: `Bearer ${manager.token}` },
    });

    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.data?.id, business.id);
    assert.equal(okRes.body.data?.lastLoginAt, loginTime.toISOString());
    assert.equal(okRes.body.data?.profile.businessName, 'Backwater Bliss Homestay');
    assert.equal(okRes.body.data?.profile.documentsCount, 1);
    assert.equal(JSON.stringify(okRes.body).includes('storageKey'), false);
    assert.equal(JSON.stringify(okRes.body).includes('passwordHash'), false);

    const invalidId = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/admin/users/not-an-object-id',
      headers: { authorization: `Bearer ${manager.token}` },
    });
    assert.equal(invalidId.status, 400);

    const notFound = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: `/api/v1/admin/users/${new Types.ObjectId().toString()}`,
      headers: { authorization: `Bearer ${manager.token}` },
    });
    assert.equal(notFound.status, 404);
    assert.equal(notFound.body.error?.code, 'USER_NOT_FOUND');
  });

  // =========================================================================
  // Suspension & Security Guard Tests
  // =========================================================================

  await t.test('7. Authorized admin suspends tourist, revokes sessions, logs audit, and blocks suspended user access', async () => {
    const admin = seedAccount({
      email: 'chief@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.DISTRICT_OFFICER,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const tourist = seedAccount({
      email: 'spammer@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
    });
    adminRepo.sessions.push({
      id: 's1',
      accountId: tourist.id,
      revokedAt: null,
      revocationReason: null,
    });

    const res = await dispatchRequest<TestApiResponse<{
      user: { status: string };
      revokedSessionsCount: number;
      auditLog: AuditLogEntryDto;
    }>>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist.id}/suspend`,
      headers: {
        authorization: `Bearer ${admin.token}`,
        'user-agent': 'KeralaAdminConsole/1.0',
      },
      body: { reason: 'Automated spam and policy breach' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data?.user.status, ACCOUNT_STATUSES.SUSPENDED);
    assert.equal(res.body.data?.revokedSessionsCount, 1);
    assert.equal(res.body.data?.auditLog.action, ADMIN_AUDIT_ACTIONS.USER_SUSPENDED);
    assert.equal(res.body.data?.auditLog.actorAccountId, admin.id);
    assert.equal(res.body.data?.auditLog.targetEntityId, tourist.id);
    assert.equal(res.body.data?.auditLog.reason, 'Automated spam and policy breach');
    assert.equal(adminRepo.sessions[0]?.revocationReason, SESSION_REVOCATION_REASONS.ADMIN_SUSPENSION);
    assert.ok(adminRepo.sessions[0]?.revokedAt instanceof Date);

    // Existing valid JWT of suspended tourist immediately blocked on protected endpoint
    const meRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(meRes.status, 403);
    assert.equal(meRes.body.error?.code, 'ACCOUNT_SUSPENDED');
  });

  await t.test('8. Suspension rejects missing reason, unauthorized admin, self-suspension, and invalid status transitions', async () => {
    const superAdmin = seedAccount({
      email: 'sa@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.SUPER_ADMIN,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const noPermAdmin = seedAccount({
      email: 'viewer.only@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.VIEW_USERS, ADMIN_PERMISSIONS.MANAGE_USERS],
    });
    const alreadySuspended = seedAccount({
      email: 'already.susp@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.SUSPENDED,
    });
    const deactivated = seedAccount({
      email: 'deactivated@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.DEACTIVATED,
    });

    const missingReason = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${alreadySuspended.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: '   ' },
    });
    assert.equal(missingReason.status, 400);

    const extraField = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${alreadySuspended.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Valid reason', status: 'ACTIVE' },
    });
    assert.equal(extraField.status, 400);

    const noPerm = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${alreadySuspended.id}/suspend`,
      headers: { authorization: `Bearer ${noPermAdmin.token}` },
      body: { reason: 'Unauthorized admin attempt' },
    });
    assert.equal(noPerm.status, 403);
    assert.equal(noPerm.body.error?.code, 'INSUFFICIENT_PERMISSIONS');

    const selfSuspend = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${superAdmin.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Self suspension test' },
    });
    assert.equal(selfSuspend.status, 403);
    assert.equal(selfSuspend.body.error?.code, 'SELF_SUSPENSION_FORBIDDEN');

    const alreadySuspRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${alreadySuspended.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Double suspend' },
    });
    assert.equal(alreadySuspRes.status, 409);
    assert.equal(alreadySuspRes.body.error?.code, 'INVALID_STATUS_TRANSITION');

    const deactRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${deactivated.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Cannot suspend deactivated' },
    });
    assert.equal(deactRes.status, 409);
    assert.equal(auditStore.logs.length, 0);
  });

  await t.test('9. Admin privilege hierarchy prevents suspending higher or equal non-SUPER_ADMIN admins while allowing downward SUPER_ADMIN action', async () => {
    const moderator = seedAccount({
      email: 'mod1@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.MODERATOR,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const peerModerator = seedAccount({
      email: 'mod2@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.MODERATOR,
      permissions: [ADMIN_PERMISSIONS.VIEW_DASHBOARD],
    });
    const districtOfficer = seedAccount({
      email: 'officer@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.DISTRICT_OFFICER,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const superAdmin = seedAccount({
      email: 'super@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.SUPER_ADMIN,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const orphanAdmin = seedAccount({
      email: 'orphan.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      omitAdminProfile: true,
    });

    // Moderator -> Super Admin blocked
    const modToSuper = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${superAdmin.id}/suspend`,
      headers: { authorization: `Bearer ${moderator.token}` },
      body: { reason: 'Attempt upward escalation' },
    });
    assert.equal(modToSuper.status, 403);
    assert.equal(modToSuper.body.error?.code, 'INSUFFICIENT_PRIVILEGE_LEVEL');

    // Moderator -> peer Moderator blocked
    const modToMod = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${peerModerator.id}/suspend`,
      headers: { authorization: `Bearer ${moderator.token}` },
      body: { reason: 'Attempt peer sabotage' },
    });
    assert.equal(modToMod.status, 403);
    assert.equal(modToMod.body.error?.code, 'INSUFFICIENT_PRIVILEGE_LEVEL');

    // District Officer -> Super Admin blocked
    const officerToSuper = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${superAdmin.id}/suspend`,
      headers: { authorization: `Bearer ${districtOfficer.token}` },
      body: { reason: 'Attempt officer upward escalation' },
    });
    assert.equal(officerToSuper.status, 403);

    // Fail-closed on orphan ADMIN lacking AdminProfile
    const orphanRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${orphanAdmin.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Orphan admin check' },
    });
    assert.equal(orphanRes.status, 403);

    // Super Admin -> District Officer succeeds
    const superToOfficer = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${districtOfficer.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Officer reassigned pending review' },
    });
    assert.equal(superToOfficer.status, 200);
    assert.equal(auditStore.logs.length, 1);
  });

  // =========================================================================
  // Reactivation & Session Non-Restoration Tests
  // =========================================================================

  await t.test('10. Authorized admin reactivates SUSPENDED user, appends audit log, preserves old audit logs, and does NOT restore revoked sessions', async () => {
    const superAdmin = seedAccount({
      email: 'sa.react@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.SUPER_ADMIN,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS, ADMIN_PERMISSIONS.MANAGE_USERS],
    });
    const modNoManage = seedAccount({
      email: 'mod.noreact@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      adminLevel: ADMIN_LEVELS.MODERATOR,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const tourist = seedAccount({
      email: 'react.tourist@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
    });
    const deactivated = seedAccount({
      email: 'perm.deact@example.com',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.DEACTIVATED,
    });

    const originalRevokedAt = new Date('2026-11-12T01:00:00Z');
    adminRepo.sessions.push({
      id: 'sess-react-1',
      accountId: tourist.id,
      revokedAt: null,
      revocationReason: null,
    });

    // Step 1: Suspend first
    const suspendRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist.id}/suspend`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Temporary fraud hold' },
    });
    assert.equal(suspendRes.status, 200);
    adminRepo.sessions[0].revokedAt = originalRevokedAt;

    // Step 2: Unauthorized admin receives 403
    const unauthReact = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist.id}/reactivate`,
      headers: { authorization: `Bearer ${modNoManage.token}` },
      body: {},
    });
    assert.equal(unauthReact.status, 403);
    assert.equal(unauthReact.body.error?.code, 'INSUFFICIENT_PERMISSIONS');

    // Step 3: Invalid transition on DEACTIVATED user returns 409
    const reactDeact = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${deactivated.id}/reactivate`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Cannot reactivate deactivated' },
    });
    assert.equal(reactDeact.status, 409);
    assert.equal(reactDeact.body.error?.code, 'INVALID_STATUS_TRANSITION');

    // Step 4: Reactivate eligible suspended user
    const reactRes = await dispatchRequest<TestApiResponse<{
      user: { status: string };
      auditLog: AuditLogEntryDto;
    }>>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist.id}/reactivate`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: { reason: 'Verification appeal approved' },
    });
    assert.equal(reactRes.status, 200);
    assert.equal(reactRes.body.data?.user.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(reactRes.body.data?.auditLog.action, ADMIN_AUDIT_ACTIONS.USER_REACTIVATED);
    assert.deepEqual(reactRes.body.data?.auditLog.beforeState, { status: 'SUSPENDED' });
    assert.deepEqual(reactRes.body.data?.auditLog.afterState, { status: 'ACTIVE' });

    // Revoked session MUST NOT be restored
    assert.equal(adminRepo.sessions[0]?.revokedAt?.toISOString(), originalRevokedAt.toISOString());
    assert.equal(adminRepo.sessions[0]?.revocationReason, SESSION_REVOCATION_REASONS.ADMIN_SUSPENSION);

    // Historical audit logs preserved (both USER_SUSPENDED and USER_REACTIVATED exist)
    assert.equal(auditStore.logs.length, 2);
    assert.equal(auditStore.logs[0]?.action, ADMIN_AUDIT_ACTIONS.USER_SUSPENDED);
    assert.equal(auditStore.logs[1]?.action, ADMIN_AUDIT_ACTIONS.USER_REACTIVATED);

    // Re-reactivating already ACTIVE user rejects with 409
    const doubleReact = await dispatchRequest<TestApiResponse>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist.id}/reactivate`,
      headers: { authorization: `Bearer ${superAdmin.token}` },
      body: {},
    });
    assert.equal(doubleReact.status, 409);
  });

  // =========================================================================
  // Rate Limiting & AuditLog Immutability Unit Checks
  // =========================================================================

  await t.test('11. adminMutationRateLimiter enforces 429 on rapid admin mutation bursts', async () => {
    const admin = seedAccount({
      email: 'rate.admin@kerala.gov.in',
      accountType: ACCOUNT_TYPES.ADMIN,
      permissions: [ADMIN_PERMISSIONS.SUSPEND_USERS],
    });
    const targetId = new Types.ObjectId().toString();

    let hit429 = false;
    for (let i = 0; i < 35; i += 1) {
      const res = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/users/${targetId}/suspend`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Rate limit stress check' },
      });
      if (res.status === 429) {
        hit429 = true;
        assert.equal(res.body.error?.code, 'TOO_MANY_REQUESTS');
        break;
      }
    }
    assert.equal(hit429, true);
  });

  await t.test('12. AuditLogModel blocks updates/deletes and AuditLogService strips sensitive state keys', async () => {
    const safeSnapshot = sanitizeAuditStateSnapshot({
      status: 'ACTIVE',
      passwordHash: 'secret-hash',
      refreshToken: 'secret-rt',
      storageKey: 'kyc/secret',
      authorization: 'Bearer secret',
    });
    assert.deepEqual(safeSnapshot, { status: 'ACTIVE' });
    assert.equal(sanitizeAuditText('Clean\x00 log\x1F text', 100), 'Clean log text');

    await assert.rejects(
      () => AuditLogModel.updateOne({}, { $set: { reason: 'Tampered' } }),
      /immutable append-only/,
    );
    await assert.rejects(
      () => AuditLogModel.findOneAndUpdate({}, { $set: { reason: 'Tampered' } }),
      /immutable append-only/,
    );
    await assert.rejects(
      () => AuditLogModel.deleteOne({}),
      /immutable append-only/,
    );
    await assert.rejects(
      () => AuditLogModel.deleteMany({}),
      /immutable append-only/,
    );
  });
});
