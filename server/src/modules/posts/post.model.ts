import { Schema, model, Document, Model, Types } from 'mongoose';
import {
  POST_VISIBILITIES,
  POST_STATUSES,
  POST_RULES,
} from '@kerala-tourism/constants';
import { PostVisibility, PostStatus } from '@kerala-tourism/shared-types';

export interface IPostDocument extends Document {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  mediaIds: Types.ObjectId[];
  destinationId?: Types.ObjectId | null;
  visibility: PostVisibility;
  status: PostStatus;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  moderatedBy?: Types.ObjectId | null;
  moderatedAt?: Date | null;
  moderationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const postSchema = new Schema<IPostDocument>(
  {
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Author ID is required'],
      immutable: true,
    },
    content: {
      type: String,
      required: [true, 'Post content is required'],
      trim: true,
      minlength: [
        POST_RULES.MIN_CONTENT_LENGTH,
        `Post content must be at least ${POST_RULES.MIN_CONTENT_LENGTH} character`,
      ],
      maxlength: [
        POST_RULES.MAX_CONTENT_LENGTH,
        `Post content cannot exceed ${POST_RULES.MAX_CONTENT_LENGTH} characters`,
      ],
    },
    mediaIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Media',
        },
      ],
      default: () => [],
      validate: [
        {
          validator: (arr: Types.ObjectId[]) =>
            Array.isArray(arr) && arr.length <= POST_RULES.MAX_MEDIA_PER_POST,
          message: `A post cannot exceed ${POST_RULES.MAX_MEDIA_PER_POST} media items`,
        },
        {
          validator: (arr: Types.ObjectId[]) => {
            const seen = new Set<string>();
            for (const item of arr) {
              const str = item.toString();
              if (seen.has(str)) return false;
              seen.add(str);
            }
            return true;
          },
          message: 'Duplicate media references are not allowed on a post',
        },
      ],
    },
    destinationId: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      default: null,
    },
    visibility: {
      type: String,
      enum: {
        values: Object.values(POST_VISIBILITIES),
        message: 'Invalid post visibility: {VALUE}',
      },
      default: POST_VISIBILITIES.PUBLIC,
      required: [true, 'Post visibility is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(POST_STATUSES),
        message: 'Invalid post status: {VALUE}',
      },
      default: POST_STATUSES.PUBLISHED,
      required: [true, 'Post status is required'],
    },
    likesCount: {
      type: Number,
      default: 0,
      min: [0, 'Likes count cannot be negative'],
      required: true,
    },
    commentsCount: {
      type: Number,
      default: 0,
      min: [0, 'Comments count cannot be negative'],
      required: true,
    },
    repostsCount: {
      type: Number,
      default: 0,
      min: [0, 'Reposts count cannot be negative'],
      required: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
    moderationReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    collection: 'posts',
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// ESR Compound Partial Index for public chronological feed retrieval
postSchema.index(
  { visibility: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1 },
  {
    name: 'idx_public_feed',
    partialFilterExpression: {
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
    },
  },
);

// Compound index for author's personal post listing ("My Posts")
postSchema.index(
  { authorId: 1, deletedAt: 1, createdAt: -1 },
  { name: 'idx_author_posts' },
);

// Partial compound index for destination-tagged public post discovery
postSchema.index(
  { destinationId: 1, visibility: 1, status: 1, deletedAt: 1, publishedAt: -1 },
  {
    name: 'idx_destination_posts',
    partialFilterExpression: {
      destinationId: { $type: 'objectId' },
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
    },
  },
);

// Partial index for future admin moderation workflows without indexing published posts
postSchema.index(
  { status: 1, createdAt: -1 },
  {
    name: 'idx_moderation_queue',
    partialFilterExpression: {
      status: { $in: [POST_STATUSES.PENDING, POST_STATUSES.REJECTED] },
    },
  },
);

// Partial ESR compound index for cursor-based following feed & per-author published timeline lookups
postSchema.index(
  { authorId: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1, visibility: 1 },
  {
    name: 'idx_following_feed',
    partialFilterExpression: {
      status: POST_STATUSES.PUBLISHED,
    },
  },
);

// ESR indexes for admin post moderation queries across all statuses and creators
postSchema.index(
  { status: 1, deletedAt: 1, createdAt: -1, _id: -1 },
  { name: 'idx_posts_moderation_list' },
);
postSchema.index(
  { authorId: 1, createdAt: -1, _id: -1 },
  { name: 'idx_posts_moderation_creator' },
);

export const PostModel: Model<IPostDocument> = model<IPostDocument>('Post', postSchema);
