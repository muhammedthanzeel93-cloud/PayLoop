import { Schema, model, Document } from 'mongoose';
import { BOOKING_MODES, BOOKING_STATUSES } from '@kerala-tourism/constants';
import { BookingMode, BookingStatus } from '../../shared/types';

export interface IBookingDocument extends Document {
  bookingNumber: string;
  touristId: string;
  propertyId: string;
  roomId: string;
  mode: BookingMode;
  checkInTime: Date;
  checkOutTime: Date;
  durationHours?: number;
  guestsCount: number;
  totalAmount: number;
  status: BookingStatus;
  qrPassCode?: string;
  specialRequests?: string;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBookingDocument>(
  {
    bookingNumber: { type: String, required: true, unique: true, index: true },
    touristId: { type: String, required: true, index: true },
    propertyId: { type: String, required: true, index: true },
    roomId: { type: String, required: true },
    mode: { type: String, enum: Object.values(BOOKING_MODES), required: true },
    checkInTime: { type: Date, required: true },
    checkOutTime: { type: Date, required: true },
    durationHours: { type: Number },
    guestsCount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUSES),
      default: BOOKING_STATUSES.PENDING_APPROVAL,
      index: true,
    },
    qrPassCode: { type: String },
    specialRequests: { type: String },
  },
  { timestamps: true },
);

export const BookingModel = model<IBookingDocument>('Booking', bookingSchema);
