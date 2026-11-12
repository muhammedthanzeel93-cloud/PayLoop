import { Schema, model, Document } from 'mongoose';

export interface IPropertyDocument extends Document {
  ownerId: string;
  name: string;
  category: string;
  district: string;
  address: string;
  amenities: string[];
  supportsHourly: boolean;
  supportsDaily: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const propertySchema = new Schema<IPropertyDocument>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    district: { type: String, required: true, index: true },
    address: { type: String, required: true },
    amenities: [{ type: String }],
    supportsHourly: { type: Boolean, default: false },
    supportsDaily: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const PropertyModel = model<IPropertyDocument>('Property', propertySchema);
