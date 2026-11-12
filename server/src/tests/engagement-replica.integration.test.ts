import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';
import { jwtService } from '../shared/security/jwt.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { AuthRepository } from '../modules/auth/auth.repository';
import { PostsRepository } from '../modules/posts/post.repository';
import { postsService } from '../modules/posts/post.service';
import { PostEngagementRepository } from '../modules/posts/post-engagement.repository';
import { postEngagementService } from '../modules/posts/post-engagement.service';
import {
  AccountModel,
  PostCommentModel,
  PostLikeModel,
  PostModel,
  PostRepostModel,
  TouristProfileModel,
} from '../shared/models';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES } from '@kerala-tourism/constants';
import { PostCommentDto } from '@kerala-tourism/shared-types';

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  commentsCount?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

const getFreePort = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        return reject(new Error('Failed to bind ephemeral port for local mongod'));
      }
      const { port } = addr;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const startReplicaSetMongod = async (
  port: number,
  dbPath: string,
): Promise<{ proc: ChildProcess; uri: string }> => {
  const proc = spawn(
    'mongod',
    [
      '--replSet',
      'rs0',
      '--port',
      String(port),
      '--dbpath',
      dbPath,
      '--bind_ip',
      '127.0.0.1',
      '--logpath',
      path.join(dbPath, 'mongod.log'),
    ],
    { stdio: 'ignore' },
  );

  const directUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
  let setupConn: mongoose.Connection | null = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      setupConn = await mongoose
        .createConnection(directUri, { serverSelectionTimeoutMS: 500 })
        .asPromise();
      break;
    } catch {
      await sleep(250);
    }
  }

  if (!setupConn) {
    proc.kill('SIGTERM');
    throw new Error(`Timed out waiting for local mongod replica set on port ${port}`);
  }

  const admin = setupConn.db!.admin();
  await admin.command({
    replSetInitiate: {
      _id: 'rs0',
      members: [{ _id: 0, host: `127.0.0.1:${port}` }],
    },
  });

  // Wait for primary election
  let isPrimary = false;
  for (let i = 0; i < 40; i += 1) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary === true) {
      isPrimary = true;
      break;
    }
    await sleep(250);
  }

  await setupConn.close();

  if (!isPrimary) {
    proc.kill('SIGTERM');
    throw new Error('Local mongod rs0 failed to elect writable primary in time');
  }

  return {
    proc,
    uri: `mongodb://127.0.0.1:${port}/kerala_engagement_rs_test?replicaSet=rs0`,
  };
};

let mongodProc: ChildProcess | null = null;
let tmpDbPath = '';
const app = createApp();
const realAuthRepo = new AuthRepository();
const realPostsRepo = new PostsRepository();
const realEngageRepo = new PostEngagementRepository();

const seedTouristAndToken = async (firstName = 'Kavya', lastName = 'Varma') => {
  const account = await AccountModel.create({
    email: `rs-tourist-${new Types.ObjectId().toString()}@example.com`,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashvalueforunit123456',
    accountType: ACCOUNT_TYPES.TOURIST,
    status: ACCOUNT_STATUSES.ACTIVE,
  });
  await TouristProfileModel.create({
    accountId: account._id,
    firstName,
    lastName,
    preferredLanguage: 'EN',
  });
  const token = jwtService.signAccessToken({
    id: account._id.toString(),
    email: account.email,
    accountType: account.accountType,
    status: account.status,
  });
  return { account, token };
};

