import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IFollowDocument extends Document {
  _id: Types.ObjectId;
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  createdAt: Date;
}

export const followSchema = new Schema<IFollowDocument>(
  {
    followerId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Follower ID is required'],
      immutable: true,
    },
    followingId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Following ID is required'],
      immutable: true,
      validate: {
        validator(this: IFollowDocument, value: Types.ObjectId): boolean {
          return !this.followerId || !value || this.followerId.toString() !== value.toString();
        },
        message: 'Users cannot follow themselves',
      },
    },
  },
  {
    collection: 'follows',
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

// Defense-in-depth schema guard rejecting self-follow edges
followSchema.pre('validate', function (next) {
  if (this.followerId && this.followingId && this.followerId.toString() === this.followingId.toString()) {
    this.invalidate('followingId', 'Users cannot follow themselves');
  }
  next();
});

// Prevent duplicate follow relationships
followSchema.index(
  { followerId: 1, followingId: 1 },
  { name: 'idx_follows_unique', unique: true },
);

// Optimized ESR index for paginated followers listing (supports { followingId: 1, createdAt: -1 } prefix + _id tie-breaker)
followSchema.index(
  { followingId: 1, createdAt: -1, _id: -1 },
  { name: 'idx_follows_followers' },
);

// Optimized ESR index for paginated following listing (supports { followerId: 1, createdAt: -1 } prefix + _id tie-breaker)
followSchema.index(
  { followerId: 1, createdAt: -1, _id: -1 },
  { name: 'idx_follows_following' },
);

export const FollowModel: Model<IFollowDocument> = model<IFollowDocument>('Follow', followSchema);
