import { Schema, model, Document, Model, Types } from 'mongoose';
import { ADMIN_LEVELS, ADMIN_PERMISSIONS } from '@kerala-tourism/constants';
import { AdminLevel, AdminPermission } from '@kerala-tourism/shared-types';

export interface IAdminProfileDocument extends Document {
  accountId: Types.ObjectId;
  displayName: string;
  permissions: AdminPermission[];
  adminLevel: AdminLevel;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_PERMISSIONS = Object.values(ADMIN_PERMISSIONS) as string[];

export const adminProfileSchema = new Schema<IAdminProfileDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID is required'],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [50, 'Display name cannot exceed 50 characters'],
    },
    permissions: {
      type: [String],
      required: [true, 'Permissions are required'],
      validate: {
        validator: (perms: string[]) => {
          if (!Array.isArray(perms) || perms.length === 0) return false;
          return perms.every((p) => VALID_PERMISSIONS.includes(p));
        },
        message: 'Permissions array must be non-empty and contain only recognized system permissions',
      },
    },
    adminLevel: {
      type: String,
      enum: {
        values: Object.values(ADMIN_LEVELS),
        message: 'Invalid admin level: {VALUE}',
      },
      required: [true, 'Admin level is required'],
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
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

// Enforce one admin profile per account
adminProfileSchema.index({ accountId: 1 }, { unique: true });

export const AdminProfileModel: Model<IAdminProfileDocument> =
  model<IAdminProfileDocument>('AdminProfile', adminProfileSchema);
