import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { passwordService } from '../shared/security/password.service';
import { jwtService } from '../shared/security/jwt.service';
import { authService } from '../modules/auth/auth.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  AuthRepository,
  CreateAccountInput,
  CreateTouristProfileInput,
  CreateBusinessProfileInput,
  CreateSessionInput,
} from '../modules/auth/auth.repository';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  BUSINESS_TYPES,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import {
  IAccountDocument,
  ITouristProfileDocument,
  IBusinessProfileDocument,
  ISessionDocument,
} from '../shared/models';
import { SafeAccountResponse } from '../modules/auth/auth.types';
import { AccountStatus } from '@kerala-tourism/shared-types';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { Types } from 'mongoose';
import { env } from '../config/env';

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

interface LoginData {
  accessToken: string;
  refreshToken?: string;
  account: SafeAccountResponse;
}

interface TokenData {
  accessToken: string;
  refreshToken?: string;
}

interface MeData {
  account: SafeAccountResponse;
  profile: {
    firstName?: string;
    lastName?: string;
    businessName?: string;
    [key: string]: unknown;
  };
}

/**
 * Isolated In-Memory Repository for Fast, Deterministic Unit/Integration Tests
 */
class InMemoryAuthTestRepository extends AuthRepository {
  public accounts: Map<string, IAccountDocument> = new Map();
  public accountsById: Map<string, IAccountDocument> = new Map();
  public touristProfiles: Map<string, ITouristProfileDocument> = new Map();
  public businessProfiles: Map<string, IBusinessProfileDocument> = new Map();
  public sessions: Map<string, ISessionDocument> = new Map(); // key = refreshTokenHash

  public override async findAccountByEmail(email: string): Promise<IAccountDocument | null> {
    const found = this.accounts.get(email.trim().toLowerCase());
    return found || null;
  }

  public override async findAccountWithPassword(email: string): Promise<IAccountDocument | null> {
    const found = this.accounts.get(email.trim().toLowerCase());
    return found || null;
  }

  public override async findAccountById(id: Types.ObjectId | string): Promise<IAccountDocument | null> {
    const found = this.accountsById.get(id.toString());
    return found || null;
  }

  public override async updateLastLogin(accountId: Types.ObjectId | string): Promise<void> {
    const found = this.accountsById.get(accountId.toString());
    if (found) {
      found.lastLoginAt = new Date();
    }
  }

