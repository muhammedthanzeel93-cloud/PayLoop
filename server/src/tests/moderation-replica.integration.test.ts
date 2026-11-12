import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose, { ClientSession, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_SUBMISSION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  POST_VISIBILITIES,
  PREFERRED_LANGUAGES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '@kerala-tourism/constants';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import {
  AuditLogModel,
  AuditLogService,
  auditLogService,
} from '../modules/admin';
import type { RecordAdminAuditInput } from '../modules/admin/audit-log.service';
import { authRepository } from '../modules/auth/auth.repository';
import {
  moderationRepository,
  moderationService,
} from '../modules/moderation';
import {
  AccountModel,
  AdminProfileModel,
  DestinationModel,
  DestinationSubmissionModel,
  FollowModel,
  PostCommentModel,
  PostModel,
  ReportModel,
  TouristProfileModel,
} from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
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

class ThrowingAuditService extends AuditLogService {
  public override async recordAdminAction(
    _input: RecordAdminAuditInput,
    _session?: ClientSession,
  ): Promise<never> {
    throw new Error('Simulated mid-transaction audit failure');
  }
}

describe('Day 18 Content Moderation & Reporting Replica Set Integration Tests (Real MongoDB)', () => {
  const app = createApp();
  let mongodProc: ChildProcess | null = null;
  let tmpDbPath = '';

  const createRealAdmin = async (email: string) => {
    const account = await AccountModel.create({
      email,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await AdminProfileModel.create({
      accountId: account._id,
      displayName: 'Moderation Supervisor',
      adminLevel: ADMIN_LEVELS.SUPER_ADMIN,
      permissions: [
        ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE,
        ADMIN_PERMISSIONS.MODERATE_DESTINATIONS,
        ADMIN_PERMISSIONS.MODERATE_POSTS,
        ADMIN_PERMISSIONS.MODERATE_COMMENTS,
        ADMIN_PERMISSIONS.REVIEW_REPORTS,
      ],
      mfaEnabled: true,
    });
    const token = jwtService.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });
    return { id: account._id, token };
  };

  const createRealTourist = async (email: string, firstName: string, lastName: string) => {
    const account = await AccountModel.create({
      email,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaA',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    await TouristProfileModel.create({
      accountId: account._id,
      firstName,
      lastName,
      preferredLanguage: PREFERRED_LANGUAGES.EN,
    });
    const token = jwtService.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });
    return { id: account._id, token };
  };

  before(async () => {
    const port = await findFreePort();
    tmpDbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kerala-mod-rs-'));

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

    const replicaUri = `mongodb://127.0.0.1:${port}/kerala_mod_replica_test?replicaSet=rs0&serverSelectionTimeoutMS=5000`;
    await mongoose.connect(replicaUri);

    await Promise.all([
      AccountModel.syncIndexes(),
      TouristProfileModel.syncIndexes(),
      AdminProfileModel.syncIndexes(),
      DestinationModel.syncIndexes(),
      DestinationSubmissionModel.syncIndexes(),
      FollowModel.syncIndexes(),
      PostModel.syncIndexes(),
      PostCommentModel.syncIndexes(),
      ReportModel.syncIndexes(),
      AuditLogModel.syncIndexes(),
    ]);

    authMiddleware.setRepository(authRepository);
    authorizationMiddleware.setRepository(authRepository);
    moderationService.setRepository(moderationRepository);
    moderationService.setAuditService(auditLogService);
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
    moderationService.setAuditService(auditLogService);
    await Promise.all([
      AccountModel.deleteMany({}),
      TouristProfileModel.deleteMany({}),
      AdminProfileModel.deleteMany({}),
      DestinationModel.deleteMany({}),
      DestinationSubmissionModel.deleteMany({}),
      FollowModel.deleteMany({}),
      PostModel.deleteMany({}),
      PostCommentModel.deleteMany({}),
      ReportModel.deleteMany({}),
      AuditLogModel.collection.deleteMany({}),
    ]);
  });

  it('commits destination approval + VERIFIED DRAFT Destination + AuditLog atomically, and rolls back all writes on failure', async () => {
    const admin = await createRealAdmin('dest.mod@kerala.gov.in');
    const tourist = await createRealTourist('dest.sub@example.com', 'Asha', 'Menon');

    const submission = await DestinationSubmissionModel.create({
      submittedBy: tourist.id,
      name: 'Silent Valley Rim',
      description: 'Scenic overlook near Silent Valley buffer boundary in Palakkad.',
      categoryIds: [new Types.ObjectId()],
      district: 'Palakkad',
      submittedLocation: { type: 'Point', coordinates: [76.438, 11.132] },
      submittedAddress: 'Mukkali Forest Checkpost Road, Palakkad',
      imageMediaIds: ['media-silent-valley-1'],
      submissionStatus: DESTINATION_SUBMISSION_STATUSES.PENDING,
    });

    // Simulate audit write failure to assert real MongoDB transaction rollback
    moderationService.setAuditService(new ThrowingAuditService());
    try {
      const failedRes = await dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${submission._id.toString()}/approve`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reviewNotes: 'Attempting commit before simulated error' },
      });
      assert.equal(failedRes.status, 500);
    } finally {
      moderationService.setAuditService(auditLogService);
    }

    const rolledBackSub = await DestinationSubmissionModel.findById(submission._id).lean();
    assert.equal(rolledBackSub?.submissionStatus, DESTINATION_SUBMISSION_STATUSES.PENDING);
    assert.equal(await DestinationModel.countDocuments({}), 0);
    assert.equal(await AuditLogModel.countDocuments({}), 0);

    // Concurrent approval race -> exactly 1 wins (200), 1 loses (409)
    const [res1, res2] = await Promise.all([
      dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${submission._id.toString()}/approve`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reviewNotes: 'Verified official coordinates.' },
      }),
      dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${submission._id.toString()}/approve`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reviewNotes: 'Concurrent duplicate call.' },
      }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);

    const approvedSub = await DestinationSubmissionModel.findById(submission._id).lean();
    assert.equal(approvedSub?.submissionStatus, DESTINATION_SUBMISSION_STATUSES.APPROVED);
    assert.ok(approvedSub?.destinationId);

    const createdDest = await DestinationModel.findById(approvedSub?.destinationId).lean();
    assert.equal(createdDest?.verificationStatus, DESTINATION_VERIFICATION_STATUSES.VERIFIED);
    assert.equal(createdDest?.publicationStatus, DESTINATION_PUBLICATION_STATUSES.DRAFT);
    assert.equal(await DestinationModel.countDocuments({}), 1);
    assert.equal(
      await AuditLogModel.countDocuments({
        action: ADMIN_AUDIT_ACTIONS.DESTINATION_SUBMISSION_APPROVED,
      }),
      1,
    );
  });

  it('excludes moderated REMOVED posts from public feed, single post endpoint, and following feed', async () => {
    const admin = await createRealAdmin('post.mod@kerala.gov.in');
    const author = await createRealTourist('post.author@example.com', 'Dev', 'Nair');
    const follower = await createRealTourist('post.follower@example.com', 'Meera', 'Pillai');

    await FollowModel.create({
      followerId: follower.id,
      followingId: author.id,
    });

    const livePost = await PostModel.create({
      authorId: author.id,
      content: 'Live public post that should disappear after moderation removal.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: new Date(),
      deletedAt: null,
    });

    const beforePublic = await dispatchRequest<{
      success: boolean;
      data: Array<{ id: string }>;
    }>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(beforePublic.status, 200);
    assert.equal(
      beforePublic.body.data.some((p) => p.id === livePost._id.toString()),
      true,
    );

    const beforeFollow = await dispatchRequest<{
      success: boolean;
      data: Array<{ id: string }>;
    }>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${follower.token}` },
    });
    assert.equal(beforeFollow.status, 200);
    assert.equal(
      beforeFollow.body.data.some((p) => p.id === livePost._id.toString()),
      true,
    );

    const remRes = await dispatchRequest(app, {
      method: 'PATCH',
      url: `/api/v1/admin/moderation/posts/${livePost._id.toString()}/remove`,
      headers: { authorization: `Bearer ${admin.token}` },
      body: { reason: 'Violates community safety guidelines.' },
    });
    assert.equal(remRes.status, 200);

    const afterPublic = await dispatchRequest<{
      success: boolean;
      data: Array<{ id: string }>;
    }>(app, {
      method: 'GET',
      url: '/api/v1/posts',
    });
    assert.equal(
      afterPublic.body.data.some((p) => p.id === livePost._id.toString()),
      false,
    );

    const afterSingle = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/posts/${livePost._id.toString()}`,
    });
    assert.equal(afterSingle.status, 404);

    const afterFollow = await dispatchRequest<{
      success: boolean;
      data: Array<{ id: string }>;
    }>(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${follower.token}` },
    });
    assert.equal(
      afterFollow.body.data.some((p) => p.id === livePost._id.toString()),
      false,
    );
  });

  it('maintains atomic commentsCount integrity, rolls back failed comment moderation, and blocks concurrent double decrement', async () => {
    const admin = await createRealAdmin('comment.mod@kerala.gov.in');
    const author = await createRealTourist('c.author@example.com', 'Rohan', 'Das');

    const post = await PostModel.create({
      authorId: author.id,
      content: 'Kovalam lighthouse sunset post.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: new Date(),
      commentsCount: 1,
      deletedAt: null,
    });
    const comment = await PostCommentModel.create({
      postId: post._id,
      authorId: author.id,
      content: 'Comment subject to moderation test.',
      status: POST_COMMENT_STATUSES.ACTIVE,
      deletedAt: null,
    });

    // Rollback verification on failure
    moderationService.setAuditService(new ThrowingAuditService());
    try {
      const failRes = await dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${comment._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Triggered simulated error' },
      });
      assert.equal(failRes.status, 500);
    } finally {
      moderationService.setAuditService(auditLogService);
    }

    const postAfterRollback = await PostModel.findById(post._id).lean();
    const commentAfterRollback = await PostCommentModel.findById(comment._id).lean();
    assert.equal(postAfterRollback?.commentsCount, 1);
    assert.equal(commentAfterRollback?.status, POST_COMMENT_STATUSES.ACTIVE);

    // Concurrent removal race -> exactly 1 succeeds (200), 1 gets 409, commentsCount ends at 0
    const [r1, r2] = await Promise.all([
      dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${comment._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Policy violation.' },
      }),
      dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${comment._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Duplicate concurrent remove.' },
      }),
    ]);
    assert.deepEqual([r1.status, r2.status].sort((a, b) => a - b), [200, 409]);

    const postAfterRemove = await PostModel.findById(post._id).lean();
    assert.equal(postAfterRemove?.commentsCount, 0);

    // Public comments listing hides removed comment
    const publicComments = await dispatchRequest<{
      success: boolean;
      data: Array<{ id: string }>;
    }>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id.toString()}/comments`,
    });
    assert.equal(publicComments.status, 200);
    assert.equal(publicComments.body.data.length, 0);

    // Restore comment restores count to 1
    const restoreRes = await dispatchRequest(app, {
      method: 'PATCH',
      url: `/api/v1/admin/moderation/comments/${comment._id.toString()}/restore`,
      headers: { authorization: `Bearer ${admin.token}` },
      body: { reason: 'Cleared on appeal.' },
    });
    assert.equal(restoreRes.status, 200);
    const postAfterRestore = await PostModel.findById(post._id).lean();
    assert.equal(postAfterRestore?.commentsCount, 1);
  });

  it('enforces partial unique active report index, concurrent report review safety, audit immutability, and IXSCAN query plans', async () => {
    const admin = await createRealAdmin('report.mod@kerala.gov.in');
    const reporter = await createRealTourist('rep.user@example.com', 'Sita', 'Varma');
    const targetAuthor = await createRealTourist('tar.user@example.com', 'Arjun', 'Menon');

    const post = await PostModel.create({
      authorId: targetAuthor.id,
      content: 'Reported travel post for concurrency & IXSCAN test.',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: new Date(),
      deletedAt: null,
    });

    // Two concurrent report submissions -> partial unique index ensures 1 x 201 + 1 x 409
    const [c1, c2] = await Promise.all([
      dispatchRequest<{ data?: { id: string } }>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      }),
      dispatchRequest<{ data?: { id: string } }>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      }),
    ]);
    assert.deepEqual([c1.status, c2.status].sort((a, b) => a - b), [201, 409]);
    assert.equal(await ReportModel.countDocuments({}), 1);

    const createdReportId = c1.body?.data?.id ?? c2.body?.data?.id ?? '';
    assert.ok(createdReportId);

    // Concurrent report review (RESOLVED vs DISMISSED) -> 1 x 200, 1 x 409
    const [rev1, rev2] = await Promise.all([
      dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/reports/${createdReportId}/review`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { status: REPORT_STATUSES.RESOLVED, moderatorNotes: 'Resolved cleanly.' },
      }),
      dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/reports/${createdReportId}/review`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { status: REPORT_STATUSES.DISMISSED, moderatorNotes: 'Concurrent dismiss.' },
      }),
    ]);
    assert.deepEqual([rev1.status, rev2.status].sort((a, b) => a - b), [200, 409]);

    // Post-resolution: same reporter may submit a fresh report against same target
    const postResolve = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/v1/tourist/reports',
      headers: { authorization: `Bearer ${reporter.token}` },
      body: {
        targetType: REPORT_TARGET_TYPES.POST,
        targetId: post._id.toString(),
        reason: REPORT_REASONS.HARASSMENT,
      },
    });
    assert.equal(postResolve.status, 201);

    // AuditLog immutability guards block updates/deletions
    const sampleAudit = await AuditLogModel.findOne({}).lean();
    assert.ok(sampleAudit);
    await assert.rejects(
      () =>
        AuditLogModel.updateOne(
          { _id: sampleAudit._id },
          { $set: { reason: 'Tampered' } },
        ),
      /immutable/i,
    );
    await assert.rejects(
      () => AuditLogModel.deleteOne({ _id: sampleAudit._id }),
      /immutable/i,
    );

    // IXSCAN / ZERO SORT verification via .explain('executionStats')
    const explainActiveReports = (await ReportModel.find({
      targetType: REPORT_TARGET_TYPES.POST,
      targetId: post._id,
      status: { $in: [REPORT_STATUSES.PENDING, REPORT_STATUSES.UNDER_REVIEW] },
    }).explain('executionStats')) as unknown as Record<string, unknown>;
    const activePlan = (explainActiveReports['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(activePlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(activePlan, 'COLLSCAN'), false);

    const explainReporterHistory = (await ReportModel.find({
      reporterId: reporter.id,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const reporterPlan = (explainReporterHistory['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(reporterPlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(reporterPlan, 'SORT'), false);

    const explainAdminTriage = (await ReportModel.find({
      status: REPORT_STATUSES.PENDING,
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const triagePlan = (explainAdminTriage['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(triagePlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(triagePlan, 'SORT'), false);

    const explainModerationPosts = (await PostModel.find({
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const postPlan = (explainModerationPosts['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(postPlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(postPlan, 'SORT'), false);

    const explainModerationComments = (await PostCommentModel.find({
      status: POST_COMMENT_STATUSES.ACTIVE,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats')) as unknown as Record<string, unknown>;
    const commentPlan = (explainModerationComments['queryPlanner'] as Record<string, unknown>)?.[
      'winningPlan'
    ] as Record<string, unknown>;
    assert.equal(hasPlanStage(commentPlan, 'IXSCAN'), true);
    assert.equal(hasPlanStage(commentPlan, 'SORT'), false);
  });
});
