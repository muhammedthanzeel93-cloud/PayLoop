import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IPostRepostDocument extends Document {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  originalPostId: Types.ObjectId;
  createdAt: Date;
}

export const postRepostSchema = new Schema<IPostRepostDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID is required'],
      immutable: true,
    },
    originalPostId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Original post ID is required'],
      immutable: true,
    },
  },
  {
    collection: 'postReposts',
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

// Unique compound index preventing duplicate reposts by the same account on the same original post
postRepostSchema.index(
  { accountId: 1, originalPostId: 1 },
  { name: 'idx_post_reposts_unique', unique: true },
);

// Compound index supporting post-level repost lookups and chronological ordering
postRepostSchema.index(
  { originalPostId: 1, createdAt: -1 },
  { name: 'idx_post_reposts_by_post' },
);

export const PostRepostModel: Model<IPostRepostDocument> = model<IPostRepostDocument>(
  'PostRepost',
  postRepostSchema,
);
