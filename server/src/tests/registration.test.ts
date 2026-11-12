import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { passwordService } from '../shared/security/password.service';
import { authService, AuthService } from '../modules/auth/auth.service';
import {
  AuthRepository,
  CreateAccountInput,
  CreateTouristProfileInput,
  CreateBusinessProfileInput,
} from '../modules/auth/auth.repository';
import {
  BUSINESS_TYPES,
  VERIFICATION_STATUSES,
  ACCOUNT_STATUSES,
} from '@kerala-tourism/constants';
import {
  IAccountDocument,
  ITouristProfileDocument,
  IBusinessProfileDocument,
} from '../shared/models';
import {
  SafeAccountResponse,
  SafeTouristProfileResponse,
  SafeBusinessProfileResponse,
} from '../modules/auth/auth.types';
import { BusinessType } from '@kerala-tourism/shared-types';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import mongoose, { ClientSession } from 'mongoose';

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

interface TouristRegistrationData {
  account: SafeAccountResponse;
  profile: SafeTouristProfileResponse;
}

interface BusinessRegistrationData {
  account: SafeAccountResponse;
  profile: SafeBusinessProfileResponse;
}

/**
 * In-memory Mock Repository for isolated unit/integration tests
 * without requiring an external MongoDB replica-set connection.
 */
class InMemoryAuthRepository extends AuthRepository {
  public accounts: Map<string, IAccountDocument> = new Map();
  public touristProfiles: Map<string, ITouristProfileDocument> = new Map();
  public businessProfiles: Map<string, IBusinessProfileDocument> = new Map();
  public transactionRollbackOccurred = false;
  public failNextProfileCreation = false;

  public override async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const mockSession = {
      inTransaction: () => true,
      abortTransaction: async () => {},
      commitTransaction: async () => {},
    } as unknown as ClientSession;
    const snapshotAccounts = new Map(this.accounts);
    const snapshotTourist = new Map(this.touristProfiles);
    const snapshotBusiness = new Map(this.businessProfiles);

    try {
      return await fn(mockSession);
    } catch (err) {
      // Rollback in-memory state
      this.accounts = snapshotAccounts;
      this.touristProfiles = snapshotTourist;
      this.businessProfiles = snapshotBusiness;
      this.transactionRollbackOccurred = true;
      throw err;
    }
  }

  public override async findAccountByEmail(email: string): Promise<IAccountDocument | null> {
    const found = this.accounts.get(email.trim().toLowerCase());
    return found || null;
  }

  public override async createAccount(
    data: CreateAccountInput,
  ): Promise<IAccountDocument> {
    const normalized = data.email.trim().toLowerCase();
    if (this.accounts.has(normalized)) {
      const err = new Error('Duplicate key error') as Error & { code?: number };
      err.code = 11000;
      throw err;
    }
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      email: normalized,
      passwordHash: data.passwordHash,
      accountType: data.accountType,
      status: data.status || ACCOUNT_STATUSES.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAccountDocument;
    this.accounts.set(normalized, doc);
    return doc;
  }

  public override async createTouristProfile(
    data: CreateTouristProfileInput,
  ): Promise<ITouristProfileDocument> {
    if (this.failNextProfileCreation) {
      throw new Error('Simulated database error during tourist profile creation');
    }
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      accountId: new mongoose.Types.ObjectId(data.accountId.toString()),
      firstName: data.firstName,
      lastName: data.lastName,
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
    if (this.failNextProfileCreation) {
      throw new Error('Simulated database error during business profile creation');
    }
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      accountId: new mongoose.Types.ObjectId(data.accountId.toString()),
      businessName: data.businessName,
      businessType: data.businessType,
      contactNumber: data.contactNumber,
      verificationStatus: data.verificationStatus || VERIFICATION_STATUSES.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IBusinessProfileDocument;
    this.businessProfiles.set(data.accountId.toString(), doc);
    return doc;
  }
}

// Global test repository setup
const mockRepo = new InMemoryAuthRepository();
authService.setRepository(mockRepo);

beforeEach(() => {
  resetRateLimiter();
});

// ------------------------------------------------------------------------------
// Automated Test Suite for Registration Functionality (14 Mandated Tests)
// ------------------------------------------------------------------------------

test('1. Successful Tourist Registration (POST /api/v1/auth/register/tourist)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse<TouristRegistrationData>>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      firstName: 'Arjun',
      lastName: 'Nair',
      email: 'arjun.nair@example.com',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    },
  });

  assert.strictEqual(res.status, 201, 'Should return HTTP 201 Created');
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.message, 'Tourist registration successful');

  const { account, profile } = res.body.data!;
  assert.strictEqual(account.email, 'arjun.nair@example.com');
  assert.strictEqual(account.accountType, 'TOURIST');
  assert.strictEqual(account.status, 'ACTIVE');
  assert.strictEqual(profile.firstName, 'Arjun');
  assert.strictEqual(profile.lastName, 'Nair');
  assert.strictEqual(profile.preferredLanguage, 'EN');
});