  public override async createAccount(data: CreateAccountInput): Promise<IAccountDocument> {
    const normalized = data.email.trim().toLowerCase();
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      email: normalized,
      passwordHash: data.passwordHash,
      accountType: data.accountType,
      status: data.status || ACCOUNT_STATUSES.ACTIVE,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAccountDocument;

    this.accounts.set(normalized, doc);
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

  public override async createBusinessProfile(
    data: CreateBusinessProfileInput,
  ): Promise<IBusinessProfileDocument> {
    const id = new Types.ObjectId();
    const doc = {
      _id: id,
      id: id.toString(),
      accountId: data.accountId,
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

  public override async createSession(data: CreateSessionInput): Promise<ISessionDocument> {
    const id = new Types.ObjectId();
    const accountObjectId =
      typeof data.accountId === 'string' ? new Types.ObjectId(data.accountId) : data.accountId;

    const doc: ISessionDocument = {
      _id: id,
      id: id.toString(),
      accountId: accountObjectId,
      refreshTokenHash: data.refreshTokenHash,
      familyId: data.familyId,
      replacedByTokenHash: null,
      lastUsedAt: null,
      revocationReason: null,
      deviceInformation: data.deviceInformation || {},
      expiresAt: data.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isExpired(this: ISessionDocument) {
        return Date.now() >= this.expiresAt.getTime();
      },
      isRevoked(this: ISessionDocument) {
        return this.revokedAt !== null && this.revokedAt !== undefined;
      },
      isValid(this: ISessionDocument) {
        return !this.isExpired() && !this.isRevoked();
      },
      revoke(this: ISessionDocument, reason?: string) {
        this.revokedAt = new Date();
        if (reason) this.revocationReason = reason;
      },
    } as unknown as ISessionDocument;

    this.sessions.set(data.refreshTokenHash, doc);
    return doc;
  }

  public override async findSessionByHash(
    refreshTokenHash: string,
  ): Promise<ISessionDocument | null> {
    const session = this.sessions.get(refreshTokenHash);
    return session || null;
  }

  public override async rotateSessionAtomic(
    oldHash: string,
    newHash: string,
    familyId: string,
    expiresAt: Date,
  ): Promise<ISessionDocument | null> {
    const oldSession = this.sessions.get(oldHash);
    const now = new Date();

    if (!oldSession || oldSession.revokedAt !== null || oldSession.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    // Atomically mark old session rotated
    oldSession.revokedAt = now;
    oldSession.revocationReason = 'ROTATED';
    oldSession.replacedByTokenHash = newHash;
    oldSession.lastUsedAt = now;

    // Create new session
    const id = new Types.ObjectId();
    const newSession: ISessionDocument = {
      _id: id,
      id: id.toString(),
      accountId: oldSession.accountId,
      refreshTokenHash: newHash,
      familyId,
      replacedByTokenHash: null,
      lastUsedAt: null,
      revocationReason: null,
      deviceInformation: oldSession.deviceInformation,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      isExpired(this: ISessionDocument) {
        return Date.now() >= this.expiresAt.getTime();
      },
      isRevoked(this: ISessionDocument) {
        return this.revokedAt !== null && this.revokedAt !== undefined;
      },
      isValid(this: ISessionDocument) {
        return !this.isExpired() && !this.isRevoked();
      },
      revoke(this: ISessionDocument, reason?: string) {
        this.revokedAt = new Date();
        if (reason) this.revocationReason = reason;
      },
    } as unknown as ISessionDocument;

    this.sessions.set(newHash, newSession);
    return newSession;
  }

  public override async revokeFamilySessions(
    familyId: string,
    reason = 'REUSE_DETECTED',
  ): Promise<number> {
    let count = 0;
    const now = new Date();
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId && session.revokedAt === null) {
        session.revokedAt = now;
        session.revocationReason = reason;
        count++;
      }
    }
    return count;
  }

  public override async revokeSessionByHash(
    refreshTokenHash: string,
    reason = 'LOGOUT',
  ): Promise<boolean> {
    const session = this.sessions.get(refreshTokenHash);
    if (session && session.revokedAt === null) {
      session.revokedAt = new Date();
      session.revocationReason = reason;
      return true;
    }
    return false;
  }

  public override async revokeAllAccountSessions(
    accountId: Types.ObjectId | string,
    reason = 'LOGOUT_ALL',
  ): Promise<number> {
    let count = 0;
    const now = new Date();
    const accIdStr = accountId.toString();
    for (const session of this.sessions.values()) {
      if (session.accountId.toString() === accIdStr && session.revokedAt === null) {
        session.revokedAt = now;
        session.revocationReason = reason;
        count++;
      }
    }
    return count;
  }

  public override async findProfileByAccountId(
    accountId: Types.ObjectId | string,
    accountType: string,
  ): Promise<ITouristProfileDocument | IBusinessProfileDocument | null> {
    const accIdStr = accountId.toString();
    if (accountType === ACCOUNT_TYPES.TOURIST) {
      return this.touristProfiles.get(accIdStr) || null;
    }
    if (accountType === ACCOUNT_TYPES.BUSINESS) {
      return this.businessProfiles.get(accIdStr) || null;
    }
    return null;
  }
}

// Suite Setup
const app = createApp();
let mockRepo: InMemoryAuthTestRepository;

beforeEach(async () => {
  resetRateLimiter();
  mockRepo = new InMemoryAuthTestRepository();
  authService.setRepository(mockRepo);
  authMiddleware.setRepository(mockRepo);
});

test('Authentication Lifecycle & Session Management Test Suite (Day 09)', async (t) => {
  // Helper to seed a tourist
  const seedTourist = async (
    email = 'tourist@example.com',
    password = 'StrongPassword123!',
    status: AccountStatus = ACCOUNT_STATUSES.ACTIVE,
  ) => {
    const passwordHash = await passwordService.hash(password);
    const account = await mockRepo.createAccount({
      email,
      passwordHash,
      accountType: ACCOUNT_TYPES.TOURIST,
      status,
    });
    const profile = await mockRepo.createTouristProfile({
      accountId: account._id,
      firstName: 'Aarav',
      lastName: 'Nair',
    });
    return { account, profile };
  };

  // Helper to seed a business
  const seedBusiness = async (
    email = 'hotel@example.com',
    password = 'StrongPassword123!',
    status: AccountStatus = ACCOUNT_STATUSES.ACTIVE,
  ) => {
    const passwordHash = await passwordService.hash(password);
    const account = await mockRepo.createAccount({
      email,
      passwordHash,
      accountType: ACCOUNT_TYPES.BUSINESS,
      status,
    });
    const profile = await mockRepo.createBusinessProfile({
      accountId: account._id,
      businessName: 'Kumarakom Backwater Retreat',
      businessType: BUSINESS_TYPES.RESORT,
      contactNumber: '+919847012345',
    });
    return { account, profile };
  };

  // --------------------------------------------------------------------------
  // TEST 01: Successful Tourist Login
  // --------------------------------------------------------------------------
  await t.test('1. Successful tourist login returns access and refresh tokens and sets HttpOnly cookie', async () => {
    await seedTourist('tourist@example.com', 'StrongPassword123!');

    const res = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'Tourist@example.COM', // Tests case-insensitivity & normalization
        password: 'StrongPassword123!',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data?.accessToken);
    assert.ok(res.body.data?.refreshToken);
    assert.equal(res.body.data?.account.email, 'tourist@example.com');
    assert.equal(res.body.data?.account.accountType, 'TOURIST');

    // Verify Set-Cookie header
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie);
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    assert.match(cookieStr, /refreshToken=/);
    assert.match(cookieStr, /HttpOnly/i);
    assert.match(cookieStr, /SameSite=Strict/i);
  });

  // --------------------------------------------------------------------------
  // TEST 02: Successful Business Login
  // --------------------------------------------------------------------------
  await t.test('2. Successful business login returns proper accountType and tokens', async () => {
    await seedBusiness('hotel@example.com', 'MerchantPassword123!');

    const res = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'hotel@example.com',
        password: 'MerchantPassword123!',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data?.account.accountType, 'BUSINESS');
    assert.ok(res.body.data?.accessToken);
  });

