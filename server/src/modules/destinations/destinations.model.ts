import { Schema, model, Document, Model, Types } from 'mongoose';
import {
  KERALA_DISTRICTS,
  DESTINATION_VERIFICATION_STATUSES,
  DESTINATION_PUBLICATION_STATUSES,
  GEOSPATIAL_RULES,
} from '@kerala-tourism/constants';
import {
  KeralaDistrict,
  DestinationVerificationStatus,
  DestinationPublicationStatus,
  GeoPoint,
} from '@kerala-tourism/shared-types';

export interface IDestinationEntryFee {
  amount: number;
  currency: string;
  isFree: boolean;
}

export interface IDestinationDocument extends Document {
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  categoryIds: Types.ObjectId[];
  location: GeoPoint;
  address: string;
  district: KeralaDistrict;
  locality?: string;
  images: string[];
  facilities: string[];
  bestTimeToVisit?: string;
  entryFee: IDestinationEntryFee;
  verificationStatus: DestinationVerificationStatus;
  publicationStatus: DestinationPublicationStatus;
  createdBy: Types.ObjectId;
  verifiedBy?: Types.ObjectId;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Backward compatibility alias
  title?: string;
  status?: string;
  averageRating?: number;
  reviewCount?: number;
}

const destinationSchema = new Schema<IDestinationDocument>(
  {
    name: {
      type: String,
      required: [true, 'Destination name is required'],
      trim: true,
      minlength: [2, 'Destination name must be at least 2 characters'],
      maxlength: [120, 'Destination name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Destination slug is required'],
      default: function (this: IDestinationDocument) {
        return this.name
          ? this.name
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '')
          : undefined;
      },
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Destination description is required'],
      trim: true,
      minlength: [20, 'Description must be at least 20 characters'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: [300, 'Short description cannot exceed 300 characters'],
    },
    categoryIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'DestinationCategory',
      },
    ],
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: [true, 'GeoJSON type must be Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: [true, 'GeoJSON coordinates [longitude, latitude] are required'],
        validate: {
          validator: function (coords: number[]) {
            if (!Array.isArray(coords) || coords.length !== 2) return false;
            const [lng, lat] = coords;
            return (
              lng >= GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LONGITUDE &&
              lng <= GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LONGITUDE &&
              lat >= GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LATITUDE &&
              lat <= GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LATITUDE
            );
          },
          message:
            'Coordinates must be valid Kerala [longitude, latitude] bounds (74.86 <= lng <= 77.42, 8.18 <= lat <= 12.85)',
        },
      },
    },
    address: {
      type: String,
      required: [true, 'Destination address is required'],
      trim: true,
      minlength: [5, 'Address must be at least 5 characters'],
      maxlength: [300, 'Address cannot exceed 300 characters'],
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      enum: {
        values: KERALA_DISTRICTS as unknown as string[],
        message: 'Invalid district: {VALUE}. Must be one of 14 Kerala districts.',
      },
    },
    locality: {
      type: String,
      trim: true,
      maxlength: [100, 'Locality cannot exceed 100 characters'],
    },
    images: {
      type: [String],
      default: [],
    },
    facilities: {
      type: [String],
      default: [],
    },
    bestTimeToVisit: {
      type: String,
      trim: true,
      maxlength: [100, 'Best time to visit cannot exceed 100 characters'],
    },
    entryFee: {
      amount: {
        type: Number,
        default: 0,
        min: [0, 'Entry fee amount cannot be negative'],
      },
      currency: {
        type: String,
        default: 'INR',
        trim: true,
      },
      isFree: {
        type: Boolean,
        default: true,
      },
    },
    verificationStatus: {
      type: String,
      enum: {
        values: Object.values(DESTINATION_VERIFICATION_STATUSES),
        message: 'Invalid verification status: {VALUE}',
      },
      default: DESTINATION_VERIFICATION_STATUSES.PENDING,
    },
    publicationStatus: {
      type: String,
      enum: {
        values: Object.values(DESTINATION_PUBLICATION_STATUSES),
        message: 'Invalid publication status: {VALUE}',
      },
      default: DESTINATION_PUBLICATION_STATUSES.DRAFT,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Creator account ID is required'],
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
    },
    publishedAt: {
      type: Date,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'destinations',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as Types.ObjectId).toString();
        ret.title = ret.name;
        ret.status = ret.verificationStatus;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Virtual for backward-compatibility with title
destinationSchema.virtual('title').get(function () {
  return this.name;
});

// Pre-validate hook for slug generation & normalization
destinationSchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  } else if (this.slug) {
    this.slug = this.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // Automatic entryFee isFree flag synchronization
  if (this.entryFee) {
    if (this.entryFee.amount > 0) {
      this.entryFee.isFree = false;
    } else {
      this.entryFee.isFree = true;
    }
  }

  next();
});

// Schema Indexes
destinationSchema.index({ location: '2dsphere' });
destinationSchema.index({ slug: 1 }, { unique: true });
destinationSchema.index({ categoryIds: 1 });
destinationSchema.index({ district: 1 });
destinationSchema.index({ publicationStatus: 1 });
destinationSchema.index({ verificationStatus: 1 });
destinationSchema.index({ createdAt: -1 });

// Public Discovery Compound Indexes
destinationSchema.index({ verificationStatus: 1, publicationStatus: 1, district: 1 });
destinationSchema.index({ verificationStatus: 1, publicationStatus: 1, createdAt: -1 });

export const DestinationModel: Model<IDestinationDocument> =
  model<IDestinationDocument>('Destination', destinationSchema);