test('2. Successful Business Registration (POST /api/v1/auth/register/business)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse<BusinessRegistrationData>>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/business',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      businessName: 'Kumarakom Backwater Homestay',
      businessType: BUSINESS_TYPES.HOMESTAY,
      email: 'stay.kumarakom@example.com',
      password: 'HomestayPassword123@',
      confirmPassword: 'HomestayPassword123@',
      contactNumber: '+919847012345',
    },
  });

  assert.strictEqual(res.status, 201, 'Should return HTTP 201 Created');
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.message?.includes('Verification is pending'));

  const { account, profile } = res.body.data!;
  assert.strictEqual(account.email, 'stay.kumarakom@example.com');
  assert.strictEqual(account.accountType, 'BUSINESS');
  assert.strictEqual(profile.businessName, 'Kumarakom Backwater Homestay');
  assert.strictEqual(profile.businessType, BUSINESS_TYPES.HOMESTAY);
  assert.strictEqual(profile.contactNumber, '+919847012345');
  assert.strictEqual(profile.verificationStatus, 'PENDING');
});

test('3. Duplicate Email Rejection (Returns 409 Conflict)', async () => {
  const app = createApp();
  const payload = {
    firstName: 'Meera',
    lastName: 'Pillai',
    email: 'duplicate.traveler@example.com',
    password: 'SecurePassword123!',
    confirmPassword: 'SecurePassword123!',
  };

  // First registration succeeds
  const firstRes = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: payload,
  });
  assert.strictEqual(firstRes.status, 201);

  // Second registration with same email must fail with 409 Conflict
  const secondRes = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: payload,
  });
  assert.strictEqual(secondRes.status, 409, 'Should return HTTP 409 Conflict');
  assert.strictEqual(secondRes.body.success, false);
  assert.strictEqual(secondRes.body.error?.code, 'CONFLICT');
  assert.ok(secondRes.body.error?.message.includes('already exists'));
});

test('4. Invalid Email Rejection (Returns 400 Bad Request)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      firstName: 'Rahul',
      lastName: 'Varma',
      email: 'not-an-email-format',
      password: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
    },
  });

  assert.strictEqual(res.status, 400, 'Should return HTTP 400 Validation Error');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error?.code, 'VALIDATION_ERROR');
});

test('5. Weak Password Rejection (Returns 400 Bad Request)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      firstName: 'Rahul',
      lastName: 'Varma',
      email: 'weakpass@example.com',
      password: 'weak',
      confirmPassword: 'weak',
    },
  });

  assert.strictEqual(res.status, 400, 'Should reject weak password');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error?.code, 'VALIDATION_ERROR');
});

test('6. Password Confirmation Mismatch (Returns 400 Bad Request)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      firstName: 'Rahul',
      lastName: 'Varma',
      email: 'mismatch@example.com',
      password: 'Password123!@#',
      confirmPassword: 'DifferentPassword123!@#',
    },
  });

  assert.strictEqual(res.status, 400, 'Should reject password confirmation mismatch');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error?.code, 'VALIDATION_ERROR');
  const details = JSON.stringify(res.body.error?.details);
  assert.ok(details.includes('Passwords do not match'));
});

test('7. Invalid Business Type Rejection (Returns 400 Bad Request)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/business',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      businessName: 'Unreal Operator',
      businessType: 'AIRLINE_OR_SPACESHIP' as unknown as BusinessType,
      email: 'invalidtype@example.com',
      password: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
      contactNumber: '+919847098765',
    },
  });

  assert.strictEqual(res.status, 400, 'Should reject invalid business type');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error?.code, 'VALIDATION_ERROR');
});

test('8. Attempted ADMIN Registration Rejection (Returns 400 Bad Request)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      firstName: 'Hacker',
      lastName: 'Admin',
      email: 'attempt.admin@example.com',
      password: 'AdminPassword123!',
      confirmPassword: 'AdminPassword123!',
      accountType: 'ADMIN',
    },
  });

  assert.strictEqual(res.status, 400, 'Must reject unexpected accountType injection');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error?.code, 'VALIDATION_ERROR');
});

test('9. Business Verification Status Defaults to PENDING', async () => {
  const service = new AuthService(mockRepo, passwordService);

  const result = await service.registerBusiness({
    businessName: 'Munnar Tea Hills Resort',
    businessType: BUSINESS_TYPES.RESORT,
    email: 'munnar.resort@example.com',
    password: 'MunnarPassword123!',
    confirmPassword: 'MunnarPassword123!',
    contactNumber: '+919847055555',
  });

  assert.strictEqual(
    result.profile.verificationStatus,
    VERIFICATION_STATUSES.PENDING,
    'Business verification status must default strictly to PENDING',
  );
});

