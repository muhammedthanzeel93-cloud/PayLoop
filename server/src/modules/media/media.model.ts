import { Schema, model, Document, Model, Types } from 'mongoose';
import { MEDIA_RULES } from '@kerala-tourism/constants';
import { MediaMimeType } from '@kerala-tourism/shared-types';

export interface IMediaDimensions {
  width: number;
  height: number;
}

export interface IMediaDocument extends Document {
  uploaderAccountId: Types.ObjectId;
  destinationId?: Types.ObjectId;
  storageKey: string;
  url: string;
  mimeType: MediaMimeType;
  fileSizeBytes: number;
  dimensions?: IMediaDimensions;
  isPrimary: boolean;
  displayOrder: number;
  isModerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IMediaDocument>(
  {
    uploaderAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Uploader account ID is required'],
    },
    destinationId: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
    },
    storageKey: {
      type: String,
      required: [true, 'Storage key is required'],
      trim: true,
    },
    url: {
      type: String,
      required: [true, 'Media URL is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      enum: {
        values: MEDIA_RULES.ALLOWED_MIME_TYPES as unknown as string[],
        message: 'Unsupported MIME type: {VALUE}',
      },
    },
    fileSizeBytes: {
      type: Number,
      required: [true, 'File size in bytes is required'],
      min: [1, 'File size must be positive'],
      max: [
        MEDIA_RULES.MAX_FILE_SIZE_BYTES,
        `File size cannot exceed ${MEDIA_RULES.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      ],
    },
    dimensions: {
      width: { type: Number },
      height: { type: Number },
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isModerated: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'media',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as Types.ObjectId).toString();
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes
mediaSchema.index({ storageKey: 1 }, { unique: true });
mediaSchema.index({ destinationId: 1, displayOrder: 1 });
mediaSchema.index({ uploaderAccountId: 1, createdAt: -1 });

export const MediaModel: Model<IMediaDocument> = model<IMediaDocument>('Media', mediaSchema);
