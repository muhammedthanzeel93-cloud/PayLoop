import { Schema, model, Document, Model, Types } from 'mongoose';
import { PREFERRED_LANGUAGES } from '@kerala-tourism/constants';
import { PreferredLanguage } from '@kerala-tourism/shared-types';

export interface ITouristProfileDocument extends Document {
  accountId: Types.ObjectId;
  firstName: string;
  lastName: string;
  profileImage?: string;
  bio?: string;
  phoneNumber?: string;
  preferredLanguage: PreferredLanguage;
  followersCount: number;
  followingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

export const touristProfileSchema = new Schema<ITouristProfileDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID is required'],
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [1, 'First name must be at least 1 character'],
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [1, 'Last name must be at least 1 character'],
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    profileImage: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
    },
    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: (v: string) => !v || PHONE_REGEX.test(v),
        message: 'Invalid phone number format',
      },
    },
    preferredLanguage: {
      type: String,
      enum: {
        values: Object.values(PREFERRED_LANGUAGES),
        message: 'Invalid preferred language: {VALUE}',
      },
      default: PREFERRED_LANGUAGES.EN,
    },
    followersCount: {
      type: Number,
      default: 0,
      min: [0, 'Followers count cannot be negative'],
      required: true,
    },
    followingCount: {
      type: Number,
      default: 0,
      min: [0, 'Following count cannot be negative'],
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// Enforce one tourist profile per account
touristProfileSchema.index({ accountId: 1 }, { unique: true });

export const TouristProfileModel: Model<ITouristProfileDocument> =
  model<ITouristProfileDocument>('TouristProfile', touristProfileSchema);
