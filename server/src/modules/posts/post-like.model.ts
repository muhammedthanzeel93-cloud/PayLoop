import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IPostLikeDocument extends Document {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  postId: Types.ObjectId;
  createdAt: Date;
}

export const postLikeSchema = new Schema<IPostLikeDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID is required'],
      immutable: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post ID is required'],
      immutable: true,
    },
  },
  {
    collection: 'postLikes',
    timestamps: { createdAt: true, updatedAt: false },
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

// Unique compound index preventing duplicate likes by the same account on a post
postLikeSchema.index(
  { accountId: 1, postId: 1 },
  { name: 'idx_post_likes_unique', unique: true },
);

// Compound index for post-scoped like queries and chronological ordering
postLikeSchema.index(
  { postId: 1, createdAt: -1 },
  { name: 'idx_post_likes_by_post' },
);

export const PostLikeModel: Model<IPostLikeDocument> = model<IPostLikeDocument>(
  'PostLike',
  postLikeSchema,
);