  // --------------------------------------------------------------------------
  // TEST 03: Incorrect Password
  // --------------------------------------------------------------------------
  await t.test('3. Incorrect password returns generic credential error to prevent enumeration', async () => {
    await seedTourist('tourist@example.com', 'CorrectPassword123!');

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'tourist@example.com',
        password: 'WrongPassword123!',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.message, 'Invalid email or password');
    assert.equal(res.body.error?.code, 'INVALID_CREDENTIALS');
  });

  // --------------------------------------------------------------------------
  // TEST 04: Unknown Email
  // --------------------------------------------------------------------------
  await t.test('4. Unknown email returns identical generic credential error', async () => {
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.message, 'Invalid email or password');
    assert.equal(res.body.error?.code, 'INVALID_CREDENTIALS');
  });

  // --------------------------------------------------------------------------
  // TEST 05: Suspended Account Login Rejection
  // --------------------------------------------------------------------------
  await t.test('5. Suspended account login is rejected with 403 Forbidden', async () => {
    await seedTourist('suspended@example.com', 'StrongPassword123!', ACCOUNT_STATUSES.SUSPENDED);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'suspended@example.com',
        password: 'StrongPassword123!',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'ACCOUNT_SUSPENDED');
  });

  // --------------------------------------------------------------------------
  // TEST 06: Deactivated Account Login Rejection
  // --------------------------------------------------------------------------
  await t.test('6. Deactivated account login is rejected with 403 Forbidden', async () => {
    await seedTourist('deactivated@example.com', 'StrongPassword123!', ACCOUNT_STATUSES.DEACTIVATED);

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'deactivated@example.com',
        password: 'StrongPassword123!',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'ACCOUNT_DEACTIVATED');
  });

  // --------------------------------------------------------------------------
  // TEST 07: Access Token Verification
  // --------------------------------------------------------------------------
  await t.test('7. Access token verification checks signature, issuer, audience, and claims', async () => {
    const { account } = await seedTourist();
    const token = jwtService.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });

    const claims = jwtService.verifyAccessToken(token);
    assert.equal(claims.sub, account._id.toString());
    assert.equal(claims.email, account.email);
    assert.equal(claims.accountType, 'TOURIST');
    assert.equal(claims.status, 'ACTIVE');
    assert.equal(claims.tokenType, 'access');
    assert.equal(claims.iss, env.JWT_ISSUER);
    assert.equal(claims.aud, env.JWT_AUDIENCE);
    assert.ok(claims.jti);
  });

  // --------------------------------------------------------------------------
  // TEST 08: Expired Access Token Rejection
  // --------------------------------------------------------------------------
  await t.test('8. Expired access token is rejected with TOKEN_EXPIRED', async () => {
    const { account } = await seedTourist();
    const expiredToken = jwtService.signAccessToken(
      {
        id: account._id.toString(),
        email: account.email,
        accountType: account.accountType,
        status: account.status,
      },
      '-1s',
    );

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${expiredToken}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'TOKEN_EXPIRED');
  });

  // --------------------------------------------------------------------------
  // TEST 09: Invalid Signature Rejection
  // --------------------------------------------------------------------------
  await t.test('9. Invalid token signature or tampered token is rejected with INVALID_TOKEN', async () => {
    const fakeToken = jwt.sign(
      { sub: '123456789012345678901234', tokenType: 'access' },
      'wrong-signing-secret-that-fails-verification-32-chars',
      { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    );

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${fakeToken}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'INVALID_TOKEN');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Invalid Token Type Rejection
  // --------------------------------------------------------------------------
  await t.test('10. Invalid token type (e.g. refresh token as bearer) is rejected with INVALID_TOKEN_TYPE', async () => {
    const fakeRefreshTokenAsJwt = jwt.sign(
      { sub: '123456789012345678901234', tokenType: 'refresh' },
      env.JWT_ACCESS_SECRET,
      { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    );

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${fakeRefreshTokenAsJwt}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'INVALID_TOKEN_TYPE');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Successful Refresh
  // --------------------------------------------------------------------------
  await t.test('11. Successful refresh returns new access token and new rotated refresh token', async () => {
    await seedTourist('refresh-user@example.com', 'StrongPassword123!');

    // 1. Initial Login
    const loginRes = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'refresh-user@example.com',
        password: 'StrongPassword123!',
      },
    });

    const refreshToken1 = loginRes.body.data?.refreshToken;
    assert.ok(refreshToken1);

    // 2. Perform Refresh
    const refreshRes = await dispatchRequest<TestApiResponse<TokenData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: refreshToken1 },
    });

    assert.equal(refreshRes.status, 200);
    assert.equal(refreshRes.body.success, true);
    assert.ok(refreshRes.body.data?.accessToken);
    assert.ok(refreshRes.body.data?.refreshToken);
    assert.notEqual(refreshRes.body.data?.refreshToken, refreshToken1);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Refresh Token Rotation
  // --------------------------------------------------------------------------
  await t.test('12. Refresh token rotation marks the old session replaced with revocation reason ROTATED', async () => {
    await seedTourist('rotate@example.com', 'StrongPassword123!');

    const loginRes = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'rotate@example.com',
        password: 'StrongPassword123!',
      },
    });

    const initialToken = loginRes.body.data?.refreshToken;
    assert.ok(initialToken);
    const initialHash = jwtService.hashRefreshToken(initialToken);

    // Refresh
    const refreshRes = await dispatchRequest<TestApiResponse<TokenData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: initialToken },
    });

    const newHash = jwtService.hashRefreshToken(refreshRes.body.data!.refreshToken!);

    const oldSession = await mockRepo.findSessionByHash(initialHash);
    assert.ok(oldSession?.revokedAt);
    assert.equal(oldSession?.revocationReason, 'ROTATED');
    assert.equal(oldSession?.replacedByTokenHash, newHash);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Reuse of Old Refresh Token (Replay Attack Defense)
  // --------------------------------------------------------------------------
  await t.test('13. Replay of previously rotated refresh token triggers automatic session family revocation', async () => {
    await seedTourist('replay@example.com', 'StrongPassword123!');

    // Login: creates T1
    const loginRes = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'replay@example.com',
        password: 'StrongPassword123!',
      },
    });
    const token1 = loginRes.body.data!.refreshToken!;

    // Refresh 1: rotates T1 -> T2
    const refresh1Res = await dispatchRequest<TestApiResponse<TokenData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: token1 },
    });
    const token2 = refresh1Res.body.data!.refreshToken!;

    // Refresh 2: rotates T2 -> T3
    const refresh2Res = await dispatchRequest<TestApiResponse<TokenData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: token2 },
    });
    const token3 = refresh2Res.body.data!.refreshToken!;
    const token3Hash = jwtService.hashRefreshToken(token3);

    // Verify token3 is currently active
    const session3Before = await mockRepo.findSessionByHash(token3Hash);
    assert.equal(session3Before?.isValid(), true);

    // ATTACK: Replay token1 (which was already rotated)
    const attackRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: token1 },
    });

    assert.equal(attackRes.status, 401);
    assert.equal(attackRes.body.error?.code, 'REVOKED_TOKEN_REUSE');

    // VERIFICATION: token3 in the same family lineage is NOW revoked!
    const session3After = await mockRepo.findSessionByHash(token3Hash);
    assert.equal(session3After?.isRevoked(), true);
    assert.equal(session3After?.revocationReason, 'REUSE_DETECTED');
  });

  // --------------------------------------------------------------------------
  // TEST 14: Revoked Session Rejection
  // --------------------------------------------------------------------------
  await t.test('14. Revoked session is rejected on refresh with SESSION_REVOKED', async () => {
    const { account } = await seedTourist();
    const rawToken = jwtService.generateRefreshToken();
    const hash = jwtService.hashRefreshToken(rawToken);

    // Create session that was logged out / revoked
    const session = await mockRepo.createSession({
      accountId: account._id,
      refreshTokenHash: hash,
      familyId: 'family-123',
      expiresAt: new Date(Date.now() + 86400000),
    });
    session.revoke('LOGOUT');

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: rawToken },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'SESSION_REVOKED');
  });

  // --------------------------------------------------------------------------
  // TEST 15: Expired Session Rejection
  // --------------------------------------------------------------------------
  await t.test('15. Expired session is rejected on refresh with SESSION_EXPIRED', async () => {
    const { account } = await seedTourist();
    const rawToken = jwtService.generateRefreshToken();
    const hash = jwtService.hashRefreshToken(rawToken);

    // Create session with past expiresAt
    await mockRepo.createSession({
      accountId: account._id,
      refreshTokenHash: hash,
      familyId: 'family-expired',
      expiresAt: new Date(Date.now() - 60000), // 1 minute ago
    });

    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: rawToken },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'SESSION_EXPIRED');
  });

  // --------------------------------------------------------------------------
  // TEST 16: Concurrent Refresh Attempts
  // --------------------------------------------------------------------------
  await t.test('16. Concurrent refresh attempts allow only one winner under atomic rotation constraints', async () => {
    await seedTourist('concurrent@example.com', 'StrongPassword123!');

    const loginRes = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'concurrent@example.com',
        password: 'StrongPassword123!',
      },
    });
    const sharedToken = loginRes.body.data!.refreshToken!;

    // Dispatch two concurrent refresh requests simultaneously
    const [res1, res2] = await Promise.all([
      dispatchRequest<TestApiResponse<TokenData>>(app, {
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'x-bypass-rate-limit': 'true' },
        body: { refreshToken: sharedToken },
      }),
      dispatchRequest<TestApiResponse<TokenData>>(app, {
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'x-bypass-rate-limit': 'true' },
        body: { refreshToken: sharedToken },
      }),
    ]);

    const statuses = [res1.status, res2.status];
    assert.ok(statuses.includes(200), 'At least one request must succeed with 200');
    assert.ok(
      statuses.includes(401),
      'Concurrent request presenting the rotated token must be rejected with 401',
    );
  });

  // --------------------------------------------------------------------------
  // TEST 17: Successful Logout
  // --------------------------------------------------------------------------
  await t.test('17. Successful logout revokes current session and clears refresh cookie', async () => {
    await seedTourist('logout@example.com', 'StrongPassword123!');

    const loginRes = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: {
        email: 'logout@example.com',
        password: 'StrongPassword123!',
      },
    });
    const refreshToken = loginRes.body.data!.refreshToken!;

    const logoutRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken },
    });

    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.message, 'Logged out successfully');

    // Verify session revoked
    const hash = jwtService.hashRefreshToken(refreshToken);
    const session = await mockRepo.findSessionByHash(hash);
    assert.equal(session?.isRevoked(), true);
    assert.equal(session?.revocationReason, 'LOGOUT');

    // Attempting refresh should now fail
    const refreshRes = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken },
    });
    assert.equal(refreshRes.status, 401);
  });

  // --------------------------------------------------------------------------
  // TEST 18: Logout-All Session Revocation
  // --------------------------------------------------------------------------
  await t.test('18. Logout-all revokes all active device sessions for authenticated account', async () => {
    await seedTourist('logoutall@example.com', 'StrongPassword123!');

    // Device 1 login
    const login1 = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { email: 'logoutall@example.com', password: 'StrongPassword123!' },
    });

    // Device 2 login
    const login2 = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { email: 'logoutall@example.com', password: 'StrongPassword123!' },
    });

    const token1 = login1.body.data!.refreshToken!;
    const token2 = login2.body.data!.refreshToken!;
    const accessToken = login1.body.data!.accessToken;

    // Logout-all using Bearer accessToken
    const logoutAllRes = await dispatchRequest<TestApiResponse<{ revokedCount: number }>>(app, {
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(logoutAllRes.status, 200);
    assert.ok((logoutAllRes.body.data?.revokedCount || 0) >= 2);

    // Both sessions should now fail refresh
    const r1 = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: token1 },
    });
    const r2 = await dispatchRequest<TestApiResponse>(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { refreshToken: token2 },
    });

    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
  });

  // --------------------------------------------------------------------------
  // TEST 19: Authenticated /me Endpoint
  // --------------------------------------------------------------------------
  await t.test('19. Authenticated GET /api/v1/auth/me returns safe account and polymorphic profile without secrets', async () => {
    await seedTourist('me-tourist@example.com', 'StrongPassword123!');

    const loginRes = await dispatchRequest<TestApiResponse<LoginData>>(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-bypass-rate-limit': 'true' },
      body: { email: 'me-tourist@example.com', password: 'StrongPassword123!' },
    });
    const accessToken = loginRes.body.data!.accessToken;

    const meRes = await dispatchRequest<TestApiResponse<MeData>>(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-bypass-rate-limit': 'true',
      },
    });

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(meRes.body.data?.account.email, 'me-tourist@example.com');
    assert.equal(meRes.body.data?.account.accountType, 'TOURIST');
    assert.equal(meRes.body.data?.profile.firstName, 'Aarav');
    assert.equal(meRes.body.data?.profile.lastName, 'Nair');

    // Strictly ensure zero passwordHash or session secrets leaked
    const rawString = JSON.stringify(meRes.body);
    assert.equal(rawString.includes('passwordHash'), false);
    assert.equal(rawString.includes('refreshTokenHash'), false);
  });

  // --------------------------------------------------------------------------
  // TEST 20: Unauthorized /me Request
  // --------------------------------------------------------------------------
  await t.test('20. Unauthorized GET /api/v1/auth/me without Bearer token is rejected with 401', async () => {
    const res = await dispatchRequest<TestApiResponse>(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-bypass-rate-limit': 'true' },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error?.code, 'AUTHENTICATION_REQUIRED');
  });
});
