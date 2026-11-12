import { Schema, model, Document, Model, Types } from 'mongoose';
import {
  POST_COMMENT_STATUSES,
  POST_ENGAGEMENT_RULES,
} from '@kerala-tourism/constants';
import { PostCommentStatus } from '@kerala-tourism/shared-types';

export interface IPostCommentDocument extends Document {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  status: PostCommentStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export const postCommentSchema = new Schema<IPostCommentDocument>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post ID is required'],
      immutable: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Author ID is required'],
      immutable: true,
    },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      minlength: [
        POST_ENGAGEMENT_RULES.MIN_COMMENT_LENGTH,
        `Comment content must be at least ${POST_ENGAGEMENT_RULES.MIN_COMMENT_LENGTH} character`,
      ],
      maxlength: [
        POST_ENGAGEMENT_RULES.MAX_COMMENT_LENGTH,
        `Comment content cannot exceed ${POST_ENGAGEMENT_RULES.MAX_COMMENT_LENGTH} characters`,
      ],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(POST_COMMENT_STATUSES),
        message: 'Invalid comment status: {VALUE}',
      },
      default: POST_COMMENT_STATUSES.ACTIVE,
      required: [true, 'Comment status is required'],
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'postComments',
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

// ESR Compound Partial Index for newest-first public comment stream
postCommentSchema.index(
  { postId: 1, status: 1, deletedAt: 1, createdAt: -1, _id: -1 },
  {
    name: 'idx_post_comments_public',
    partialFilterExpression: {
      status: POST_COMMENT_STATUSES.ACTIVE,
    },
  },
);

// Compound index for author comment lookups and ownership checks
postCommentSchema.index(
  { authorId: 1, status: 1, deletedAt: 1, createdAt: -1 },
  { name: 'idx_author_comments' },
);

export const PostCommentModel: Model<IPostCommentDocument> = model<IPostCommentDocument>(
  'PostComment',
  postCommentSchema,
);