test('Day 14 — Real MongoDB 8.2 Replica-Set ACID & Concurrency Integration Suite', async (t) => {
  before(async () => {
    tmpDbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-rs0-'));
    const port = await getFreePort();
    const started = await startReplicaSetMongod(port, tmpDbPath);
    mongodProc = started.proc;

    await mongoose.connect(started.uri, { serverSelectionTimeoutMS: 5000 });
    await Promise.all([
      AccountModel.syncIndexes(),
      TouristProfileModel.syncIndexes(),
      PostModel.syncIndexes(),
      PostLikeModel.syncIndexes(),
      PostCommentModel.syncIndexes(),
      PostRepostModel.syncIndexes(),
    ]);
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db
          .admin()
          .command({ shutdown: 1, force: true })
          .catch(() => undefined);
      }
    } finally {
      await mongoose.disconnect().catch(() => undefined);
    }

    if (mongodProc) {
      const proc = mongodProc;
      if (proc.exitCode === null && proc.signalCode === null) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (proc.exitCode === null) {
              proc.kill('SIGKILL');
            }
            resolve();
          }, 3000);
          proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          proc.kill('SIGTERM');
        });
      }
    }

    if (tmpDbPath && fs.existsSync(tmpDbPath)) {
      try {
        fs.rmSync(tmpDbPath, {
          recursive: true,
          force: true,
          maxRetries: 15,
          retryDelay: 200,
        });
      } catch {
        // Best-effort temp cleanup in case Windows file indexing briefly locks os.tmpdir()
      }
    }
  });

  beforeEach(async () => {
    resetRateLimiter();
    authMiddleware.setRepository(realAuthRepo);
    authorizationMiddleware.setRepository(realAuthRepo);
    postsService.setRepository(realPostsRepo);
    postsService.setAuthRepository(realAuthRepo);
    postEngagementService.setRepository(realEngageRepo);
    postEngagementService.setPostsRepository(realPostsRepo);
    postEngagementService.setAuthRepository(realAuthRepo);

    await Promise.all([
      PostLikeModel.deleteMany({}),
      PostCommentModel.deleteMany({}),
      PostRepostModel.deleteMany({}),
      PostModel.deleteMany({}),
      TouristProfileModel.deleteMany({}),
      AccountModel.deleteMany({}),
    ]);
  });

  await t.test('1. Real MongoDB unique index + ACID tx prevents concurrent duplicate likes cleanly', async () => {
    const tourist = await seedTouristAndToken();
    const post = await PostModel.create({
      authorId: tourist.account._id,
      content: 'Live replica-set duplicate like race check',
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        dispatchRequest<ApiResponse>(app, {
          method: 'POST',
          url: `/api/v1/tourist/posts/${post._id}/likes`,
          headers: { authorization: `Bearer ${tourist.token}` },
        }),
      ),
    );

    const successes = responses.filter((r) => r.status === 201).length;
    const conflicts = responses.filter((r) => r.status === 409).length;
    assert.equal(successes, 1, 'Exactly one concurrent duplicate like must succeed');
    assert.equal(conflicts, 4, 'All losing concurrent duplicates must fail with 409');

    const persistedLikes = await PostLikeModel.countDocuments({ postId: post._id });
    const updatedPost = await PostModel.findById(post._id);
    assert.equal(persistedLikes, 1);
    assert.equal(updatedPost?.likesCount, 1);
  });

  await t.test('2. Concurrent distinct tourists liking same post succeed under WriteConflict retries', async () => {
    const author = await seedTouristAndToken('Author', 'One');
    const tourists = await Promise.all([
      seedTouristAndToken('T1', 'User'),
      seedTouristAndToken('T2', 'User'),
      seedTouristAndToken('T3', 'User'),
      seedTouristAndToken('T4', 'User'),
      seedTouristAndToken('T5', 'User'),
    ]);
    const post = await PostModel.create({
      authorId: author.account._id,
      content: 'Concurrent distinct user likes',
    });

    const results = await Promise.all(
      tourists.map((user) =>
        dispatchRequest<ApiResponse>(app, {
          method: 'POST',
          url: `/api/v1/tourist/posts/${post._id}/likes`,
          headers: { authorization: `Bearer ${user.token}` },
        }),
      ),
    );

    for (const r of results) {
      assert.equal(r.status, 201);
    }

    const updatedPost = await PostModel.findById(post._id);
    const totalDocs = await PostLikeModel.countDocuments({ postId: post._id });
    assert.equal(totalDocs, 5);
    assert.equal(updatedPost?.likesCount, 5);
  });

  await t.test('3. Concurrent duplicate DELETE /likes decrements once and never goes negative', async () => {
    const tourist = await seedTouristAndToken();
    const post = await PostModel.create({
      authorId: tourist.account._id,
      content: 'Concurrent unlike safety check',
    });

    await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/likes`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });

    const delResults = await Promise.all([
      dispatchRequest<ApiResponse>(app, {
        method: 'DELETE',
        url: `/api/v1/tourist/posts/${post._id}/likes`,
        headers: { authorization: `Bearer ${tourist.token}` },
      }),
      dispatchRequest<ApiResponse>(app, {
        method: 'DELETE',
        url: `/api/v1/tourist/posts/${post._id}/likes`,
        headers: { authorization: `Bearer ${tourist.token}` },
      }),
    ]);

    assert.equal(delResults.filter((r) => r.status === 200).length, 1);
    assert.equal(delResults.filter((r) => r.status === 404).length, 1);

    const updatedPost = await PostModel.findById(post._id);
    assert.equal(updatedPost?.likesCount, 0);
  });

  await t.test('4. Failed transaction aborts MongoDB commit leaving zero postLikes and zero likesCount increment', async () => {
    const tourist = await seedTouristAndToken();
    const post = await PostModel.create({
      authorId: tourist.account._id,
      content: 'Real MongoDB ACID transaction abort check',
    });

    await assert.rejects(async () => {
      await realEngageRepo.withTransaction(async (session) => {
        await realEngageRepo.createPostLike(tourist.account._id, post._id, session);
        await realEngageRepo.adjustPostCounter(post._id, 'likesCount', 1, session);
        throw new Error('Forced mid-transaction failure');
      });
    }, /Forced mid-transaction failure/);

    const persistedLikes = await PostLikeModel.countDocuments({ postId: post._id });
    const reloadedPost = await PostModel.findById(post._id);
    assert.equal(persistedLikes, 0, 'Rolled back tx must not commit PostLike');
    assert.equal(reloadedPost?.likesCount, 0, 'Rolled back tx must not commit likesCount increment');
  });

  await t.test('5. Concurrent duplicate reposts and unrepost preserve repostsCount integrity in MongoDB', async () => {
    const tourist = await seedTouristAndToken();
    const post = await PostModel.create({
      authorId: tourist.account._id,
      content: 'Real replica-set repost race verification',
    });

    const repostResults = await Promise.all(
      Array.from({ length: 4 }, () =>
        dispatchRequest<ApiResponse>(app, {
          method: 'POST',
          url: `/api/v1/tourist/posts/${post._id}/reposts`,
          headers: { authorization: `Bearer ${tourist.token}` },
        }),
      ),
    );

    assert.equal(repostResults.filter((r) => r.status === 201).length, 1);
    assert.equal(repostResults.filter((r) => r.status === 409).length, 3);
    assert.equal(await PostRepostModel.countDocuments({ originalPostId: post._id }), 1);
    assert.equal((await PostModel.findById(post._id))?.repostsCount, 1);

    const delRes = await dispatchRequest<ApiResponse>(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/posts/${post._id}/reposts`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal(delRes.status, 200);
    assert.equal((await PostModel.findById(post._id))?.repostsCount, 0);
  });

  await t.test('6. Real MongoDB comment creation, paginated listing, soft-deletion & count consistency', async () => {
    const tourist = await seedTouristAndToken('Sree', 'Lakshmi');
    const post = await PostModel.create({
      authorId: tourist.account._id,
      content: 'Real DB comment persistence test',
    });

    const c1 = await dispatchRequest<ApiResponse<PostCommentDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'First MongoDB comment' },
    });
    const c2 = await dispatchRequest<ApiResponse<PostCommentDto>>(app, {
      method: 'POST',
      url: `/api/v1/tourist/posts/${post._id}/comments`,
      headers: { authorization: `Bearer ${tourist.token}` },
      body: { content: 'Second MongoDB comment' },
    });
    assert.equal(c1.status, 201);
    assert.equal(c2.status, 201);
    assert.equal((await PostModel.findById(post._id))?.commentsCount, 2);

    await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/comments/${c1.body.data!.id}`,
      headers: { authorization: `Bearer ${tourist.token}` },
    });
    assert.equal((await PostModel.findById(post._id))?.commentsCount, 1);

    const listRes = await dispatchRequest<ApiResponse<PostCommentDto[]>>(app, {
      method: 'GET',
      url: `/api/v1/posts/${post._id}/comments`,
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data?.length, 1);
    assert.equal(listRes.body.data?.[0].content, 'Second MongoDB comment');
    assert.equal(listRes.body.data?.[0].author?.displayName, 'Sree Lakshmi');
  });
});
