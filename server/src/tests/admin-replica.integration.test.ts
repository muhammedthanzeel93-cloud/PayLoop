import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose, { Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  BUSINESS_TYPES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  POST_STATUSES,
  POST_VISIBILITIES,
  PREFERRED_LANGUAGES,
  SESSION_REVOCATION_REASONS,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import {
  adminRepository,
  adminService,
  AuditLogModel,
  auditLogService,
} from '../modules/admin';
import { authRepository } from '../modules/auth/auth.repository';
import { authService } from '../modules/auth/auth.service';
import {
  AccountModel,
  AdminProfileModel,
  BusinessProfileModel,
  DestinationModel,
  PostModel,
  SessionModel,
  TouristProfileModel,
} from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
import { passwordService } from '../shared/security/password.service';
import { dispatchRequest } from './testUtils';

const findFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to bind ephemeral port')));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });

const waitForPortOpen = async (port: number, timeoutMs = 15_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (connected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for mongod port ${port}`);
};

const waitForReplicaSetPrimary = async (port: number, timeoutMs = 20_000): Promise<void> => {
  const directUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true&serverSelectionTimeoutMS=2000`;
  const setupConn = await mongoose.createConnection(directUri).asPromise();
  try {
    if (!setupConn.db) {
      throw new Error('Admin DB handle unavailable during replica set initiation');
    }
    const adminDb = setupConn.db.admin();
    try {
      await adminDb.command({
        replSetInitiate: {
          _id: 'rs0',
          members: [{ _id: 0, host: `127.0.0.1:${port}` }],
        },
      });
    } catch (err: unknown) {
      const codeName = (err as { codeName?: string })?.codeName;
      if (codeName !== 'AlreadyInitialized') {
        throw err;
      }
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hello = await adminDb.command({ hello: 1 });
      if (hello.isWritablePrimary === true || hello.ismaster === true) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('Timed out waiting for replica set node to become writable primary');
  } finally {
    await setupConn.close();
  }
};

const hasPlanStage = (plan: Record<string, unknown> | undefined, targetStage: string): boolean => {
  if (!plan || typeof plan !== 'object') {
    return false;
  }
  if (plan['stage'] === targetStage) {
    return true;
  }
  const inputStage = plan['inputStage'] as Record<string, unknown> | undefined;
  const inputStages = plan['inputStages'] as Array<Record<string, unknown>> | undefined;
  if (inputStage && hasPlanStage(inputStage, targetStage)) {
    return true;
  }
  if (Array.isArray(inputStages)) {
    return inputStages.some((child) => hasPlanStage(child, targetStage));
  }
  return false;
};

describe('Day 17 Admin Dashboard & User Management Replica Set Integration Tests (Real MongoDB)', () => {
  const app = createApp();
  let mongodProc: ChildProcess | null = null;
  let tmpDbPath = '';

  const createRealAdmin = async (
    email: string,
    options?: {
      adminLevel?: (typeof ADMIN_LEVELS)[keyof typeof ADMIN_LEVELS];
      permissions?: Array<(typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS]>;
      status?: (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES];
    },
  ) => {
    const account = await AccountModel.create({
      email,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo',
      accountType: ACCOUNT_TYPES.ADMIN,
      status: options?.status ?? ACCOUNT_STATUSES.ACTIVE,
    });
    await AdminProfileModel.create({
      accountId: account._id,
      displayName: email.split('@')[0],
      adminLevel: options?.adminLevel ?? ADMIN_LEVELS.SUPER_ADMIN,
      permissions: options?.permissions ?? [
        ADMIN_PERMISSIONS.VIEW_DASHBOARD,
        ADMIN_PERMISSIONS.VIEW_USERS,
        ADMIN_PERMISSIONS.MANAGE_USERS,
        ADMIN_PERMISSIONS.SUSPEND_USERS,
      ],
      mfaEnabled: true,
    });
    const token = jwtService.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });
    return { id: account._id.toString(), token };
  };

  before(async () => {
    const port = await findFreePort();
    tmpDbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kerala-admin-rs-'));

    mongodProc = spawn(
      'mongod',
      [
        '--replSet',
        'rs0',
        '--port',
        String(port),
        '--dbpath',
        tmpDbPath,
        '--bind_ip',
        '127.0.0.1',
        '--logpath',
        path.join(tmpDbPath, 'mongod.log'),
        '--noauth',
      ],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    );

    await waitForPortOpen(port);
    await waitForReplicaSetPrimary(port);

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    const replicaUri = `mongodb://127.0.0.1:${port}/kerala_admin_replica_test?replicaSet=rs0&serverSelectionTimeoutMS=5000`;
    await mongoose.connect(replicaUri);

    await Promise.all([
      AccountModel.syncIndexes(),
      TouristProfileModel.syncIndexes(),
      BusinessProfileModel.syncIndexes(),
      AdminProfileModel.syncIndexes(),
      SessionModel.syncIndexes(),
      DestinationModel.syncIndexes(),
      PostModel.syncIndexes(),
      AuditLogModel.syncIndexes(),
    ]);

    authMiddleware.setRepository(authRepository);
    authorizationMiddleware.setRepository(authRepository);
    adminService.setRepository(adminRepository);
    adminService.setAuditService(auditLogService);
  });

  after(async () => {
    resetRateLimiter();

    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.admin().command({ shutdown: 1, force: true });
      }
    } catch {
      // mongod may close socket mid-shutdown
    }

    await mongoose.disconnect().catch(() => undefined);

    if (mongodProc && mongodProc.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          mongodProc?.kill('SIGKILL');
          resolve();
        }, 5000);
        mongodProc?.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        mongodProc?.kill();
      });
    }

    if (tmpDbPath) {
      fs.rmSync(tmpDbPath, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    resetRateLimiter();
    await Promise.all([
      AccountModel.deleteMany({}),
      TouristProfileModel.deleteMany({}),
      BusinessProfileModel.deleteMany({}),
      AdminProfileModel.deleteMany({}),
      SessionModel.deleteMany({}),
      DestinationModel.deleteMany({}),
      PostModel.deleteMany({}),
      AuditLogModel.collection.deleteMany({}),
    ]);
  });

  it('computes accurate MongoDB $group aggregations for /dashboard/overview excluding soft-deleted posts', async () => {
    const admin = await createRealAdmin('agg.admin@kerala.gov.in');
    const tActive = await AccountModel.create({
      email: 't1@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await AccountModel.create({
      email: 't2@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.SUSPENDED,
    });
    const b1 = await AccountModel.create({
      email: 'b1@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    const b2 = await AccountModel.create({
      email: 'b2@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.DEACTIVATED,
    });

    await BusinessProfileModel.create([
      {
        accountId: b1._id,
        businessName: 'Munnar Tea Haven',
        businessType: BUSINESS_TYPES.RESORT,
        contactNumber: '+914865230100',
        verificationStatus: VERIFICATION_STATUSES.VERIFIED,
      },
      {
        accountId: b2._id,
        businessName: 'Varkala Cliff Stay',
        businessType: BUSINESS_TYPES.HOMESTAY,
        contactNumber: '+914702601200',
        verificationStatus: VERIFICATION_STATUSES.PENDING,
      },
    ]);

    await DestinationModel.create([
      {
        name: 'Munnar Tea Hills',
        slug: 'munnar-tea-hills',
        description: 'Scenic misty hills and tea plantations across Idukki highlands.',
        location: { type: 'Point', coordinates: [77.0595, 10.0889] },
        address: 'Munnar Town Road, Idukki, Kerala',
        district: 'Idukki',
        verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
        publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
        createdBy: new Types.ObjectId(admin.id),
      },
      {
        name: 'Hidden Waterfall',
        slug: 'hidden-waterfall',
        description: 'Community submitted waterfall spot awaiting officer review.',
        location: { type: 'Point', coordinates: [76.2711, 10.8505] },
        address: 'Wayanad Forest Fringe Road, Wayanad',
        district: 'Wayanad',
        verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING,
        publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
        createdBy: tActive._id,
      },
    ]);

    await PostModel.create([
      {
        authorId: tActive._id,
        content: 'Published sunrise photo from Munnar.',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date(),
        deletedAt: null,
      },
      {
        authorId: tActive._id,
        content: 'Pending moderation post.',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PENDING,
        deletedAt: null,
      },
      {
        authorId: tActive._id,
        content: 'Soft deleted post should not inflate counts.',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.REMOVED,
        deletedAt: new Date(),
      },
    ]);

    const res = await dispatchRequest<{
      success: boolean;
      data: {
        users: Record<string, number>;
        destinations: Record<string, number>;
        social: Record<string, number>;
        businessVerification: Record<string, number>;
      };
    }>(app, {
      method: 'GET',
      url: '/api/v1/admin/dashboard/overview',
      headers: { authorization: `Bearer ${admin.token}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.users, {
      total: 5,
      tourists: 2,
      businesses: 2,
      admins: 1,
      active: 3,
      suspended: 1,
    });
    assert.deepEqual(res.body.data.destinations, {
      total: 2,
      verified: 1,
      pending: 1,
      published: 1,
    });
    assert.deepEqual(res.body.data.social, {
      totalPosts: 2,
      pendingPosts: 1,
      publishedPosts: 1,
    });
    assert.deepEqual(res.body.data.businessVerification, {
      pending: 1,
      verified: 1,
      rejected: 0,
    });
  });

  it('verifies IXSCAN & zero blocking SORT stages with .explain("executionStats") on user directory queries', async () => {
    for (let i = 0; i < 6; i += 1) {
      await AccountModel.create({
        email: `explain.user${i}@example.com`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
        accountType: i % 2 === 0 ? ACCOUNT_TYPES.TOURIST : ACCOUNT_TYPES.BUSINESS,
        status: i % 3 === 0 ? ACCOUNT_STATUSES.SUSPENDED : ACCOUNT_STATUSES.ACTIVE,
      });
    }

    const unfilteredExplain = (await AccountModel.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const unfilteredPlan = (unfilteredExplain['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(unfilteredPlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(unfilteredPlan, 'SORT'), false);

    const filteredExplain = (await AccountModel.find({
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const filteredPlan = (filteredExplain['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(filteredPlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(filteredPlan, 'SORT'), false);

    const statusOnlyExplain = (await AccountModel.find({
      status: ACCOUNT_STATUSES.SUSPENDED,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const statusOnlyPlan = (statusOnlyExplain['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(statusOnlyPlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(statusOnlyPlan, 'SORT'), false);
  });

  it('suspends active user atomically, revokes real Session tokens, blocks login/refresh, and preserves revocations after reactivation', async () => {
    const admin = await createRealAdmin('sec.admin@kerala.gov.in');
    const hashedPassword = await passwordService.hash('ValidPass@2026!');
    const tourist = await AccountModel.create({
      email: 'real.tourist@example.com',
      passwordHash: hashedPassword,
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await TouristProfileModel.create({
      accountId: tourist._id,
      firstName: 'Kiran',
      lastName: 'Varma',
      preferredLanguage: PREFERRED_LANGUAGES.EN,
    });

    // Real login creates an active Session + refresh token
    const loginResult = await authService.login({
      email: 'real.tourist@example.com',
      password: 'ValidPass@2026!',
    });
    const issuedRefreshToken = loginResult.tokens.refreshToken;
    const issuedAccessToken = loginResult.tokens.accessToken;
    assert.ok(issuedRefreshToken);

    // Suspend via HTTP API
    const suspendRes = await dispatchRequest<{
      success: boolean;
      data: { revokedSessionsCount: number };
    }>(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist._id.toString()}/suspend`,
      headers: { authorization: `Bearer ${admin.token}` },
      body: { reason: 'Chargeback fraud investigation' },
    });
    assert.equal(suspendRes.status, 200);
    assert.equal(suspendRes.body.data.revokedSessionsCount, 1);

    // Real DB checks
    const dbSession = await SessionModel.findOne({ accountId: tourist._id }).lean();
    assert.ok(dbSession?.revokedAt);
    assert.equal(dbSession?.revocationReason, SESSION_REVOCATION_REASONS.ADMIN_SUSPENSION);

    const dbAuditSuspend = await AuditLogModel.findOne({
      targetEntityId: tourist._id,
      action: ADMIN_AUDIT_ACTIONS.USER_SUSPENDED,
    }).lean();
    assert.ok(dbAuditSuspend);
    assert.equal(dbAuditSuspend.reason, 'Chargeback fraud investigation');

    // Existing access token, login, and refresh token all blocked
    const protectedRes = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${issuedAccessToken}` },
    });
    assert.equal(protectedRes.status, 403);

    await assert.rejects(
      () =>
        authService.login({
          email: 'real.tourist@example.com',
          password: 'ValidPass@2026!',
        }),
      (err: unknown) => (err as { code?: string })?.code === 'ACCOUNT_SUSPENDED',
    );

    await assert.rejects(
      () => authService.refreshToken(issuedRefreshToken),
      (err: unknown) => (err as { code?: string })?.code === 'SESSION_REVOKED',
    );

    // Reactivate via HTTP API
    const reactRes = await dispatchRequest(app, {
      method: 'PATCH',
      url: `/api/v1/admin/users/${tourist._id.toString()}/reactivate`,
      headers: { authorization: `Bearer ${admin.token}` },
      body: { reason: 'Investigation cleared' },
    });
    assert.equal(reactRes.status, 200);

    // Old revoked refresh token MUST STILL FAIL even after reactivation!
    await assert.rejects(
      () => authService.refreshToken(issuedRefreshToken),
      (err: unknown) => (err as { code?: string })?.code === 'SESSION_REVOKED',
    );

    // Both audit logs preserved
    const audits = await AuditLogModel.find({ targetEntityId: tourist._id })
      .sort({ timestamp: 1 })
      .lean();
    assert.equal(audits.length, 2);
    assert.equal(audits[0].action, ADMIN_AUDIT_ACTIONS.USER_SUSPENDED);
    assert.equal(audits[1].action, ADMIN_AUDIT_ACTIONS.USER_REACTIVATED);

    // Immutability enforced even on real persisted Mongo records
    await assert.rejects(
      () => AuditLogModel.updateOne({ _id: audits[0]._id }, { $set: { reason: 'Altered' } }),
      /immutable append-only/,
    );

    // Sensitive keys stripped if inadvertently passed in state snapshots
    const redactedEntry = await auditLogService.recordAdminAction({
      actorAccountId: admin.id,
      actorAccountType: ACCOUNT_TYPES.ADMIN,
      actorAdminLevel: ADMIN_LEVELS.SUPER_ADMIN,
      action: ADMIN_AUDIT_ACTIONS.USER_SUSPENDED,
      targetEntityId: tourist._id,
      reason: 'Sanitization\x00 check',
      beforeState: {
        status: 'ACTIVE',
        passwordHash: 'leak',
        refreshToken: 'leak',
        storageKey: 'kyc/leak',
      },
      afterState: { status: 'SUSPENDED', authorization: 'Bearer leak' },
    });
    assert.deepEqual(redactedEntry.beforeState, { status: 'ACTIVE' });
    assert.deepEqual(redactedEntry.afterState, { status: 'SUSPENDED' });
    assert.equal(redactedEntry.reason, 'Sanitization check');

    // Verify real DB listing & detail retrieval exclude storageKey and passwordHash
    const biz = await AccountModel.create({
      email: 'real.biz@kerala.travel',
      passwordHash: hashedPassword,
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await BusinessProfileModel.create({
      accountId: biz._id,
      businessName: 'Alleppey Houseboats',
      businessType: BUSINESS_TYPES.TRAVEL_AGENCY,
      contactNumber: '+914772251000',
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
      documents: [
        {
          documentType: 'TOURISM_LICENSE',
          storageKey: 'kyc/private/secret-license-key-999.pdf',
          originalFileName: 'license.pdf',
          fileSize: 4096,
          mimeType: 'application/pdf',
        },
      ],
    });

    const listRes = await dispatchRequest<{ success: boolean; data: { items: unknown[] } }>(app, {
      method: 'GET',
      url: '/api/v1/admin/users?limit=10',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(listRes.status, 200);
    assert.equal(JSON.stringify(listRes.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(listRes.body).includes('storageKey'), false);
    assert.equal(JSON.stringify(listRes.body).includes('secret-license-key-999.pdf'), false);

    const detailRes = await dispatchRequest<{
      success: boolean;
      data: { profile: { documentsCount: number } };
    }>(app, {
      method: 'GET',
      url: `/api/v1/admin/users/${biz._id.toString()}`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.profile.documentsCount, 1);
    assert.equal(JSON.stringify(detailRes.body).includes('secret-license-key-999.pdf'), false);
    assert.equal(JSON.stringify(detailRes.body).includes('passwordHash'), false);
  });

  it('handles concurrent duplicate /suspend requests atomically with single audit log and rolls back cleanly on audit failure', async () => {
    const admin = await createRealAdmin('race.admin@kerala.gov.in');
    const tourist = await AccountModel.create({
      email: 'race.target@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await SessionModel.create({
      accountId: tourist._id,
      refreshTokenHash: 'a'.repeat(64),
      familyId: 'fam-1',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    // Part A: Concurrent duplicate /suspend
    const [resA, resB] = await Promise.all([
      dispatchRequest<{ error?: { code: string } }>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/users/${tourist._id.toString()}/suspend`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Concurrent strike A' },
      }),
      dispatchRequest<{ error?: { code: string } }>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/users/${tourist._id.toString()}/suspend`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Concurrent strike B' },
      }),
    ]);

    const statuses = [resA.status, resB.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [200, 409]);
    const totalAudits = await AuditLogModel.countDocuments({ targetEntityId: tourist._id });
    assert.equal(totalAudits, 1);

    // Part B: ACID Transaction Rollback if audit write fails
    const tourist2 = await AccountModel.create({
      email: 'rollback.target@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    const sess2 = await SessionModel.create({
      accountId: tourist2._id,
      refreshTokenHash: 'b'.repeat(64),
      familyId: 'fam-2',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const originalRecordAdminAction = auditLogService.recordAdminAction.bind(auditLogService);
    auditLogService.recordAdminAction = async () => {
      throw new Error('Simulated audit log failure');
    };

    try {
      const failRes = await dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/users/${tourist2._id.toString()}/suspend`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Rollback atomicity test' },
      });
      assert.equal(failRes.status, 500);
    } finally {
      auditLogService.recordAdminAction = originalRecordAdminAction;
    }

    const reloadedAccount = await AccountModel.findById(tourist2._id).lean();
    const reloadedSession = await SessionModel.findById(sess2._id).lean();
    assert.equal(reloadedAccount?.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(reloadedSession?.revokedAt, null);
  });
});
