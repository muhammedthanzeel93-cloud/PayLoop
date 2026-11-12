import { z } from 'zod';
import {
  BOOKING_MODES,
  BOOKING_RULES,
  GEOSPATIAL_RULES,
  USER_ROLES,
  BUSINESS_TYPES,
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  ADMIN_USER_MANAGEMENT_RULES,
  DESTINATION_SUBMISSION_STATUSES,
  KERALA_DISTRICTS,
  MEDIA_RULES,
  MAP_CONFIG,
  MODERATION_CONTENT_TYPES,
  MODERATION_RULES,
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '@kerala-tourism/constants';

// Environment Variables Schema
export const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  MONGO_URL: z.string().url().or(z.string().startsWith('mongodb://')).or(z.string().startsWith('mongodb+srv://')).optional(),
  MONGODB_URI: z.string().url().or(z.string().startsWith('mongodb://')).or(z.string().startsWith('mongodb+srv://')).optional(),
  CLIENT_URL: z.string().url().or(z.string().startsWith('http://')).or(z.string().startsWith('https://')).default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long').default('kerala-tourism-dev-access-secret-32-chars-minimum'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default('kerala-tourism-auth'),
  JWT_AUDIENCE: z.string().default('kerala-tourism-api'),
});

export const envSchema = rawEnvSchema.transform((data) => {
  const mongoUrl = data.MONGO_URL || data.MONGODB_URI || 'mongodb://127.0.0.1:27017/kerala_tourism';
  const corsOrigins = data.CORS_ORIGINS || data.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001,http://localhost:3002';
  return {
    NODE_ENV: data.NODE_ENV,
    PORT: data.PORT,
    HOST: data.HOST,
    MONGO_URL: mongoUrl,
    MONGODB_URI: mongoUrl,
    CLIENT_URL: data.CLIENT_URL,
    CORS_ORIGINS: corsOrigins,
    CORS_ORIGIN: corsOrigins,
    JWT_ACCESS_SECRET: data.JWT_ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: data.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN_DAYS: data.JWT_REFRESH_EXPIRES_IN_DAYS,
    JWT_ISSUER: data.JWT_ISSUER,
    JWT_AUDIENCE: data.JWT_AUDIENCE,
  };
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

// ==============================================================================
// Authentication & Registration Schemas
// ==============================================================================

const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

const E164_PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;

export const passwordPolicySchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(100, 'Password cannot exceed 100 characters')
  .regex(
    PASSWORD_COMPLEXITY_REGEX,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  );

export const touristRegistrationSchema = z
  .object({
    firstName: z
      .string({ required_error: 'First name is required' })
      .trim()
      .min(1, 'First name is required')
      .max(50, 'First name cannot exceed 50 characters'),
    lastName: z
      .string({ required_error: 'Last name is required' })
      .trim()
      .min(1, 'Last name is required')
      .max(50, 'Last name cannot exceed 50 characters'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address format'),
    password: passwordPolicySchema,
    confirmPassword: z.string({ required_error: 'Password confirmation is required' }),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type TouristRegistrationInput = z.infer<typeof touristRegistrationSchema>;

export const businessRegistrationSchema = z
  .object({
    businessName: z
      .string({ required_error: 'Business name is required' })
      .trim()
      .min(2, 'Business name must be at least 2 characters')
      .max(100, 'Business name cannot exceed 100 characters'),
    businessType: z.nativeEnum(BUSINESS_TYPES, {
      errorMap: () => ({ message: 'Invalid business type' }),
    }),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address format'),
    password: passwordPolicySchema,
    confirmPassword: z.string({ required_error: 'Password confirmation is required' }),
    contactNumber: z
      .string({ required_error: 'Contact number is required' })
      .trim()
      .regex(E164_PHONE_REGEX, 'Contact number must be in valid E.164 format (e.g. +919847012345)'),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type BusinessRegistrationInput = z.infer<typeof businessRegistrationSchema>;

// User Login Schema
export const loginSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email address format'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required'),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type LoginInput = z.infer<typeof loginSchema>;

// Refresh Token Schema
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().trim().min(1, 'Refresh token cannot be empty').optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// User Registration Schema (Legacy / Internal)
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

// ==============================================================================
// Authorization & Profile Update Schemas (Day 10)
// ==============================================================================

export const updateTouristProfileSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name cannot be empty').max(50).optional(),
    lastName: z.string().trim().min(1, 'Last name cannot be empty').max(50).optional(),
    bio: z.string().trim().max(500).optional(),
    phoneNumber: z.string().trim().regex(E164_PHONE_REGEX, 'Invalid phone number format').optional(),
    profileImage: z.string().url('Invalid URL format').optional(),
    preferredLanguage: z.enum(['EN', 'ML']).optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in profile update' });

export type UpdateTouristProfileInput = z.infer<typeof updateTouristProfileSchema>;

export const updateBusinessProfileSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(100).optional(),
    contactNumber: z.string().trim().regex(E164_PHONE_REGEX, 'Invalid phone number format').optional(),
    businessAddress: z
      .object({
        street: z.string().trim().min(1),
        city: z.string().trim().min(1),
        district: z.string().trim().min(1),
        postalCode: z.string().trim().min(1),
        state: z.string().trim().default('Kerala'),
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in business update' });

export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>;

export const verifyBusinessActionSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED', 'UNDER_REVIEW']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict({ message: 'Unrecognized fields in verification action' });

export type VerifyBusinessActionInput = z.infer<typeof verifyBusinessActionSchema>;

export const createPropertySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    category: z.string().trim().min(2),
    district: z.string().trim().min(2),
    address: z.string().trim().min(5),
    amenities: z.array(z.string()).default([]),
    supportsHourly: z.boolean().default(false),
    supportsDaily: z.boolean().default(true),
  })
  .strict({ message: 'Unrecognized fields in property creation' });

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const createTourPackageSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    durationDays: z.number().int().positive(),
    durationNights: z.number().int().nonnegative(),
    pricePerPerson: z.number().positive(),
    inclusions: z.array(z.string()).default([]),
    maxGroupSize: z.number().int().positive(),
  })
  .strict({ message: 'Unrecognized fields in package creation' });

export type CreateTourPackageInput = z.infer<typeof createTourPackageSchema>;

// ==============================================================================
// Day 11 – Destination Management Schemas
// ==============================================================================

export const keralaDistrictSchema = z.enum(KERALA_DISTRICTS, {
  errorMap: () => ({ message: 'District must be one of the 14 approved Kerala districts' }),
});

export const geoJsonPointSchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z
      .tuple([
        z.number({ required_error: 'Longitude is required' }),
        z.number({ required_error: 'Latitude is required' }),
      ])
      .refine(
        ([lng, lat]) =>
          lng >= GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LONGITUDE &&
          lng <= GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LONGITUDE &&
          lat >= GEOSPATIAL_RULES.KERALA_BOUNDS.MIN_LATITUDE &&
          lat <= GEOSPATIAL_RULES.KERALA_BOUNDS.MAX_LATITUDE,
        {
          message: 'Coordinates must be valid Kerala [longitude, latitude] bounds',
        },
      ),
  })
  .strict({ message: 'Unrecognized fields in GeoJSON point' });

export const createDestinationSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(120, 'Name cannot exceed 120 characters'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(20, 'Description must be at least 20 characters')
      .max(5000, 'Description cannot exceed 5000 characters'),
    shortDescription: z.string().trim().max(300, 'Short description cannot exceed 300 characters').optional(),
    categoryIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID format')).optional().default([]),
    location: geoJsonPointSchema,
    address: z
      .string({ required_error: 'Address is required' })
      .trim()
      .min(5, 'Address must be at least 5 characters')
      .max(300, 'Address cannot exceed 300 characters'),
    district: keralaDistrictSchema,
    locality: z.string().trim().max(100).optional(),
    images: z.array(z.string().trim()).default([]),
    facilities: z.array(z.string().trim()).default([]),
    bestTimeToVisit: z.string().trim().max(100).optional(),
    entryFee: z
      .object({
        amount: z.number().min(0, 'Amount cannot be negative').default(0),
        currency: z.string().trim().default('INR'),
        isFree: z.boolean().default(true),
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in destination creation' });

export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;

export const updateDestinationSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().min(20).max(5000).optional(),
    shortDescription: z.string().trim().max(300).optional(),
    categoryIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID format')).optional(),
    location: geoJsonPointSchema.optional(),
    address: z.string().trim().min(5).max(300).optional(),
    district: keralaDistrictSchema.optional(),
    locality: z.string().trim().max(100).optional(),
    images: z.array(z.string().trim()).optional(),
    facilities: z.array(z.string().trim()).optional(),
    bestTimeToVisit: z.string().trim().max(100).optional(),
    entryFee: z
      .object({
        amount: z.number().min(0).default(0),
        currency: z.string().trim().default('INR'),
        isFree: z.boolean().default(true),
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in destination update' });

export type UpdateDestinationInput = z.infer<typeof updateDestinationSchema>;

export const createDestinationCategorySchema = z
  .object({
    name: z
      .string({ required_error: 'Category name is required' })
      .trim()
      .min(2, 'Category name must be at least 2 characters')
      .max(50, 'Category name cannot exceed 50 characters'),
    description: z.string().trim().max(500).optional(),
    icon: z.string().trim().optional(),
    isActive: z.boolean().default(true),
  })
  .strict({ message: 'Unrecognized fields in category creation' });

export type CreateDestinationCategoryInput = z.infer<typeof createDestinationCategorySchema>;

export const createDestinationSubmissionSchema = z
  .object({
    name: z
      .string({ required_error: 'Destination name is required' })
      .trim()
      .min(2, 'Destination name must be at least 2 characters')
      .max(120, 'Destination name cannot exceed 120 characters'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(20, 'Description must be at least 20 characters')
      .max(2000, 'Description cannot exceed 2000 characters'),
    categoryIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID format')).optional().default([]),
    submittedLocation: geoJsonPointSchema,
    submittedAddress: z
      .string({ required_error: 'Address is required' })
      .trim()
      .min(5, 'Address must be at least 5 characters')
      .max(300, 'Address cannot exceed 300 characters'),
    imageMediaIds: z.array(z.string().trim()).min(1, 'At least one image reference is required').max(10),
  })
  .strict({ message: 'Unrecognized fields in destination submission' });

export type CreateDestinationSubmissionInput = z.infer<typeof createDestinationSubmissionSchema>;

export const reviewDestinationSubmissionSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT'], {
      required_error: 'Review action must be APPROVE or REJECT',
    }),
    reviewNotes: z.string().trim().max(1000).optional(),
  })
  .strict({ message: 'Unrecognized fields in submission review' });

export type ReviewDestinationSubmissionInput = z.infer<typeof reviewDestinationSubmissionSchema>;

export const destinationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  district: keralaDistrictSchema.optional(),
  categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID format').optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type DestinationQueryInput = z.infer<typeof destinationQuerySchema>;

// ==============================================================================
// Day 12 – Geospatial Nearby Discovery & Media Management Schemas
// ==============================================================================

export const nearbyDestinationQuerySchema = z.object({
  latitude: z.coerce
    .number({ required_error: 'Latitude is required' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce
    .number({ required_error: 'Longitude is required' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  radiusKm: z.coerce
    .number({ invalid_type_error: 'Radius must be a number' })
    .positive('Radius must be greater than 0')
    .max(MAP_CONFIG.MAX_RADIUS_KM, `Radius cannot exceed ${MAP_CONFIG.MAX_RADIUS_KM} km`)
    .default(MAP_CONFIG.DEFAULT_RADIUS_KM),
  categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID format').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type NearbyDestinationQueryInput = z.infer<typeof nearbyDestinationQuerySchema>;

export const attachDestinationMediaSchema = z
  .object({
    storageKey: z.string().trim().min(3, 'Storage key must be at least 3 characters').max(255),
    url: z.string().url('Invalid URL format'),
    mimeType: z.enum(MEDIA_RULES.ALLOWED_MIME_TYPES, {
      errorMap: () => ({
        message: `Unsupported MIME type. Allowed types: ${MEDIA_RULES.ALLOWED_MIME_TYPES.join(', ')}`,
      }),
    }),
    fileSizeBytes: z
      .number()
      .int()
      .positive('File size must be positive')
      .max(
        MEDIA_RULES.MAX_FILE_SIZE_BYTES,
        `File size exceeds maximum allowed limit of ${MEDIA_RULES.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      ),
    dimensions: z
      .object({
        width: z.number().int().positive('Width must be positive'),
        height: z.number().int().positive('Height must be positive'),
      })
      .optional(),
    isPrimary: z.boolean().default(false),
    displayOrder: z.number().int().nonnegative('Display order cannot be negative').default(0),
  })
  .strict({ message: 'Unrecognized fields in media payload' });

export type AttachDestinationMediaInput = z.infer<typeof attachDestinationMediaSchema>;

export const updateDestinationMediaSchema = z
  .object({
    isPrimary: z.boolean().optional(),
    displayOrder: z.number().int().nonnegative('Display order cannot be negative').optional(),
  })
  .strict({ message: 'Unrecognized fields in media update' });

export type UpdateDestinationMediaInput = z.infer<typeof updateDestinationMediaSchema>;

// ==============================================================================
// Day 17 – Admin Dashboard Overview & User Management Schemas
// ==============================================================================

const adminObjectIdSchema = z
  .string({ required_error: 'User ID is required' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format');

export const adminUserIdParamSchema = z
  .object({
    userId: adminObjectIdSchema,
  })
  .strict({ message: 'Unrecognized route parameters' });

export type AdminUserIdParamInput = z.infer<typeof adminUserIdParamSchema>;

export const adminUsersQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: 'Page must be a positive integer' })
      .int('Page must be an integer')
      .min(1, 'Page must be at least 1')
      .max(ADMIN_USER_MANAGEMENT_RULES.MAX_PAGE, `Page cannot exceed ${ADMIN_USER_MANAGEMENT_RULES.MAX_PAGE}`)
      .default(ADMIN_USER_MANAGEMENT_RULES.DEFAULT_PAGE),
    limit: z.coerce
      .number({ invalid_type_error: 'Limit must be a positive integer' })
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(ADMIN_USER_MANAGEMENT_RULES.MAX_LIMIT, `Limit cannot exceed ${ADMIN_USER_MANAGEMENT_RULES.MAX_LIMIT}`)
      .default(ADMIN_USER_MANAGEMENT_RULES.DEFAULT_LIMIT),
    search: z
      .string({ invalid_type_error: 'Search query must be a string' })
      .trim()
      .min(1, 'Search query cannot be empty')
      .max(
        ADMIN_USER_MANAGEMENT_RULES.MAX_SEARCH_LENGTH,
        `Search query cannot exceed ${ADMIN_USER_MANAGEMENT_RULES.MAX_SEARCH_LENGTH} characters`,
      )
      .refine((val) => !val.includes('\0'), 'Search query contains invalid characters')
      .optional(),
    accountType: z
      .nativeEnum(ACCOUNT_TYPES, {
        errorMap: () => ({ message: 'Invalid accountType. Allowed values: TOURIST, BUSINESS, ADMIN' }),
      })
      .optional(),
    status: z
      .nativeEnum(ACCOUNT_STATUSES, {
        errorMap: () => ({ message: 'Invalid status. Allowed values: ACTIVE, SUSPENDED, DEACTIVATED' }),
      })
      .optional(),
    sortBy: z
      .enum(['createdAt'], {
        errorMap: () => ({ message: 'Invalid sortBy field. Allowed value: createdAt' }),
      })
      .default('createdAt'),
    sortOrder: z
      .enum(['asc', 'desc'], {
        errorMap: () => ({ message: 'Invalid sortOrder. Allowed values: asc, desc' }),
      })
      .default('desc'),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type AdminUsersQueryInput = z.infer<typeof adminUsersQuerySchema>;

export const suspendUserSchema = z
  .object({
    reason: z
      .string({ required_error: 'Suspension reason is required' })
      .trim()
      .min(
        ADMIN_USER_MANAGEMENT_RULES.MIN_REASON_LENGTH,
        `Suspension reason must be at least ${ADMIN_USER_MANAGEMENT_RULES.MIN_REASON_LENGTH} characters`,
      )
      .max(
        ADMIN_USER_MANAGEMENT_RULES.MAX_REASON_LENGTH,
        `Suspension reason cannot exceed ${ADMIN_USER_MANAGEMENT_RULES.MAX_REASON_LENGTH} characters`,
      ),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const reactivateUserSchema = z
  .object({
    reason: z
      .string({ invalid_type_error: 'Reactivation reason must be a string' })
      .trim()
      .min(
        ADMIN_USER_MANAGEMENT_RULES.MIN_REASON_LENGTH,
        `Reactivation reason must be at least ${ADMIN_USER_MANAGEMENT_RULES.MIN_REASON_LENGTH} characters`,
      )
      .max(
        ADMIN_USER_MANAGEMENT_RULES.MAX_REASON_LENGTH,
        `Reactivation reason cannot exceed ${ADMIN_USER_MANAGEMENT_RULES.MAX_REASON_LENGTH} characters`,
      )
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type ReactivateUserInput = z.infer<typeof reactivateUserSchema>;

// ==============================================================================
// Day 18 – Admin Content Moderation & User Reports Schemas
// ==============================================================================

const moderationObjectIdSchema = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label.toLowerCase()} format`);

const ALL_MODERATION_STATUSES = [
  ...new Set([
    ...Object.values(DESTINATION_SUBMISSION_STATUSES),
    ...Object.values(POST_STATUSES),
    ...Object.values(POST_COMMENT_STATUSES),
  ]),
] as [string, ...string[]];

const moderationDateFilterSchema = z
  .string()
  .trim()
  .refine((val) => !Number.isNaN(Date.parse(val)), 'Invalid ISO date filter')
  .optional();

export const submissionIdParamSchema = z
  .object({
    submissionId: moderationObjectIdSchema('Submission ID'),
  })
  .strict({ message: 'Unrecognized route parameters' });

export type SubmissionIdParamInput = z.infer<typeof submissionIdParamSchema>;

export const moderationPostIdParamSchema = z
  .object({
    postId: moderationObjectIdSchema('Post ID'),
  })
  .strict({ message: 'Unrecognized route parameters' });

export type ModerationPostIdParamInput = z.infer<typeof moderationPostIdParamSchema>;

export const moderationCommentIdParamSchema = z
  .object({
    commentId: moderationObjectIdSchema('Comment ID'),
  })
  .strict({ message: 'Unrecognized route parameters' });

export type ModerationCommentIdParamInput = z.infer<typeof moderationCommentIdParamSchema>;

export const reportIdParamSchema = z
  .object({
    reportId: moderationObjectIdSchema('Report ID'),
  })
  .strict({ message: 'Unrecognized route parameters' });

export type ReportIdParamInput = z.infer<typeof reportIdParamSchema>;

export const moderationQueueQuerySchema = z
  .object({
    contentType: z
      .nativeEnum(MODERATION_CONTENT_TYPES, {
        errorMap: () => ({ message: 'Invalid contentType. Allowed values: DESTINATION, POST, COMMENT' }),
      })
      .optional(),
    moderationStatus: z
      .enum(ALL_MODERATION_STATUSES, {
        errorMap: () => ({ message: 'Invalid moderationStatus filter value' }),
      })
      .optional(),
    submissionDate: moderationDateFilterSchema,
    submittedFrom: moderationDateFilterSchema,
    submittedTo: moderationDateFilterSchema,
    creatorAccountId: moderationObjectIdSchema('Creator account ID').optional(),
    district: keralaDistrictSchema.optional(),
    page: z.coerce
      .number({ invalid_type_error: 'Page must be a positive integer' })
      .int('Page must be an integer')
      .min(1, 'Page must be at least 1')
      .max(MODERATION_RULES.MAX_PAGE, `Page cannot exceed ${MODERATION_RULES.MAX_PAGE}`)
      .default(MODERATION_RULES.DEFAULT_PAGE),
    limit: z.coerce
      .number({ invalid_type_error: 'Limit must be a positive integer' })
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(MODERATION_RULES.MAX_LIMIT, `Limit cannot exceed ${MODERATION_RULES.MAX_LIMIT}`)
      .default(MODERATION_RULES.DEFAULT_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' })
  .superRefine((data, ctx) => {
    if (!data.contentType && !data.district && data.page * data.limit > MODERATION_RULES.MAX_UNIFIED_QUEUE_WINDOW) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['page'],
        message: 'Unified cross-collection queue window cannot exceed 500 items; specify contentType for deep pagination',
      });
    }
  });

export type ModerationQueueQueryInput = z.infer<typeof moderationQueueQuerySchema>;

export const moderationDestinationsQuerySchema = z
  .object({
    status: z
      .nativeEnum(DESTINATION_SUBMISSION_STATUSES, {
        errorMap: () => ({ message: 'Invalid status. Allowed values: PENDING, APPROVED, REJECTED' }),
      })
      .optional(),
    district: keralaDistrictSchema.optional(),
    creatorAccountId: moderationObjectIdSchema('Creator account ID').optional(),
    submittedFrom: moderationDateFilterSchema,
    submittedTo: moderationDateFilterSchema,
    page: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_PAGE).default(MODERATION_RULES.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_LIMIT).default(MODERATION_RULES.DEFAULT_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type ModerationDestinationsQueryInput = z.infer<typeof moderationDestinationsQuerySchema>;

export const approveDestinationModerationSchema = z
  .object({
    reviewNotes: z
      .string({ invalid_type_error: 'Review notes must be a string' })
      .trim()
      .min(MODERATION_RULES.MIN_REASON_LENGTH, `Review notes must be at least ${MODERATION_RULES.MIN_REASON_LENGTH} characters`)
      .max(MODERATION_RULES.MAX_NOTES_LENGTH, `Review notes cannot exceed ${MODERATION_RULES.MAX_NOTES_LENGTH} characters`)
      .optional(),
    district: keralaDistrictSchema.optional(),
    location: geoJsonPointSchema.optional(),
    address: z.string().trim().min(5).max(300).optional(),
    destinationId: moderationObjectIdSchema('Destination ID').optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type ApproveDestinationModerationInput = z.infer<typeof approveDestinationModerationSchema>;

export const rejectDestinationModerationSchema = z
  .object({
    reviewNotes: z
      .string({ required_error: 'Review notes are required when rejecting a destination submission' })
      .trim()
      .min(
        MODERATION_RULES.MIN_REASON_LENGTH,
        `Review notes must be at least ${MODERATION_RULES.MIN_REASON_LENGTH} characters`,
      )
      .max(
        MODERATION_RULES.MAX_NOTES_LENGTH,
        `Review notes cannot exceed ${MODERATION_RULES.MAX_NOTES_LENGTH} characters`,
      ),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type RejectDestinationModerationInput = z.infer<typeof rejectDestinationModerationSchema>;

export const moderationPostsQuerySchema = z
  .object({
    status: z
      .nativeEnum(POST_STATUSES, {
        errorMap: () => ({ message: 'Invalid status. Allowed values: PENDING, PUBLISHED, REJECTED, REMOVED' }),
      })
      .optional(),
    creatorAccountId: moderationObjectIdSchema('Creator account ID').optional(),
    submittedFrom: moderationDateFilterSchema,
    submittedTo: moderationDateFilterSchema,
    reportedOnly: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_PAGE).default(MODERATION_RULES.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_LIMIT).default(MODERATION_RULES.DEFAULT_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type ModerationPostsQueryInput = z.infer<typeof moderationPostsQuerySchema>;

export const approvePostModerationSchema = z
  .object({
    reason: z
      .string({ invalid_type_error: 'Moderation reason must be a string' })
      .trim()
      .min(MODERATION_RULES.MIN_REASON_LENGTH)
      .max(MODERATION_RULES.MAX_REASON_LENGTH)
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type ApprovePostModerationInput = z.infer<typeof approvePostModerationSchema>;

const requiredModerationReasonBodySchema = (label: string) =>
  z
    .object({
      reason: z
        .string({ required_error: `${label} reason is required` })
        .trim()
        .min(
          MODERATION_RULES.MIN_REASON_LENGTH,
          `${label} reason must be at least ${MODERATION_RULES.MIN_REASON_LENGTH} characters`,
        )
        .max(
          MODERATION_RULES.MAX_REASON_LENGTH,
          `${label} reason cannot exceed ${MODERATION_RULES.MAX_REASON_LENGTH} characters`,
        ),
    })
    .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export const rejectPostModerationSchema = requiredModerationReasonBodySchema('Rejection');
export type RejectPostModerationInput = z.infer<typeof rejectPostModerationSchema>;

export const removePostModerationSchema = requiredModerationReasonBodySchema('Removal');
export type RemovePostModerationInput = z.infer<typeof removePostModerationSchema>;

export const moderationCommentsQuerySchema = z
  .object({
    status: z
      .nativeEnum(POST_COMMENT_STATUSES, {
        errorMap: () => ({ message: 'Invalid status. Allowed values: ACTIVE, REMOVED' }),
      })
      .optional(),
    postId: moderationObjectIdSchema('Post ID').optional(),
    creatorAccountId: moderationObjectIdSchema('Creator account ID').optional(),
    reportedOnly: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_PAGE).default(MODERATION_RULES.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_LIMIT).default(MODERATION_RULES.DEFAULT_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type ModerationCommentsQueryInput = z.infer<typeof moderationCommentsQuerySchema>;

export const removeCommentModerationSchema = requiredModerationReasonBodySchema('Removal');
export type RemoveCommentModerationInput = z.infer<typeof removeCommentModerationSchema>;

export const restoreCommentModerationSchema = z
  .object({
    reason: z
      .string({ invalid_type_error: 'Restoration reason must be a string' })
      .trim()
      .min(MODERATION_RULES.MIN_REASON_LENGTH)
      .max(MODERATION_RULES.MAX_REASON_LENGTH)
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type RestoreCommentModerationInput = z.infer<typeof restoreCommentModerationSchema>;

export const createContentReportSchema = z
  .object({
    targetType: z.nativeEnum(REPORT_TARGET_TYPES, {
      errorMap: () => ({ message: 'Invalid targetType. Allowed values: DESTINATION, POST, COMMENT, ACCOUNT' }),
    }),
    targetId: moderationObjectIdSchema('Target ID'),
    reason: z.nativeEnum(REPORT_REASONS, {
      errorMap: () => ({ message: 'Invalid report reason' }),
    }),
    description: z
      .string({ invalid_type_error: 'Description must be a string' })
      .trim()
      .max(
        MODERATION_RULES.MAX_DESCRIPTION_LENGTH,
        `Description cannot exceed ${MODERATION_RULES.MAX_DESCRIPTION_LENGTH} characters`,
      )
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .superRefine((data, ctx) => {
    if (
      data.reason === REPORT_REASONS.OTHER &&
      (!data.description || data.description.trim().length < MODERATION_RULES.MIN_OTHER_DESCRIPTION_LENGTH)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description'],
        message: `A description of at least ${MODERATION_RULES.MIN_OTHER_DESCRIPTION_LENGTH} characters is required when reason is OTHER`,
      });
    }
  });

export type CreateContentReportInput = z.infer<typeof createContentReportSchema>;

export const touristReportsQuerySchema = z
  .object({
    status: z
      .nativeEnum(REPORT_STATUSES, {
        errorMap: () => ({ message: 'Invalid report status filter' }),
      })
      .optional(),
    targetType: z
      .nativeEnum(REPORT_TARGET_TYPES, {
        errorMap: () => ({ message: 'Invalid targetType filter' }),
      })
      .optional(),
    page: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_PAGE).default(MODERATION_RULES.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_LIMIT).default(MODERATION_RULES.DEFAULT_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type TouristReportsQueryInput = z.infer<typeof touristReportsQuerySchema>;

export const adminReportsQuerySchema = z
  .object({
    status: z
      .nativeEnum(REPORT_STATUSES, {
        errorMap: () => ({ message: 'Invalid report status filter' }),
      })
      .optional(),
    targetType: z
      .nativeEnum(REPORT_TARGET_TYPES, {
        errorMap: () => ({ message: 'Invalid targetType filter' }),
      })
      .optional(),
    reason: z
      .nativeEnum(REPORT_REASONS, {
        errorMap: () => ({ message: 'Invalid reason filter' }),
      })
      .optional(),
    page: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_PAGE).default(MODERATION_RULES.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MODERATION_RULES.MAX_LIMIT).default(MODERATION_RULES.DEFAULT_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type AdminReportsQueryInput = z.infer<typeof adminReportsQuerySchema>;

export const reviewReportSchema = z
  .object({
    status: z.enum(
      [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.RESOLVED, REPORT_STATUSES.DISMISSED],
      {
        errorMap: () => ({ message: 'Status must be UNDER_REVIEW, RESOLVED, or DISMISSED' }),
      },
    ),
    moderatorNotes: z
      .string({ invalid_type_error: 'Moderator notes must be a string' })
      .trim()
      .max(
        MODERATION_RULES.MAX_NOTES_LENGTH,
        `Moderator notes cannot exceed ${MODERATION_RULES.MAX_NOTES_LENGTH} characters`,
      )
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .superRefine((data, ctx) => {
    if (
      (data.status === REPORT_STATUSES.RESOLVED || data.status === REPORT_STATUSES.DISMISSED) &&
      (!data.moderatorNotes || data.moderatorNotes.trim().length < MODERATION_RULES.MIN_REASON_LENGTH)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['moderatorNotes'],
        message: `Moderator notes of at least ${MODERATION_RULES.MIN_REASON_LENGTH} characters are required when resolving or dismissing a report`,
      });
    }
  });

export type ReviewReportInput = z.infer<typeof reviewReportSchema>;


