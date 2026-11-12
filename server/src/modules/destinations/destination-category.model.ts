import { Schema, model, Document, Model } from 'mongoose';

export interface IDestinationCategoryDocument extends Document {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const destinationCategorySchema = new Schema<IDestinationCategoryDocument>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [50, 'Category name cannot exceed 50 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      default: function (this: IDestinationCategoryDocument) {
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
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    icon: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'destinationCategories',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as unknown as { toString(): string }).toString();
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Slug normalization hook
destinationCategorySchema.pre('validate', function (next) {
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
  next();
});

destinationCategorySchema.index({ slug: 1 }, { unique: true });
destinationCategorySchema.index({ name: 1 }, { unique: true });
destinationCategorySchema.index({ isActive: 1 });

export const DestinationCategoryModel: Model<IDestinationCategoryDocument> =
  model<IDestinationCategoryDocument>('DestinationCategory', destinationCategorySchema);
