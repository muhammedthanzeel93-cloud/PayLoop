import { Schema, model, Document, Model } from 'mongoose';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES } from '@kerala-tourism/constants';
import { AccountType, AccountStatus } from '@kerala-tourism/shared-types';

export interface IAccountDocument extends Document {
  email: string;
  passwordHash: string;
  accountType: AccountType;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_OR_ARGON_REGEX = /^(\$2[aby]\$\d{2}\$|\$argon2id\$v=\d+\$)/;

export const accountSchema = new Schema<IAccountDocument>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      set: (val: unknown) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
      validate: {
        validator: (v: string) => EMAIL_REGEX.test(v),
        message: 'Invalid email address format',
      },
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
      validate: {
        validator: (v: string) => {
          // Prevent storing raw unhashed passwords
          if (!v || v.length < 20) return false;
          // Verify format resembles bcrypt or argon2 hash
          return BCRYPT_OR_ARGON_REGEX.test(v) || v.startsWith('$');
        },
        message: 'Password must be securely hashed before persistence',
      },
    },
    accountType: {
      type: String,
      enum: {
        values: Object.values(ACCOUNT_TYPES),
        message: 'Invalid account type: {VALUE}',
      },
      required: [true, 'Account type is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(ACCOUNT_STATUSES),
        message: 'Invalid account status: {VALUE}',
      },
      default: ACCOUNT_STATUSES.ACTIVE,
      required: [true, 'Account status is required'],
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['passwordHash'];
        delete ret['__v'];
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret['passwordHash'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// Pre-validation normalization hook
accountSchema.pre('validate', function (next) {
  if (this.email && typeof this.email === 'string') {
    this.email = this.email.trim().toLowerCase();
  }
  next();
});

// Explicit unique index definition on normalized email
accountSchema.index({ email: 1 }, { unique: true });

export const AccountModel: Model<IAccountDocument> =
  model<IAccountDocument>('Account', accountSchema);
