import { Schema, model, Document, Model, Types } from 'mongoose';
import {
  BUSINESS_TYPES,
  VERIFICATION_STATUSES,
  BUSINESS_DOCUMENT_TYPES,
} from '@kerala-tourism/constants';
import {
  BusinessType,
  VerificationStatus,
  IBusinessAddress,
  IBusinessDocument,
} from '@kerala-tourism/shared-types';

export interface IBusinessProfileDocument extends Document {
  accountId: Types.ObjectId;
  businessName: string;
  businessType: BusinessType;
  businessAddress?: IBusinessAddress;
  contactNumber: string;
  verificationStatus: VerificationStatus;
  documents: IBusinessDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

const businessAddressSchema = new Schema<IBusinessAddress>(
  {
    street: { type: String, required: [true, 'Street is required'], trim: true },
    city: { type: String, required: [true, 'City is required'], trim: true },
    district: { type: String, required: [true, 'District is required'], trim: true },
    postalCode: { type: String, required: [true, 'Postal code is required'], trim: true },
    state: { type: String, required: [true, 'State is required'], trim: true, default: 'Kerala' },
  },
  { _id: false },
);

const businessDocumentSchema = new Schema<IBusinessDocument>(
  {
    documentType: {
      type: String,
      enum: {
        values: Object.values(BUSINESS_DOCUMENT_TYPES),
        message: 'Invalid document type: {VALUE}',
      },
      required: [true, 'Document type is required'],
    },
    storageKey: {
      type: String,
      required: [true, 'Storage key reference is required'],
      trim: true,
      validate: {
        validator: (v: string) => {
          // Verify it's a vault storage reference key, not an insecure HTTP/HTTPS public URL
          return !v.startsWith('http://') && !v.startsWith('https://');
        },
        message: 'Documents must be stored as secure vault storage keys, not public URLs',
      },
    },
    originalFileName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
      min: [1, 'File size must be greater than 0 bytes'],
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      trim: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

export const businessProfileSchema = new Schema<IBusinessProfileDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID is required'],
    },
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters'],
      maxlength: [100, 'Business name cannot exceed 100 characters'],
    },
    businessType: {
      type: String,
      enum: {
        values: Object.values(BUSINESS_TYPES),
        message: 'Invalid business type: {VALUE}',
      },
      required: [true, 'Business type is required'],
    },
    businessAddress: {
      type: businessAddressSchema,
      required: false,
    },
    contactNumber: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true,
      validate: {
        validator: (v: string) => PHONE_REGEX.test(v),
        message: 'Invalid contact number format',
      },
    },
    verificationStatus: {
      type: String,
      enum: {
        values: Object.values(VERIFICATION_STATUSES),
        message: 'Invalid verification status: {VALUE}',
      },
      default: VERIFICATION_STATUSES.PENDING,
      required: [true, 'Verification status is required'],
    },
    documents: {
      type: [businessDocumentSchema],
      default: () => [],
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

// Enforce one business profile per account
businessProfileSchema.index({ accountId: 1 }, { unique: true });

export const BusinessProfileModel: Model<IBusinessProfileDocument> =
  model<IBusinessProfileDocument>('BusinessProfile', businessProfileSchema);
