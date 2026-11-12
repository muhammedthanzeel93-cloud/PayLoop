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
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  KERALA_DISTRICTS,
  MEDIA_RULES,
  POST_STATUSES,
  POST_VISIBILITIES,
} from '@kerala-tourism/constants';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { authRepository } from '../modules/auth/auth.repository';
import { DestinationModel } from '../modules/destinations/destinations.model';
import { DestinationsRepository } from '../modules/destinations/destinations.repository';
import { MediaModel } from '../modules/media/media.model';
import { MediaRepository } from '../modules/media/media.repository';
import { PostModel } from '../modules/posts/post.model';
import { postsRepository } from '../modules/posts/post.repository';
import { postsService } from '../modules/posts/post.service';
import { FollowModel } from '../modules/users/follow.model';
import { followRepository } from '../modules/users/follow.repository';
import { followService } from '../modules/users/follow.service';
import { AccountModel, TouristProfileModel } from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
import { dispatchRequest } from './testUtils';

const asBody = (body: unknown): Record<string, unknown> => body as Record<string, unknown>;

const collectExplainStages = (node: unknown, out: string[] = [], indexes: string[] = []) => {
  if (!node || typeof node !== 'object') {
    return { stages: out, indexes };
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectExplainStages(item, out, indexes);
    }
    return { stages: out, indexes };
  }

  const record = node as Record<string, unknown>;
  if (typeof record.stage === 'string') {
    out.push(record.stage);
  }
  if (typeof record.indexName === 'string') {
    indexes.push(record.indexName);
  }
  for (const [key, val] of Object.entries(record)) {
    if (key === 'rejectedPlans' || key === 'allPlansExecution') {
      continue;
    }
    collectExplainStages(val, out, indexes);
  }
  return { stages: out, indexes };
};

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

