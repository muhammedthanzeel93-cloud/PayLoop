import { Schema, model, Document } from 'mongoose';

export interface ITourPackageDocument extends Document {
  agencyId: string;
  title: string;
  durationDays: number;
  durationNights: number;
  pricePerPerson: number;
  inclusions: string[];
  maxGroupSize: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tourPackageSchema = new Schema<ITourPackageDocument>(
  {
    agencyId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    durationDays: { type: Number, required: true },
    durationNights: { type: Number, required: true },
    pricePerPerson: { type: Number, required: true },
    inclusions: [{ type: String }],
    maxGroupSize: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const TourPackageModel = model<ITourPackageDocument>('TourPackage', tourPackageSchema);
