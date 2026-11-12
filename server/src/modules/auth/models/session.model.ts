import { Schema, model, Document, Model, Types } from 'mongoose';
import crypto from 'node:crypto';
import { IDeviceInformation, SessionRevocationReason } from '@kerala-tourism/shared-types';

export interface ISessionDocument extends Document {
  accountId: Types.ObjectId;
  refreshTokenHash: string;
  familyId: string;
  replacedByTokenHash?: string | null;
  lastUsedAt?: Date | null;
  deviceInformation?: IDeviceInformation;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason?: SessionRevocationReason | string | null;
  createdAt: Date;
  updatedAt: Date;
  isExpired(): boolean;
  isRevoked(): boolean;
  isValid(): boolean;
  revoke(reason?: SessionRevocationReason | string): void;
}

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;

const deviceInformationSchema = new Schema<IDeviceInformation>(
  {
    userAgent: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    deviceId: { type: String, trim: true },
  },
  { _id: false },
);

export const sessionSchema = new Schema<ISessionDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID is required'],
    },
    refreshTokenHash: {
      type: String,
      required: [true, 'Refresh token hash is required'],
      validate: {
        validator: (v: string) => SHA256_HEX_REGEX.test(v),
        message: 'Refresh token hash must be a valid 64-character SHA-256 hexadecimal string',
      },
    },
    familyId: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    replacedByTokenHash: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    revocationReason: {
      type: String,
      default: null,
    },
    deviceInformation: {
      type: deviceInformationSchema,
      default: () => ({}),
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },
    revokedAt: {
      type: Date,
      default: null,
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

// Indexes:
// 1. Account query index for listing / revoking all sessions of an account
sessionSchema.index({ accountId: 1 });

// 2. TTL index for automatic expiration by MongoDB Atlas
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 3. Unique index on token hash to prevent collisions and rotation reuse
sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });

// 4. Session family index for token reuse detection and chain revocation
sessionSchema.index({ familyId: 1 });

// Document methods
sessionSchema.methods.isExpired = function (): boolean {
  return Date.now() >= this.expiresAt.getTime();
};

sessionSchema.methods.isRevoked = function (): boolean {
  return this.revokedAt !== null && this.revokedAt !== undefined;
};

sessionSchema.methods.isValid = function (): boolean {
  return !this.isExpired() && !this.isRevoked();
};

sessionSchema.methods.revoke = function (reason?: SessionRevocationReason | string): void {
  this.revokedAt = new Date();
  if (reason) {
    this.revocationReason = reason;
  }
};

export const SessionModel: Model<ISessionDocument> =
  model<ISessionDocument>('Session', sessionSchema);
