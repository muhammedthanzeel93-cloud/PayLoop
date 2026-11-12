import { Schema, model, Document } from 'mongoose';
import { USER_ROLES } from '@kerala-tourism/constants';
import { UserRole } from '../../shared/types';

export * from './models/touristProfile.model';
export * from './models/businessProfile.model';
export * from './models/adminProfile.model';

export interface IUserDocument extends Document {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isVerified: boolean;
  avatarUrl?: string;
  reputationScore: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    role: { type: String, enum: Object.values(USER_ROLES), default: USER_ROLES.TOURIST },
    isVerified: { type: Boolean, default: false },
    avatarUrl: { type: String },
    reputationScore: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const UserModel = model<IUserDocument>('User', userSchema);