test('10. Password is Stored as an Argon2id Hash', async () => {
  const plaintext = 'SuperKeralaSecret@2026';
  const hash = await passwordService.hash(plaintext);

  assert.ok(
    hash.startsWith('$argon2id$v=19$m=65536,t=3,p=4$'),
    'Hash must follow standard Argon2id format',
  );
  assert.notStrictEqual(hash, plaintext, 'Stored password must never equal plaintext');

  const isMatch = await passwordService.verify(plaintext, hash);
  assert.strictEqual(isMatch, true, 'Correct plaintext password must verify true');

  const isWrong = await passwordService.verify('WrongPassword123!', hash);
  assert.strictEqual(isWrong, false, 'Incorrect password must verify false');
});

test('11. Password Hash is Strictly Excluded from API Responses', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse<TouristRegistrationData>>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/tourist',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      firstName: 'Lakshmi',
      lastName: 'Menon',
      email: 'lakshmi.menon@example.com',
      password: 'SafePassword123!',
      confirmPassword: 'SafePassword123!',
    },
  });

  assert.strictEqual(res.status, 201);
  const rawResponse = res.rawBody;
  assert.strictEqual(
    (res.body.data?.account as unknown as Record<string, unknown>)?.passwordHash,
    undefined,
    'passwordHash must be undefined',
  );
  assert.strictEqual(
    rawResponse.includes('passwordHash'),
    false,
    'Response payload must never contain passwordHash',
  );
  assert.strictEqual(
    rawResponse.includes('SafePassword123!'),
    false,
    'Response payload must never contain plaintext password',
  );
});

test('12. Transaction Rollback When Profile Creation Fails', async () => {
  const rollbackRepo = new InMemoryAuthRepository();
  const service = new AuthService(rollbackRepo, passwordService);

  rollbackRepo.failNextProfileCreation = true;

  await assert.rejects(
    async () => {
      await service.registerTourist({
        firstName: 'Failing',
        lastName: 'User',
        email: 'fail.transaction@example.com',
        password: 'Password123!@#',
        confirmPassword: 'Password123!@#',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('Simulated database error'));
      return true;
    },
  );

  assert.strictEqual(
    rollbackRepo.transactionRollbackOccurred,
    true,
    'Transaction rollback must have been triggered',
  );
  const account = await rollbackRepo.findAccountByEmail('fail.transaction@example.com');
  assert.strictEqual(account, null, 'Account must not exist in repository following rollback');
});

test('13. Registration Rate Limiting (Returns 429 Too Many Requests)', async () => {
  const app = createApp();
  resetRateLimiter();

  const payload = {
    firstName: 'Rate',
    lastName: 'Limit',
    password: 'Password123!@#',
    confirmPassword: 'Password123!@#',
  };

  let hitRateLimit = false;
  for (let i = 1; i <= 7; i++) {
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/register/tourist',
      body: {
        ...payload,
        email: `ratelimit${i}@example.com`,
      },
    });

    if (res.status === 429) {
      hitRateLimit = true;
      assert.strictEqual(res.body.error?.code, 'TOO_MANY_REQUESTS');
      assert.ok(res.headers['retry-after'], 'Response must include Retry-After header');
      assert.ok(res.headers['ratelimit-limit'], 'Response must include RateLimit-Limit header');
      break;
    }
  }

  assert.strictEqual(hitRateLimit, true, 'Rapid registrations must trigger HTTP 429 Rate Limit');
  resetRateLimiter();
});

test('14. Unexpected Request Fields are Rejected (Returns 400 Bad Request)', async () => {
  const app = createApp();
  const res = await dispatchRequest<TestApiResponse>(app, {
    method: 'POST',
    url: '/api/v1/auth/register/business',
    headers: { 'x-bypass-rate-limit': 'true' },
    body: {
      businessName: 'Legit Homestay',
      businessType: BUSINESS_TYPES.HOMESTAY,
      email: 'unexpected.fields@example.com',
      password: 'HomestayPassword123@',
      confirmPassword: 'HomestayPassword123@',
      contactNumber: '+919847099999',
      isVerified: true,
      adminBadge: 'SUPER_USER',
    },
  });

  assert.strictEqual(res.status, 400, 'Should reject unexpected input fields');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error?.code, 'VALIDATION_ERROR');
  const details = JSON.stringify(res.body.error?.details);
  assert.ok(details.includes('Unrecognized or unauthorized fields in request body'));
});