describe('Day 16 Following-Based Feed Replica Set Integration Tests (Real MongoDB)', () => {
  const app = createApp();
  const liveMediaRepo = new MediaRepository();
  const liveDestinationsRepo = new DestinationsRepository();
  let mongodProc: ChildProcess | null = null;
  let tmpDbPath = '';

  const seedAccount = async (
    email: string,
    firstName: string,
    lastName: string,
    options?: {
      status?: (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES];
      accountType?: (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];
    },
  ): Promise<{ id: string; token: string }> => {
    const accountType = options?.accountType ?? ACCOUNT_TYPES.TOURIST;
    const status = options?.status ?? ACCOUNT_STATUSES.ACTIVE;
    const account = await AccountModel.create({
      email,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo',
      accountType,
      status,
    });

    if (accountType === ACCOUNT_TYPES.TOURIST) {
      await TouristProfileModel.create({
        accountId: account._id,
        firstName,
        lastName,
        preferredLanguage: 'EN',
        profileImage: 'https://cdn.keralatourism.org/avatars/tourist.webp',
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
    tmpDbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kerala-following-feed-rs-'));

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

    const replicaUri = `mongodb://127.0.0.1:${port}/kerala_following_feed_replica_test?replicaSet=rs0&serverSelectionTimeoutMS=5000`;
    await mongoose.connect(replicaUri);

    await Promise.all([
      AccountModel.syncIndexes(),
      TouristProfileModel.syncIndexes(),
      FollowModel.syncIndexes(),
      PostModel.syncIndexes(),
      MediaModel.syncIndexes(),
      DestinationModel.syncIndexes(),
    ]);
  });

  after(async () => {
    resetRateLimiter();

    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.admin().command({ shutdown: 1, force: true });
      }
    } catch {
      // mongod closes socket mid-shutdown
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
    authorizationMiddleware.setRepository(authRepository);
    followService.setAuthRepository(authRepository);
    followService.setRepository(followRepository);
    postsService.setAuthRepository(authRepository);
    postsService.setRepository(postsRepository);
    postsService.setMediaRepository(liveMediaRepo);
    postsService.setDestinationsRepository(liveDestinationsRepo);

    await Promise.all([
      PostModel.deleteMany({}),
      FollowModel.deleteMany({}),
      MediaModel.deleteMany({}),
      DestinationModel.deleteMany({}),
      TouristProfileModel.deleteMany({}),
      AccountModel.deleteMany({}),
    ]);
  });

  it('reflects follow -> publish -> feed retrieval -> unfollow against real MongoDB', async () => {
    const viewer = await seedAccount('viewer.e2e@kerala.test', 'Viewer', 'Nair');
    const creator = await seedAccount('creator.e2e@kerala.test', 'Creator', 'Menon');

    const followRes = await dispatchRequest(app, {
      method: 'POST',
      url: `/api/v1/tourist/users/${creator.id}/follow`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(followRes.status, 201);

    const createRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/v1/tourist/posts',
      headers: { authorization: `Bearer ${creator.token}` },
      body: {
        content: 'Sunrise bamboo rafting in Periyar Tiger Reserve.',
        visibility: POST_VISIBILITIES.FOLLOWERS,
      },
    });
    assert.equal(createRes.status, 201);
    const createdId = (asBody(createRes.body).data as Record<string, unknown>).id as string;

    const feedRes = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(feedRes.status, 200);
    const feedItems = asBody(feedRes.body).data as Array<Record<string, unknown>>;
    assert.deepEqual(
      feedItems.map((p) => p.id),
      [createdId],
    );

    const unfollowRes = await dispatchRequest(app, {
      method: 'DELETE',
      url: `/api/v1/tourist/users/${creator.id}/follow`,
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(unfollowRes.status, 200);

    const afterUnfollow = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(afterUnfollow.status, 200);
    assert.deepEqual(asBody(afterUnfollow.body).data, []);
  });

  it('filters PRIVATE, PENDING, REJECTED, REMOVED, soft-deleted, self-edge, unfollowed, and inactive/non-tourist author posts in aggregation', async () => {
    const viewer = await seedAccount('viewer.filter@kerala.test', 'Viewer', 'K');
    const activeAuthor = await seedAccount('active.author@kerala.test', 'Aarav', 'S');
    const suspAuthor = await seedAccount('susp.author@kerala.test', 'Susp', 'S', {
      status: ACCOUNT_STATUSES.SUSPENDED,
    });
    const deactAuthor = await seedAccount('deact.author@kerala.test', 'Deact', 'S', {
      status: ACCOUNT_STATUSES.DEACTIVATED,
    });
    const bizAuthor = await seedAccount('biz.author@kerala.test', 'Biz', 'S', {
      accountType: ACCOUNT_TYPES.BUSINESS,
    });
    const stranger = await seedAccount('stranger.author@kerala.test', 'Stranger', 'S');

    // Follow active, suspended, deactivated, business, plus inject anomalous raw self-follow edge
    await FollowModel.insertMany([
      { followerId: viewer.id, followingId: activeAuthor.id },
      { followerId: viewer.id, followingId: suspAuthor.id },
      { followerId: viewer.id, followingId: deactAuthor.id },
      { followerId: viewer.id, followingId: bizAuthor.id },
    ]);
    await FollowModel.collection.insertOne({
      followerId: new Types.ObjectId(viewer.id),
      followingId: new Types.ObjectId(viewer.id),
      createdAt: new Date(),
    });

    const t1 = new Date('2026-10-10T08:00:00.000Z');
    const t2 = new Date('2026-10-10T09:00:00.000Z');

    const okPublic = await PostModel.create({
      authorId: activeAuthor.id,
      content: 'Public waterfall trek',
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: t1,
      deletedAt: null,
    });
    const okFollowers = await PostModel.create({
      authorId: activeAuthor.id,
      content: 'Followers-only spice garden trail',
      visibility: POST_VISIBILITIES.FOLLOWERS,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: t2,
      deletedAt: null,
    });

    await PostModel.insertMany([
      {
        authorId: activeAuthor.id,
        content: 'Private journal',
        visibility: POST_VISIBILITIES.PRIVATE,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: activeAuthor.id,
        content: 'Pending review',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PENDING,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: activeAuthor.id,
        content: 'Rejected item',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.REJECTED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: activeAuthor.id,
        content: 'Removed item',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.REMOVED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: activeAuthor.id,
        content: 'Soft deleted item',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: new Date(),
      },
      {
        authorId: suspAuthor.id,
        content: 'From suspended author',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: deactAuthor.id,
        content: 'From deactivated author',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: bizAuthor.id,
        content: 'From business author',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: viewer.id,
        content: 'Viewer own post with self-follow anomaly',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: null,
      },
      {
        authorId: stranger.id,
        content: 'Unfollowed stranger post',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t2,
        deletedAt: null,
      },
    ]);

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    const items = asBody(res.body).data as Array<Record<string, unknown>>;
    assert.deepEqual(
      items.map((p) => p.id),
      [okFollowers._id.toString(), okPublic._id.toString()],
    );
  });

  it('paginates across real MongoDB documents sharing identical publishedAt using keyset tie-breaking', async () => {
    const viewer = await seedAccount('viewer.cursor@kerala.test', 'Cursor', 'Viewer');
    const a1 = await seedAccount('author.c1@kerala.test', 'Author', 'One');
    const a2 = await seedAccount('author.c2@kerala.test', 'Author', 'Two');

    await FollowModel.insertMany([
      { followerId: viewer.id, followingId: a1.id },
      { followerId: viewer.id, followingId: a2.id },
    ]);

    const sameTs = new Date('2026-10-12T10:00:00.000Z');
    const id1 = new Types.ObjectId('671000000000000000000001');
    const id2 = new Types.ObjectId('671000000000000000000002');
    const id3 = new Types.ObjectId('671000000000000000000003');
    const id4 = new Types.ObjectId('671000000000000000000004');
    const olderId = new Types.ObjectId('671000000000000000000005');

    await PostModel.insertMany([
      {
        _id: id1,
        authorId: a1.id,
        content: 'Tie post 1',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: sameTs,
        deletedAt: null,
      },
      {
        _id: id2,
        authorId: a2.id,
        content: 'Tie post 2',
        visibility: POST_VISIBILITIES.FOLLOWERS,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: sameTs,
        deletedAt: null,
      },
      {
        _id: id3,
        authorId: a1.id,
        content: 'Tie post 3',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: sameTs,
        deletedAt: null,
      },
      {
        _id: id4,
        authorId: a2.id,
        content: 'Tie post 4',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: sameTs,
        deletedAt: null,
      },
      {
        _id: olderId,
        authorId: a1.id,
        content: 'Older post',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date('2026-10-12T09:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    const expected = [
      id4.toString(),
      id3.toString(),
      id2.toString(),
      id1.toString(),
      olderId.toString(),
    ];

    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let hasNextPage = true;

    while (hasNextPage) {
      pages += 1;
      const queryUrl = cursor
        ? `/api/v1/tourist/feed/following?limit=2&cursor=${cursor}`
        : '/api/v1/tourist/feed/following?limit=2';
      const pageRes = await dispatchRequest(app, {
        method: 'GET',
        url: queryUrl,
        headers: { authorization: `Bearer ${viewer.token}` },
      });
      assert.equal(pageRes.status, 200);
      const body = asBody(pageRes.body);
      const items = body.data as Array<Record<string, unknown>>;
      const meta = body.pagination as Record<string, unknown>;
      collected.push(...items.map((i) => i.id as string));

      if (!meta.hasMore) {
        assert.equal('nextCursor' in meta, false);
        hasNextPage = false;
        break;
      }
      assert.equal(typeof meta.nextCursor, 'string');
      cursor = meta.nextCursor as string;
      assert.ok(pages < 5, 'Pagination should terminate in 3 pages');
    }

    assert.equal(pages, 3);
    assert.deepEqual(collected, expected);
  });

  it('batch-hydrates safe author, moderated media, and verified destinations without PII or storageKey leakage', async () => {
    const viewer = await seedAccount('viewer.hydrate@kerala.test', 'Viewer', 'One');
    const author = await seedAccount('author.hydrate@kerala.test', 'Meera', 'Das');
    await FollowModel.create({ followerId: viewer.id, followingId: author.id });

    const safeMedia = await MediaModel.create({
      uploaderAccountId: author.id,
      storageKey: 'general/fort-kochi.jpg',
      url: 'https://cdn.keralatourism.org/media/general/fort-kochi.jpg',
      mimeType: MEDIA_RULES.ALLOWED_MIME_TYPES[0],
      fileSizeBytes: 180_000,
      isModerated: true,
    });
    const unmoderatedMedia = await MediaModel.create({
      uploaderAccountId: author.id,
      storageKey: 'general/unmoderated.jpg',
      url: 'https://cdn.keralatourism.org/media/general/unmoderated.jpg',
      mimeType: MEDIA_RULES.ALLOWED_MIME_TYPES[0],
      fileSizeBytes: 180_000,
      isModerated: false,
    });
    const privateMedia = await MediaModel.create({
      uploaderAccountId: author.id,
      storageKey: 'private/passport.jpg',
      url: 'https://cdn.keralatourism.org/media/private/passport.jpg',
      mimeType: MEDIA_RULES.ALLOWED_MIME_TYPES[0],
      fileSizeBytes: 180_000,
      isModerated: true,
    });

    const verifiedDest = await DestinationModel.create({
      name: 'Munnar Tea Estates',
      slug: 'munnar-tea-estates',
      description: 'High altitude evergreen tea plantations across Western Ghats slopes.',
      location: { type: 'Point', coordinates: [77.0595, 10.0889] },
      address: 'Munnar Town, Idukki, Kerala 685612',
      district: KERALA_DISTRICTS[0],
      locality: 'Devikulam',
      images: ['https://cdn.keralatourism.org/destinations/munnar.webp'],
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      createdBy: new Types.ObjectId(author.id),
    });

    const draftDest = await DestinationModel.create({
      name: 'Unverified Secret Lagoon',
      slug: 'unverified-secret-lagoon',
      description: 'Draft unverified lagoon entry not yet approved by moderators.',
      location: { type: 'Point', coordinates: [76.3388, 9.4981] },
      address: 'Kuttanad, Alappuzha, Kerala 688504',
      district: KERALA_DISTRICTS[0],
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.PENDING,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdBy: new Types.ObjectId(author.id),
    });

    await PostModel.insertMany([
      {
        authorId: author.id,
        content: 'Hydrated verified destination post',
        mediaIds: [safeMedia._id, unmoderatedMedia._id, privateMedia._id],
        destinationId: verifiedDest._id,
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date('2026-10-13T10:00:00.000Z'),
        likesCount: 7,
        commentsCount: 3,
        repostsCount: 2,
        deletedAt: null,
      },
      {
        authorId: author.id,
        content: 'Draft destination omitted',
        destinationId: draftDest._id,
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date('2026-10-13T09:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/v1/tourist/feed/following',
      headers: { authorization: `Bearer ${viewer.token}` },
    });

    assert.equal(res.status, 200);
    const items = asBody(res.body).data as Array<Record<string, unknown>>;
    assert.equal(items.length, 2);

    const firstAuthor = items[0].author as Record<string, unknown>;
    assert.equal(firstAuthor.displayName, 'Meera Das');
    assert.equal(firstAuthor.email, undefined);
    assert.equal(firstAuthor.passwordHash, undefined);
    assert.equal(firstAuthor.status, undefined);

    const firstMedia = items[0].media as Array<Record<string, unknown>>;
    assert.deepEqual(
      firstMedia.map((m) => m.id),
      [safeMedia._id.toString()],
    );
    assert.equal(firstMedia[0].storageKey, undefined);

    const firstDest = items[0].destination as Record<string, unknown>;
    assert.equal(firstDest.name, 'Munnar Tea Estates');
    assert.equal(items[1].destination, undefined);
  });

  it('uses IXSCAN on idx_follows_following and idx_following_feed without COLLSCAN or blocking SORT', async () => {
    const viewer = await seedAccount('viewer.explain@kerala.test', 'Explain', 'Viewer');
    const author = await seedAccount('author.explain@kerala.test', 'Explain', 'Author');
    await FollowModel.create({ followerId: viewer.id, followingId: author.id });

    await PostModel.insertMany([
      {
        authorId: author.id,
        content: 'Explain plan post 1',
        visibility: POST_VISIBILITIES.PUBLIC,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date('2026-10-14T10:00:00.000Z'),
        deletedAt: null,
      },
      {
        authorId: author.id,
        content: 'Explain plan post 2',
        visibility: POST_VISIBILITIES.FOLLOWERS,
        status: POST_STATUSES.PUBLISHED,
        publishedAt: new Date('2026-10-14T11:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    const pipeline = postsRepository.buildFollowingFeedPipeline(viewer.id, { limit: 10 });
    const aggExplain = await FollowModel.aggregate(pipeline).explain('executionStats');
    const aggPlan = collectExplainStages(aggExplain);
    assert.ok(
      aggPlan.stages.includes('IXSCAN'),
      `Expected IXSCAN on follows aggregation, got stages=${JSON.stringify(aggPlan.stages)}`,
    );
    assert.ok(
      aggPlan.indexes.includes('idx_follows_unique') ||
        aggPlan.indexes.includes('idx_follows_following'),
      `Expected follows index scan, got indexes=${JSON.stringify(aggPlan.indexes)}`,
    );
    assert.equal(
      aggPlan.stages.includes('COLLSCAN'),
      false,
      `Unexpected COLLSCAN in ${JSON.stringify(aggPlan.stages)}`,
    );

    // Inspect MongoDB query planner on the per-author inner $lookup predicate (both initial and cursor pages)
    const authorObjId = new Types.ObjectId(author.id);
    const cursorTs = new Date('2026-10-14T11:00:00.000Z');
    const cursorId = new Types.ObjectId();

    const firstPageExplain = await PostModel.find({
      authorId: authorObjId,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
      visibility: { $in: [POST_VISIBILITIES.PUBLIC, POST_VISIBILITIES.FOLLOWERS] },
      publishedAt: { $type: 'date' },
    })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(11)
      .explain('executionStats');

    const firstPagePlan = collectExplainStages(firstPageExplain);
    assert.ok(
      firstPagePlan.stages.includes('IXSCAN'),
      `Expected IXSCAN, got stages=${JSON.stringify(firstPagePlan.stages)}`,
    );
    assert.ok(
      firstPagePlan.indexes.includes('idx_following_feed'),
      `Expected idx_following_feed, got indexes=${JSON.stringify(firstPagePlan.indexes)}`,
    );
    assert.equal(
      firstPagePlan.stages.includes('COLLSCAN'),
      false,
      `Unexpected COLLSCAN in ${JSON.stringify(firstPagePlan.stages)}`,
    );
    assert.equal(
      firstPagePlan.stages.includes('SORT'),
      false,
      `Unexpected SORT in ${JSON.stringify(firstPagePlan.stages)}`,
    );

    const cursorPageExplain = await PostModel.find({
      authorId: authorObjId,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
      visibility: { $in: [POST_VISIBILITIES.PUBLIC, POST_VISIBILITIES.FOLLOWERS] },
      $or: [
        { publishedAt: { $lt: cursorTs } },
        { publishedAt: cursorTs, _id: { $lt: cursorId } },
      ],
    })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(11)
      .explain('executionStats');

    const cursorPagePlan = collectExplainStages(cursorPageExplain);
    assert.ok(
      cursorPagePlan.stages.includes('IXSCAN'),
      `Expected IXSCAN on cursor query, got stages=${JSON.stringify(cursorPagePlan.stages)}`,
    );
    assert.ok(
      cursorPagePlan.indexes.includes('idx_following_feed'),
      `Expected idx_following_feed on cursor query, got indexes=${JSON.stringify(cursorPagePlan.indexes)}`,
    );
    assert.equal(
      cursorPagePlan.stages.includes('COLLSCAN'),
      false,
      `Unexpected COLLSCAN on cursor query in ${JSON.stringify(cursorPagePlan.stages)}`,
    );
    assert.equal(
      cursorPagePlan.stages.includes('SORT'),
      false,
      `Unexpected SORT on cursor query in ${JSON.stringify(cursorPagePlan.stages)}`,
    );
  });
});
