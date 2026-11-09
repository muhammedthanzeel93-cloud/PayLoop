import { z } from 'zod';
import {
  BOOKING_MODES,
  BOOKING_RULES,
  GEOSPATIAL_RULES,
  USER_ROLES,
} from '@kerala-tourism/constants';

// Environment Variables Schema
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: z.string().url().or(z.string().startsWith('mongodb://')).or(z.string().startsWith('mongodb+srv://')),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Geospatial Coordinate Validation
export const coordinatesSchema = z.object({
  latitude: z
    .number()
    .min(GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LATITUDE, 'Latitude is south of Kerala boundary')
    .max(GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LATITUDE, 'Latitude is north of Kerala boundary'),
  longitude: z
    .number()
    .min(GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LONGITUDE, 'Longitude is west of Kerala boundary')
    .max(GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LONGITUDE, 'Longitude is east of Kerala boundary'),
  altitude: z.number().optional(),
});

// User Registration Schema
export const userRegistrationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format').optional(),
  role: z.nativeEnum(USER_ROLES).default(USER_ROLES.TOURIST),
});

// Destination Submission Schema
export const destinationSubmissionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(2000),
  district: z.string().min(2),
  category: z.enum(['BACKWATERS', 'HILL_STATION', 'BEACH', 'HERITAGE', 'FOREST', 'CULTURE']),
  coordinates: coordinatesSchema,
  address: z.string().min(5),
  images: z.array(z.string().url()).min(1, 'At least one image is required'),
});

// Hourly vs Daily Booking Validation Schema
export const bookingCreationSchema = z.object({
  propertyId: z.string().min(1, 'Property ID is required'),
  roomId: z.string().min(1, 'Room ID is required'),
  mode: z.nativeEnum(BOOKING_MODES),
  checkInTime: z.string().datetime({ message: 'Valid ISO 8601 check-in datetime required' }),
  checkOutTime: z.string().datetime({ message: 'Valid ISO 8601 check-out datetime required' }),
  durationHours: z
    .number()
    .refine(
      (val) => (BOOKING_RULES.HOURLY_SLOT_DURATIONS_HOURS as readonly number[]).includes(val),
      'Hourly duration must be 3, 6, or 12 hours',
    )
    .optional(),
  guestsCount: z.number().int().min(1).max(20),
  specialRequests: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.mode === BOOKING_MODES.HOURLY && !data.durationHours) {
      return false;
    }
    return true;
  },
  {
    message: 'Hourly booking requires durationHours (3, 6, or 12)',
    path: ['durationHours'],
  },
);
