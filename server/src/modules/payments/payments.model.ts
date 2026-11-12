import { Schema, model, Document } from 'mongoose';
import { PaymentStatus } from './payments.types';

export interface IPaymentDocument extends Document {
  transactionId: string;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  escrowReleaseDueAt?: Date;
  isEscrowReleased: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPaymentDocument>(
  {
    transactionId: { type: String, required: true, unique: true, index: true },
    bookingId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'HELD_IN_ESCROW'],
      default: 'PENDING',
      index: true,
    },
    paymentMethod: { type: String, required: true },
    escrowReleaseDueAt: { type: Date },
    isEscrowReleased: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const PaymentModel = model<IPaymentDocument>('Payment', paymentSchema);
