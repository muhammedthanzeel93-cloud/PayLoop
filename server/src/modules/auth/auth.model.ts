import { Schema, model, Document } from 'mongoose';

export * from './models/account.model';
export * from './models/session.model';

export interface IAuthSession extends Document {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const authSessionSchema = new Schema<IAuthSession>(
  {
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const AuthSessionModel = model<IAuthSession>('AuthSession', authSessionSchema);
