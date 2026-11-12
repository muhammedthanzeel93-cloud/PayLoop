import { FilterQuery, PipelineStage, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  POST_STATUSES,
  POST_VISIBILITIES,
} from '@kerala-tourism/constants';
import {
  AccountModel,
  FollowModel,
  PostModel,
  IPostDocument,
  TouristProfileModel,
  ITouristProfileDocument,
} from '../../shared/models';
import {
  CreatePostPersistenceInput,
  UpdatePostPersistenceInput,
  FindPublicFeedOptions,
  FindAuthorPostsOptions,
  FindFollowingFeedOptions,
} from './post.types';

export class PostsRepository {
  public async createPost(data: CreatePostPersistenceInput): Promise<IPostDocument> {
    return PostModel.create(data);
  }

  /**
   * Finds a post by ID. Excludes soft-deleted/removed posts by default.
   */
  public async findById(
    id: string | Types.ObjectId,
    includeDeleted = false,
  ): Promise<IPostDocument | null> {
    if (includeDeleted) {
      return PostModel.findById(id);
    }
    return PostModel.findOne({
      _id: new Types.ObjectId(id.toString()),
      deletedAt: null,
      status: { $ne: POST_STATUSES.REMOVED },
    });
  }

  /**
   * Retrieves a single public, published, non-deleted post by ID.
   */
  public async findPublicPostById(id: string | Types.ObjectId): Promise<IPostDocument | null> {
    return PostModel.findOne({
      _id: new Types.ObjectId(id.toString()),
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
    });
  }

  /**
   * Retrieves paginated public feed sorted newest-first at the database level.
   */
  public async findPublicFeed(
    options: FindPublicFeedOptions,
  ): Promise<{ items: IPostDocument[]; total: number }> {
    const filter: FilterQuery<IPostDocument> = {
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
    };

    if (options.destinationId) {
      filter.destinationId = new Types.ObjectId(options.destinationId);
    }

    const [items, total] = await Promise.all([
      PostModel.find(filter)
        .sort({ publishedAt: -1, _id: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit),
      PostModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  /**
   * Retrieves paginated active posts owned by a specific tourist author.
   */
  public async findByAuthor(
    authorId: string | Types.ObjectId,
    options: FindAuthorPostsOptions,
  ): Promise<{ items: IPostDocument[]; total: number }> {
    const filter: FilterQuery<IPostDocument> = {
      authorId: new Types.ObjectId(authorId.toString()),
      deletedAt: null,
      status: { $ne: POST_STATUSES.REMOVED },
    };

    if (options.visibility) {
      filter.visibility = options.visibility;
    }

    if (options.status) {
      filter.status = options.status;
    }

    const [items, total] = await Promise.all([
      PostModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit),
      PostModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  public async updatePost(
    id: string | Types.ObjectId,
    updates: UpdatePostPersistenceInput,
  ): Promise<IPostDocument | null> {
    return PostModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id.toString()),
        deletedAt: null,
        status: { $ne: POST_STATUSES.REMOVED },
      },
      { $set: updates },
      { new: true, runValidators: true },
    );
  }

  public async softDeletePost(id: string | Types.ObjectId): Promise<IPostDocument | null> {
    return PostModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id.toString()),
        deletedAt: null,
        status: { $ne: POST_STATUSES.REMOVED },
      },
      {
        $set: {
          status: POST_STATUSES.REMOVED,
          deletedAt: new Date(),
        },
      },
      { new: true },
    );
  }

  /**
   * Batch loads only safe public tourist profile fields to avoid N+1 queries and PII exposure.
   */
  public async findTouristProfilesByAccountIds(
    accountIds: string[],
  ): Promise<ITouristProfileDocument[]> {
    if (accountIds.length === 0) {
      return [];
    }
    const objectIds = accountIds.map((id) => new Types.ObjectId(id));
    return TouristProfileModel.find({ accountId: { $in: objectIds } }).select(
      'accountId firstName lastName profileImage',
    );
  }

  /**
   * Builds the aggregation pipeline joining follows -> active TOURIST accounts -> bounded posts
   * using keyset cursor filtering without loading followed account IDs into Node memory.
   */
  public buildFollowingFeedPipeline(
    followerAccountId: string | Types.ObjectId,
    options: FindFollowingFeedOptions,
  ): PipelineStage[] {
    const followerObjId = new Types.ObjectId(followerAccountId.toString());
    const fetchLimit = options.limit + 1;

    const postMatchStage: Record<string, unknown> = {
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
      visibility: { $in: [POST_VISIBILITIES.PUBLIC, POST_VISIBILITIES.FOLLOWERS] },
    };

    if (options.cursor) {
      postMatchStage.$or = [
        { publishedAt: { $lt: options.cursor.publishedAt } },
        {
          publishedAt: options.cursor.publishedAt,
          _id: { $lt: options.cursor.id },
        },
      ];
    } else {
      postMatchStage.publishedAt = { $type: 'date' };
    }

    return [
      {
        $match: {
          followerId: followerObjId,
          followingId: { $ne: followerObjId },
        },
      },
      {
        $lookup: {
          from: AccountModel.collection.name,
          localField: 'followingId',
          foreignField: '_id',
          pipeline: [
            {
              $match: {
                accountType: ACCOUNT_TYPES.TOURIST,
                status: ACCOUNT_STATUSES.ACTIVE,
              },
            },
            { $project: { _id: 1 } },
          ],
          as: 'activeAuthor',
        },
      },
      {
        $match: {
          'activeAuthor.0': { $exists: true },
        },
      },
      {
        $lookup: {
          from: PostModel.collection.name,
          localField: 'followingId',
          foreignField: 'authorId',
          pipeline: [
            { $match: postMatchStage },
            { $sort: { publishedAt: -1, _id: -1 } },
            { $limit: fetchLimit },
            {
              $project: {
                _id: 1,
                authorId: 1,
                content: 1,
                mediaIds: 1,
                destinationId: 1,
                visibility: 1,
                status: 1,
                likesCount: 1,
                commentsCount: 1,
                repostsCount: 1,
                publishedAt: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          as: 'followedPosts',
        },
      },
      { $unwind: '$followedPosts' },
      { $replaceRoot: { newRoot: '$followedPosts' } },
      { $sort: { publishedAt: -1, _id: -1 } },
      { $limit: fetchLimit },
    ];
  }

  /**
   * Retrieves chronological cursor-paginated posts authored by active followed tourists.
   */
  public async findFollowingFeed(
    followerAccountId: string | Types.ObjectId,
    options: FindFollowingFeedOptions,
  ): Promise<{ items: IPostDocument[]; hasMore: boolean }> {
    const pipeline = this.buildFollowingFeedPipeline(followerAccountId, options);
    const docs = await FollowModel.aggregate<IPostDocument>(pipeline);
    const hasMore = docs.length > options.limit;
    const items = hasMore ? docs.slice(0, options.limit) : docs;
    return { items, hasMore };
  }
}

export const postsRepository = new PostsRepository();
