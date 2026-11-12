import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES } from '@kerala-tourism/constants';
import { env } from '../config/env';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { authRepository } from '../modules/auth/auth.repository';
import { FollowModel } from '../modules/users/follow.model';
import { followRepository } from '../modules/users/follow.repository';
import { followService } from '../modules/users/follow.service';
import {
  AccountModel,
  TouristProfileModel,
} from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
import { dispatchRequest } from './testUtils';

const asBody = (body: unknown): Record<string, unknown> => body as Record<string, unknown>;

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

describe('Day 15 Follow & Unfollow Replica Set Integration Tests (Real MongoDB)', () => {
  const app = createApp();
  let mongodProc: ChildProcess | null = null;
  let tmpDbPath = '';

  const seedTourist = async (
    email: string,
    firstName: string,
    lastName: string,
    options?: {
      bio?: string;
      status?: (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES];
      accountType?: (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];
    },
  ): Promise<{ id: string; token: string }> => {
    const account = await AccountModel.create({
      email,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo',
      accountType: options?.accountType ?? ACCOUNT_TYPES.TOURIST,
      status: options?.status ?? ACCOUNT_STATUSES.ACTIVE,
    });

    if ((options?.accountType ?? ACCOUNT_TYPES.TOURIST) === ACCOUNT_TYPES.TOURIST) {
      await TouristProfileModel.create({
        accountId: account._id,
        firstName,
        lastName,
        preferredLanguage: 'EN',
        bio: options?.bio,
        followersCount: 0,
        followingCount: 0,
      });
    }

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
    tmpDbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kerala-follow-rs-'));

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

    const replicaUri = `mongodb://127.0.0.1:${port}/kerala_follow_replica_test?replicaSet=rs0&serverSelectionTimeoutMS=5000`;
    await mongoose.connect(replicaUri);

    await Promise.all([
      AccountModel.syncIndexes(),
      TouristProfileModel.syncIndexes(),
      FollowModel.syncIndexes(),
    ]);

    authMiddleware.setRepository(authRepository);
    followService.setAuthRepository(authRepository);
    followService.setRepository(followRepository);
  });

  after(async () => {
    resetRateLimiter();

    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.admin().command({ shutdown: 1, force: true });
      }
    } catch {
      // mongod closes its socket mid-shutdown command
    }

    await mongoose.disconnect().catch(() => undefined);

    if (mongodProc && mongodProc.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          mongodProc?.kill('SIGKILL');
          resolve();
        }, 4000);
        mongodProc?.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    if (tmpDbPath) {
      try {
        fs.rmSync(tmpDbPath, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
      } catch {
        // Ignore transient Windows file handle release timing in temp dir
      }
    }
  });

  beforeEach(async () => {
    resetRateLimiter();
    authMiddleware.setRepository(authRepository);
    followService.setAuthRepository(authRepository);
    followService.setRepository(followRepository);
    await Promise.all([
      FollowModel.deleteMany({}),
      TouristProfileModel.deleteMany({}),
      AccountModel.deleteMany({}),
    ]);
  });

  it('enforces idx_follows_unique under 5 concurrent duplicate POST /follow requests (1x 201, 4x 409, count === 1)', async () => {
    const caller = await seedTourist('caller.dup@kerala.test', 'Caller', 'One');
    const target = await seedTourist('target.dup@kerala.test', 'Target', 'Two');

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        dispatchRequest(app, {
          method: 'POST',
          url: `/api/v1/tourist/users/${target.id}/follow`,
          headers: { authorization: `Bearer ${caller.token}` },
        }),
      ),
    );

    const statusCounts = responses.reduce<Record<number, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    assert.equal(statusCounts[201], 1);
    assert.equal(statusCounts[409], 4);

    const edgeCount = await FollowModel.countDocuments({
      followerId: caller.id,
      followingId: target.id,
    });
    assert.equal(edgeCount, 1);

    const [callerProfile, targetProfile] = await Promise.all([
      TouristProfileModel.findOne({ accountId: caller.id }),
      TouristProfileModel.findOne({ accountId: target.id }),
    ]);
    assert.equal(callerProfile?.followingCount, 1);
    assert.equal(targetProfile?.followersCount, 1);
  });

  it('retries WriteConflict cleanly when 5 distinct tourists simultaneously follow the same target', async () => {
    const target = await seedTourist('popular@kerala.test', 'Popular', 'Guide');
    const callers = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        seedTourist(`fan${idx}@kerala.test`, `Fan${idx}`, 'Traveler'),
      ),
    );

    const responses = await Promise.all(
      callers.map((caller) =>
        dispatchRequest(app, {
          method: 'POST',
          url: `/api/v1/tourist/users/${target.id}/follow`,
          headers: { authorization: `Bearer ${caller.token}` },
        }),
      ),
    );

    for (const res of responses) {
      assert.equal(res.status, 201);
    }

    const totalEdges = await FollowModel.countDocuments({ followingId: target.id });
    assert.equal(totalEdges, 5);

    const targetProfile = await TouristProfileModel.findOne({ accountId: target.id });
    assert.equal(targetProfile?.followersCount, 5);

    const callerProfiles = await TouristProfileModel.find({
      accountId: { $in: callers.map((c) => new Types.ObjectId(c.id)) },
    });
    for (const p of callerProfiles) {
      assert.equal(p.followingCount, 1);
    }
  });

  it('handles concurrent duplicate DELETE /follow safely (1x 200, 1x 404, non-negative counts === 0)', async () => {
    const caller = await seedTourist('unfollow.caller@kerala.test', 'Caller', 'Unfollow');
    const target = await seedTourist('unfollow.target@kerala.test', 'Target', 'Unfollow');

    const createRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${target.id}/follow`,
      headers: { authorization: `Bearer ${caller.token}` },
    });
    assert.equal(createRes.status, 201);

    const [r1, r2] = await Promise.all([
      dispatchRequest(app, {
        method: 'DELETE',
        url: `/api/v1/tourist/users/${target.id}/follow`,
        headers: { authorization: `Bearer ${caller.token}` },
      }),
      dispatchRequest(app, {
        method: 'DELETE',
        url: `/api/v1/tourist/users/${target.id}/follow`,
        headers: { authorization: `Bearer ${caller.token}` },
      }),
    ]);

    const sortedStatuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(sortedStatuses, [200, 404]);

    const remainingEdges = await FollowModel.countDocuments({
      followerId: caller.id,
      followingId: target.id,
    });
    assert.equal(remainingEdges, 0);

    const [callerProfile, targetProfile] = await Promise.all([
      TouristProfileModel.findOne({ accountId: caller.id }),
      TouristProfileModel.findOne({ accountId: target.id }),
    ]);
    assert.equal(callerProfile?.followingCount, 0);
    assert.equal(targetProfile?.followersCount, 0);
  });

  it('maintains counter parity across interleaved concurrent follow and unfollow transactions', async () => {
    const target = await seedTourist('parity.target@kerala.test', 'Parity', 'Target');
    const initialFollowers = await Promise.all([
      seedTourist('p0@kerala.test', 'P0', 'User'),
      seedTourist('p1@kerala.test', 'P1', 'User'),
    ]);
    const newFollowers = await Promise.all([
      seedTourist('p2@kerala.test', 'P2', 'User'),
      seedTourist('p3@kerala.test', 'P3', 'User'),
      seedTourist('p4@kerala.test', 'P4', 'User'),
    ]);

    await Promise.all(
      initialFollowers.map((u) =>
        dispatchRequest(app, {
          method: 'POST',
          url: `/api/v1/tourist/users/${target.id}/follow`,
          headers: { authorization: `Bearer ${u.token}` },
        }),
      ),
    );

    const mixedOps = [
      ...initialFollowers.map((u) =>
        dispatchRequest(app, {
          method: 'DELETE',
          url: `/api/v1/tourist/users/${target.id}/follow`,
          headers: { authorization: `Bearer ${u.token}` },
        }),
      ),
      ...newFollowers.map((u) =>
        dispatchRequest(app, {
          method: 'POST',
          url: `/api/v1/tourist/users/${target.id}/follow`,
          headers: { authorization: `Bearer ${u.token}` },
        }),
      ),
    ];

    const results = await Promise.all(mixedOps);
    for (const res of results) {
      assert.ok(res.status === 200 || res.status === 201);
    }

    const dbFollowCount = await FollowModel.countDocuments({ followingId: target.id });
    const targetProfile = await TouristProfileModel.findOne({ accountId: target.id });
    assert.equal(dbFollowCount, 3);
    assert.equal(targetProfile?.followersCount, dbFollowCount);
  });

  it('aborts real MongoDB transaction cleanly on mid-flight error leaving zero follow edges or count drift', async () => {
    const caller = await seedTourist('abort.caller@kerala.test', 'Abort', 'Caller');
    const target = await seedTourist('abort.target@kerala.test', 'Abort', 'Target');

    await assert.rejects(
      followRepository.withTransaction(async (session) => {
        await followRepository.createFollow(caller.id, target.id, session);
        await followRepository.adjustFollowCounts(caller.id, target.id, 1, session);
        throw new Error('Simulated crash prior to transaction commit');
      }),
      /Simulated crash prior to transaction commit/,
    );

    const dbEdges = await FollowModel.countDocuments({});
    assert.equal(dbEdges, 0);

    const [callerProfile, targetProfile] = await Promise.all([
      TouristProfileModel.findOne({ accountId: caller.id }),
      TouristProfileModel.findOne({ accountId: target.id }),
    ]);
    assert.equal(callerProfile?.followingCount, 0);
    assert.equal(targetProfile?.followersCount, 0);
  });

  it('aggregates followers/following via $lookup + $facet excluding inactive accounts before pagination and deterministic tie-break sort', async () => {
    const target = await seedTourist('agg.target@kerala.test', 'Lakshmi', 'Menon');
    const u1 = await seedTourist('agg1@kerala.test', 'Active1', 'Traveler', { bio: 'Bio 1' });
    const u2 = await seedTourist('agg2@kerala.test', 'Active2', 'Traveler', { bio: 'Bio 2' });
    const u3 = await seedTourist('agg3@kerala.test', 'Active3', 'Traveler', { bio: 'Bio 3' });
    const suspended = await seedTourist('agg.susp@kerala.test', 'Suspended', 'User', {
      status: ACCOUNT_STATUSES.SUSPENDED,
    });
    const deactivated = await seedTourist('agg.deact@kerala.test', 'Deactivated', 'User', {
      status: ACCOUNT_STATUSES.DEACTIVATED,
    });
    const business = await seedTourist('agg.biz@kerala.test', 'Business', 'Account', {
      accountType: ACCOUNT_TYPES.BUSINESS,
    });

    const fixedTieDate = new Date('2026-11-11T10:00:00.000Z');
    const olderDate = new Date('2026-11-10T10:00:00.000Z');

    // Insert edges directly so we can test deterministic (createdAt DESC, _id DESC) + filtering of stale/inactive edges
    const olderEdge = await FollowModel.create({
      followerId: u1.id,
      followingId: target.id,
      createdAt: olderDate,
    });
    assert.ok(olderEdge._id);

    const tieEdgeA = await FollowModel.create({
      followerId: u2.id,
      followingId: target.id,
      createdAt: fixedTieDate,
    });
    const suspEdge = await FollowModel.create({
      followerId: suspended.id,
      followingId: target.id,
      createdAt: fixedTieDate,
    });
    const deactEdge = await FollowModel.create({
      followerId: deactivated.id,
      followingId: target.id,
      createdAt: fixedTieDate,
    });
    const bizEdge = await FollowModel.create({
      followerId: business.id,
      followingId: target.id,
      createdAt: fixedTieDate,
    });
    const tieEdgeB = await FollowModel.create({
      followerId: u3.id,
      followingId: target.id,
      createdAt: fixedTieDate,
    });
    assert.ok(suspEdge._id && deactEdge._id && bizEdge._id);

    // Expect newest createdAt first, then descending _id tie-break: tieEdgeB -> tieEdgeA -> olderEdge
    const expectedTieOrder =
      tieEdgeB._id.toString().localeCompare(tieEdgeA._id.toString()) > 0
        ? [u3.id, u2.id]
        : [u2.id, u3.id];

    const page1Res = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${target.id}/followers?page=1&limit=2`,
    });
    assert.equal(page1Res.status, 200);

    const p1Body = asBody(page1Res.body);
    const p1Items = p1Body.data as Array<Record<string, unknown>>;
    const p1Meta = p1Body.pagination as Record<string, unknown>;
    assert.equal(p1Meta.total, 3);
    assert.equal(p1Meta.totalPages, 2);
    assert.deepEqual(
      p1Items.map((item) => item.id),
      expectedTieOrder,
    );
    assert.equal(p1Items[0].email, undefined);
    assert.equal(p1Items[0].status, undefined);

    const page2Res = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${target.id}/followers?page=2&limit=2`,
    });
    assert.equal(page2Res.status, 200);
    const p2Items = asBody(page2Res.body).data as Array<Record<string, unknown>>;
    assert.equal(p2Items.length, 1);
    assert.equal(p2Items[0].id, u1.id);

    // Also test /following endpoint aggregation for u1 -> [target]
    const followingRes = await dispatchRequest(app, {
      method: 'GET',
      url: `/api/v1/users/${u1.id}/following`,
    });
    assert.equal(followingRes.status, 200);
    const followingItems = asBody(followingRes.body).data as Array<Record<string, unknown>>;
    assert.equal(followingItems.length, 1);
    assert.equal(followingItems[0].id, target.id);
    assert.equal(followingItems[0].displayName, 'Lakshmi Menon');
  });

  it('commits real replica-set transactions when NODE_ENV=production', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origEnvNodeEnv = env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'production';
      (env as { NODE_ENV: string }).NODE_ENV = 'production';

      const caller = await seedTourist('prod.caller@kerala.test', 'Prod', 'Caller');
      const target = await seedTourist('prod.target@kerala.test', 'Prod', 'Target');

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: `/api/v1/tourist/users/${target.id}/follow`,
        headers: { authorization: `Bearer ${caller.token}` },
      });

      assert.equal(res.status, 201);
      const count = await FollowModel.countDocuments({
        followerId: caller.id,
        followingId: target.id,
      });
      assert.equal(count, 1);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      (env as { NODE_ENV: string }).NODE_ENV = origEnvNodeEnv;
    }
  });
});
