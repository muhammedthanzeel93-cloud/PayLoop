import { Schema, model, Document, Model, Types } from 'mongoose';
import { DESTINATION_SUBMISSION_STATUSES } from '@kerala-tourism/constants';
import { DestinationSubmissionStatus, GeoPoint } from '@kerala-tourism/shared-types';

export interface IDestinationSubmissionDocument extends Document {
  submittedBy: Types.ObjectId;
  name: string;
  description: string;
  categoryIds: Types.ObjectId[];
  submittedLocation: GeoPoint;
  submittedAddress: string;
  imageMediaIds: string[];
  submissionStatus: DestinationSubmissionStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  destinationId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const destinationSubmissionSchema = new Schema<IDestinationSubmissionDocument>(
  {
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Submitter account ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Destination name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [120, 'Name cannot exceed 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [20, 'Description must be at least 20 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    categoryIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'DestinationCategory',
      },
    ],
    submittedLocation: {
      type: {
        type: String,
        enum: ['Point'],
        required: [true, 'GeoJSON type must be Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: [true, 'GeoJSON coordinates are required'],
      },
    },
    submittedAddress: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      minlength: [5, 'Address must be at least 5 characters'],
      maxlength: [300, 'Address cannot exceed 300 characters'],
    },
    imageMediaIds: {
      type: [String],
      required: [true, 'At least one image reference is required'],
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'At least one image media ID is required',
      },
    },
    submissionStatus: {
      type: String,
      enum: {
        values: Object.values(DESTINATION_SUBMISSION_STATUSES),
        message: 'Invalid submission status: {VALUE}',
      },
      default: DESTINATION_SUBMISSION_STATUSES.PENDING,
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
    },
    reviewedAt: {
      type: Date,
    },
    reviewNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review notes cannot exceed 1000 characters'],
    },
    destinationId: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
    },
  },
  {
    timestamps: true,
    collection: 'destinationSubmissions',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as unknown as { toString(): string }).toString();
        delete ret.__v;
        return ret;
      },
    },
  },
);

destinationSubmissionSchema.index({ submittedBy: 1, createdAt: -1 });
destinationSubmissionSchema.index({ submissionStatus: 1, createdAt: -1 });
destinationSubmissionSchema.index({ submittedLocation: '2dsphere' });

export const DestinationSubmissionModel: Model<IDestinationSubmissionDocument> =
  model<IDestinationSubmissionDocument>('DestinationSubmission', destinationSubmissionSchema);
