import mongoose, { ClientSession, Types } from 'mongoose';
import {
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  POST_VISIBILITIES,
} from '@kerala-tourism/constants';
import { ConflictError } from '../../shared/errors/AppError';
import {
  IPostCommentDocument,
  IPostDocument,
  IPostLikeDocument,
  IPostRepostDocument,
  PostCommentModel,
  PostLikeModel,
  PostModel,
  PostRepostModel,
} from '../../shared/models';
import {
  CreateCommentPersistenceInput,
  FindPostCommentsOptions,
  PostCounterField,
} from './post-engagement.types';

const MAX_TX_RETRIES = 8;

const isDuplicateKeyError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const maybeErr = err as { code?: number; cause?: { code?: number } };
  return maybeErr.code === 11000 || maybeErr.cause?.code === 11000;
};

const isTransientTransactionError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const maybeErr = err as {
    code?: number;
    errorLabels?: string[];
    hasErrorLabel?: (label: string) => boolean;
  };
  return (
    maybeErr.code === 112 ||
    maybeErr.errorLabels?.includes('TransientTransactionError') === true ||
    (typeof maybeErr.hasErrorLabel === 'function' &&
      maybeErr.hasErrorLabel('TransientTransactionError'))
  );
};

const isUnsupportedTransactionError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : '';
  return (
    message.includes('replica set member') ||
    message.includes('Transaction numbers are only allowed')
  );
};

export class PostEngagementRepository {
  /**
   * Executes a multi-document MongoDB transaction with bounded retries on WriteConflict / TransientTransactionError.
   * Falls back to sessionless execution only on standalone non-replica-set MongoDB topologies.
   */
  public async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TX_RETRIES; attempt += 1) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const result = await fn(session);
        await session.commitTransaction();
        return result;
      } catch (txError: unknown) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }

        if (isUnsupportedTransactionError(txError)) {
          return await fn(undefined);
        }

        if (isTransientTransactionError(txError) && attempt < MAX_TX_RETRIES) {
          const jitterMs = 10 + Math.floor(Math.random() * 25);
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
          continue;
        }

        throw txError;
      } finally {
        await session.endSession();
      }
    }

    throw new Error('Transaction retries exhausted');
  }

  public async findEligiblePublicPostById(
    postId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostDocument | null> {
    const query = PostModel.findOne({
      _id: new Types.ObjectId(postId.toString()),
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findPostLike(
    accountId: string | Types.ObjectId,
    postId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostLikeDocument | null> {
    const query = PostLikeModel.findOne({
      accountId: new Types.ObjectId(accountId.toString()),
      postId: new Types.ObjectId(postId.toString()),
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async createPostLike(
    accountId: string | Types.ObjectId,
    postId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostLikeDocument> {
    try {
      const [created] = await PostLikeModel.create(
        [
          {
            accountId: new Types.ObjectId(accountId.toString()),
            postId: new Types.ObjectId(postId.toString()),
          },
        ],
        session ? { session } : undefined,
      );
      return created;
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError('You have already liked this post');
      }
      throw err;
    }
  }

  public async deletePostLike(
    accountId: string | Types.ObjectId,
    postId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostLikeDocument | null> {
    return PostLikeModel.findOneAndDelete(
      {
        accountId: new Types.ObjectId(accountId.toString()),
        postId: new Types.ObjectId(postId.toString()),
      },
      session ? { session } : undefined,
    );
  }

  public async createComment(
    data: CreateCommentPersistenceInput,
    session?: ClientSession,
  ): Promise<IPostCommentDocument> {
    const [created] = await PostCommentModel.create(
      [
        {
          postId: data.postId,
          authorId: data.authorId,
          content: data.content,
          status: POST_COMMENT_STATUSES.ACTIVE,
          deletedAt: null,
        },
      ],
      session ? { session } : undefined,
    );
    return created;
  }

  public async findActiveCommentById(
    commentId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostCommentDocument | null> {
    const query = PostCommentModel.findOne({
      _id: new Types.ObjectId(commentId.toString()),
      status: POST_COMMENT_STATUSES.ACTIVE,
      deletedAt: null,
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findActiveCommentsByPost(
    postId: string | Types.ObjectId,
    options: FindPostCommentsOptions,
  ): Promise<{ items: IPostCommentDocument[]; total: number }> {
    const filter = {
      postId: new Types.ObjectId(postId.toString()),
      status: POST_COMMENT_STATUSES.ACTIVE,
      deletedAt: null,
    };

    const [items, total] = await Promise.all([
      PostCommentModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit),
      PostCommentModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  public async updateCommentContent(
    commentId: string | Types.ObjectId,
    content: string,
    session?: ClientSession,
  ): Promise<IPostCommentDocument | null> {
    return PostCommentModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(commentId.toString()),
        status: POST_COMMENT_STATUSES.ACTIVE,
        deletedAt: null,
      },
      { $set: { content } },
      { new: true, runValidators: true, ...(session ? { session } : {}) },
    );
  }

  public async softDeleteActiveComment(
    commentId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostCommentDocument | null> {
    return PostCommentModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(commentId.toString()),
        status: POST_COMMENT_STATUSES.ACTIVE,
        deletedAt: null,
      },
      {
        $set: {
          status: POST_COMMENT_STATUSES.REMOVED,
          deletedAt: new Date(),
        },
      },
      { new: true, ...(session ? { session } : {}) },
    );
  }

  public async findPostRepost(
    accountId: string | Types.ObjectId,
    originalPostId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostRepostDocument | null> {
    const query = PostRepostModel.findOne({
      accountId: new Types.ObjectId(accountId.toString()),
      originalPostId: new Types.ObjectId(originalPostId.toString()),
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async createPostRepost(
    accountId: string | Types.ObjectId,
    originalPostId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostRepostDocument> {
    try {
      const [created] = await PostRepostModel.create(
        [
          {
            accountId: new Types.ObjectId(accountId.toString()),
            originalPostId: new Types.ObjectId(originalPostId.toString()),
          },
        ],
        session ? { session } : undefined,
      );
      return created;
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError('You have already reposted this post');
      }
      throw err;
    }
  }

  public async deletePostRepost(
    accountId: string | Types.ObjectId,
    originalPostId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPostRepostDocument | null> {
    return PostRepostModel.findOneAndDelete(
      {
        accountId: new Types.ObjectId(accountId.toString()),
        originalPostId: new Types.ObjectId(originalPostId.toString()),
      },
      session ? { session } : undefined,
    );
  }

  /**
   * Atomically increments or decrements a denormalized engagement counter on PostModel.
   * Decrements strictly guard `{ [field]: { $gt: 0 } }` so counts never become negative.
   */
  public async adjustPostCounter(
    postId: string | Types.ObjectId,
    field: PostCounterField,
    delta: 1 | -1,
    session?: ClientSession,
  ): Promise<number> {
    const objectId = new Types.ObjectId(postId.toString());
    const filter: Record<string, unknown> = { _id: objectId };
    if (delta < 0) {
      filter[field] = { $gt: 0 };
    } else {
      filter.deletedAt = null;
    }

    const updated = await PostModel.findOneAndUpdate(
      filter,
      { $inc: { [field]: delta } },
      { new: true, ...(session ? { session } : {}) },
    );

    if (updated) {
      return Math.max(0, updated[field] ?? 0);
    }

    const fallbackQuery = PostModel.findById(objectId);
    if (session) {
      fallbackQuery.session(session);
    }
    const existing = await fallbackQuery.exec();
    return Math.max(0, existing?.[field] ?? 0);
  }
}

export const postEngagementRepository = new PostEngagementRepository();
