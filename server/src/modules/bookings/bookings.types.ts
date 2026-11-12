import { BookingMode, BookingStatus } from '../../shared/types';

export interface CreateBookingDto {
  touristId: string;
  propertyId: string;
  roomId: string;
  mode: BookingMode;
  checkInTime: string;
  checkOutTime: string;
  durationHours?: number;
  guestsCount: number;
  totalAmount: number;
  specialRequests?: string;
}

export interface BookingQueryFilter {
  touristId?: string;
  propertyId?: string;
  status?: BookingStatus;
  limit?: number;
}
