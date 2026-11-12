import { Schema, model, Document, Model, Types } from 'mongoose';
import {
  MODERATION_RULES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '@kerala-tourism/constants';
import type {
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '@kerala-tourism/shared-types';

export interface IReportDocument extends Document {
  _id: Types.ObjectId;
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reason: ReportReason;
  description?: string | null;
  status: ReportStatus;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  moderatorNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const reportSchema = new Schema<IReportDocument>(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Reporter account ID is required'],
      immutable: true,
    },
    targetType: {
      type: String,
      enum: {
        values: Object.values(REPORT_TARGET_TYPES),
        message: 'Invalid report target type: {VALUE}',
      },
      required: [true, 'Target type is required'],
      immutable: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Target ID is required'],
      immutable: true,
    },
    reason: {
      type: String,
      enum: {
        values: Object.values(REPORT_REASONS),
        message: 'Invalid report reason: {VALUE}',
      },
      required: [true, 'Report reason is required'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [
        MODERATION_RULES.MAX_DESCRIPTION_LENGTH,
        `Description cannot exceed ${MODERATION_RULES.MAX_DESCRIPTION_LENGTH} characters`,
      ],
      default: null,
      validate: {
        validator: function (this: IReportDocument, val: string | null | undefined) {
          if (this.reason === REPORT_REASONS.OTHER) {
            return (
              typeof val === 'string' &&
              val.trim().length >= MODERATION_RULES.MIN_OTHER_DESCRIPTION_LENGTH
            );
          }
          return true;
        },
        message: `Description of at least ${MODERATION_RULES.MIN_OTHER_DESCRIPTION_LENGTH} characters is required when reason is OTHER`,
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(REPORT_STATUSES),
        message: 'Invalid report status: {VALUE}',
      },
      default: REPORT_STATUSES.PENDING,
      required: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    moderatorNotes: {
      type: String,
      trim: true,
      maxlength: [
        MODERATION_RULES.MAX_NOTES_LENGTH,
        `Moderator notes cannot exceed ${MODERATION_RULES.MAX_NOTES_LENGTH} characters`,
      ],
      default: null,
    },
  },
  {
    collection: 'reports',
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret['_id']) {
          ret['id'] = String(ret['_id']);
        }
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

// Prevent duplicate active (PENDING / UNDER_REVIEW) reports by the same reporter on the same target
// while preserving historical RESOLVED / DISMISSED report records.
reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  {
    unique: true,
    name: 'idx_reports_active_unique',
    partialFilterExpression: {
      status: { $in: [REPORT_STATUSES.PENDING, REPORT_STATUSES.UNDER_REVIEW] },
    },
  },
);

// Admin report triage queue (oldest pending first)
reportSchema.index(
  { status: 1, createdAt: 1, _id: 1 },
  { name: 'idx_reports_triage' },
);

// Reporter personal report history
reportSchema.index(
  { reporterId: 1, createdAt: -1, _id: -1 },
  { name: 'idx_reports_reporter' },
);

// Lookup active/historical reports per target content entity
reportSchema.index(
  { targetType: 1, targetId: 1, status: 1 },
  { name: 'idx_reports_target_status' },
);

export const ReportModel: Model<IReportDocument> = model<IReportDocument>('Report', reportSchema);
