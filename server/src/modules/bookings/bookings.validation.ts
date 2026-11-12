import { z } from 'zod';
import { BOOKING_MODES, BOOKING_RULES } from '@kerala-tourism/constants';

export const createBookingSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().min(1),
  mode: z.nativeEnum(BOOKING_MODES),
  checkInTime: z.string().datetime(),
  checkOutTime: z.string().datetime(),
  durationHours: z
    .number()
    .refine((val) => (BOOKING_RULES.HOURLY_SLOT_DURATIONS_HOURS as readonly number[]).includes(val))
    .optional(),
  guestsCount: z.number().int().min(1).max(20),
  specialRequests: z.string().max(500).optional(),
});
