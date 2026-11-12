import { Schema, model, Document, Model, Types } from 'mongoose';
import {
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LEVELS,
  AUDIT_TARGET_ENTITY_TYPES,
} from '@kerala-tourism/constants';
import type {
  AccountType,
  AdminAuditAction,
  AdminLevel,
  AuditTargetEntityType,
} from '@kerala-tourism/shared-types';

export interface IAuditLog {
  actorAccountId: Types.ObjectId;
  actorAccountType: AccountType;
  actorAdminLevel: AdminLevel;
  action: AdminAuditAction;
  targetEntityId: Types.ObjectId;
  targetEntityType: AuditTargetEntityType;
  reason: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {
  _id: Types.ObjectId;
}

const IMMUTABILITY_ERROR_MESSAGE =
  'AuditLog records are immutable append-only records and cannot be modified or deleted';

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    actorAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Acting admin account ID is required'],
    },
    actorAccountType: {
      type: String,
      enum: {
        values: Object.values(ACCOUNT_TYPES),
        message: 'Invalid actor account type: {VALUE}',
      },
      required: [true, 'Actor account type is required'],
    },
    actorAdminLevel: {
      type: String,
      enum: {
        values: Object.values(ADMIN_LEVELS),
        message: 'Invalid actor admin level: {VALUE}',
      },
      required: [true, 'Actor admin level is required'],
    },
    action: {
      type: String,
      enum: {
        values: Object.values(ADMIN_AUDIT_ACTIONS),
        message: 'Invalid audit action: {VALUE}',
      },
      required: [true, 'Audit action is required'],
    },
    targetEntityId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Target entity ID is required'],
    },
    targetEntityType: {
      type: String,
      enum: {
        values: Object.values(AUDIT_TARGET_ENTITY_TYPES),
        message: 'Invalid target entity type: {VALUE}',
      },
      default: AUDIT_TARGET_ENTITY_TYPES.ACCOUNT,
      required: [true, 'Target entity type is required'],
    },
    reason: {
      type: String,
      required: [true, 'Audit reason is required'],
      trim: true,
      maxlength: [500, 'Audit reason cannot exceed 500 characters'],
    },
    beforeState: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
    },
    afterState: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
    },
    ipAddress: {
      type: String,
      default: null,
      maxlength: 64,
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 256,
    },
    timestamp: {
      type: Date,
      default: () => new Date(),
      required: true,
    },
  },
  {
    collection: 'auditLogs',
    versionKey: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret['_id']) {
          ret['id'] = String(ret['_id']);
        }
        return ret;
      },
    },
  },
);

// Query indexes aligned with docs/database/indexing-strategy.md
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ targetEntityId: 1, targetEntityType: 1, timestamp: -1 });
auditLogSchema.index({ actorAccountId: 1, timestamp: -1 });

// Enforce append-only immutability through Mongoose APIs
auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  function (next) {
    next(new Error(IMMUTABILITY_ERROR_MESSAGE));
  },
);

export const AuditLogModel: Model<IAuditLogDocument> =
  model<IAuditLogDocument>('AuditLog', auditLogSchema);
