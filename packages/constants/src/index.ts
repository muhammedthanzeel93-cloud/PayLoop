/**
 * Kerala Tourism Design System & Operational Constants
 */

export const THEME_COLORS = {
  FOREST_GREEN: '#145C43',
  NATURE_GREEN: '#78A878',
  WARM_CREAM: '#F8F7F1',
  SUNSET_ORANGE: '#E99A54',
  CHARCOAL: '#202A25',
  WHITE: '#FFFFFF',
  MUTED_BORDER: '#E2E8F0',
  ERROR_RED: '#DC2626',
  SUCCESS_GREEN: '#16A34A',
  WARNING_AMBER: '#D97706',
} as const;

export const TYPOGRAPHY = {
  FONT_FAMILY: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

export const BOOKING_RULES = {
  // Transit hourly slots allowed
  HOURLY_SLOT_DURATIONS_HOURS: [3, 6, 12] as const,
  // Mandatory turnover / housekeeping buffer duration in minutes
  TURNOVER_BUFFER_MINUTES: 60,
  // Standard daily check-in time (24h format)
  DAILY_CHECK_IN_TIME: '12:00',
  // Standard daily check-out time (24h format)
  DAILY_CHECK_OUT_TIME: '11:00',
  // Maximum advance booking days
  MAX_ADVANCE_BOOKING_DAYS: 90,
  // Request-based booking merchant response SLA in seconds (15 minutes)
  REQUEST_RESPONSE_SLA_SECONDS: 900,
  // Instant booking grace cancellation period in minutes
  FREE_CANCELLATION_MINUTES: 120,
} as const;

export const GEOSPATIAL_RULES = {
  // Coordinate deduplication radius in meters
  PROXIMITY_DEDUPLICATION_RADIUS_METERS: 500,
  // Minimum clearance buffer from Core Tiger Reserves & National Parks
  PROTECTED_FOREST_BUFFER_METERS: 1000,
  // Kerala bounding box for coordinate sanity validation
  KERALA_BOUNDS: {
    MIN_LATITUDE: 8.18,
    MAX_LATITUDE: 12.85,
    MIN_LONGITUDE: 74.86,
    MAX_LONGITUDE: 77.42,
  },
} as const;

export const USER_ROLES = {
  TOURIST: 'TOURIST',
  AGENCY: 'AGENCY',
  HOTEL: 'HOTEL',
  INDEPENDENT_HOST: 'INDEPENDENT_HOST',
  ADMIN: 'ADMIN',
} as const;

export const BOOKING_MODES = {
  HOURLY: 'HOURLY',
  DAILY: 'DAILY',
} as const;

export const BOOKING_STATUSES = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;

export const DESTINATION_STATUSES = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  REVISIONS_REQUESTED: 'REVISIONS_REQUESTED',
  REJECTED: 'REJECTED',
} as const;

export const ACCOUNT_TYPES = {
  TOURIST: 'TOURIST',
  BUSINESS: 'BUSINESS',
  ADMIN: 'ADMIN',
} as const;

export const ACCOUNT_STATUSES = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
} as const;

export const BUSINESS_TYPES = {
  TRAVEL_AGENCY: 'TRAVEL_AGENCY',
  HOTEL: 'HOTEL',
  RESORT: 'RESORT',
  HOMESTAY: 'HOMESTAY',
  RESTAURANT: 'RESTAURANT',
  OTHER: 'OTHER',
} as const;

export const VERIFICATION_STATUSES = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;

export const ADMIN_LEVELS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISTRICT_OFFICER: 'DISTRICT_OFFICER',
  MODERATOR: 'MODERATOR',
} as const;

export const ADMIN_PERMISSIONS = {
  VERIFY_DESTINATIONS: 'VERIFY_DESTINATIONS',
  MANAGE_USERS: 'MANAGE_USERS',
  APPROVE_BUSINESSES: 'APPROVE_BUSINESSES',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  MANAGE_SYSTEM_SETTINGS: 'MANAGE_SYSTEM_SETTINGS',
  HANDLE_DISPUTES: 'HANDLE_DISPUTES',
  SUSPEND_USERS: 'SUSPEND_USERS',
  VERIFY_BUSINESSES: 'VERIFY_BUSINESSES',
  REJECT_BUSINESSES: 'REJECT_BUSINESSES',
  MANAGE_DESTINATIONS: 'MANAGE_DESTINATIONS',
  MODERATE_POSTS: 'MODERATE_POSTS',
  MANAGE_BOOKINGS: 'MANAGE_BOOKINGS',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
} as const;

export const BUSINESS_DOCUMENT_TYPES = {
  GST_CERTIFICATE: 'GST_CERTIFICATE',
  TOURISM_LICENSE: 'TOURISM_LICENSE',
  PAN_CARD: 'PAN_CARD',
  TRADE_LICENSE: 'TRADE_LICENSE',
  OTHER: 'OTHER',
} as const;

export const PREFERRED_LANGUAGES = {
  EN: 'EN',
  ML: 'ML',
} as const;

export const API_ENDPOINTS = {
  V1: '/api/v1',
  HEALTH: '/api/v1/health',
} as const;

export const AUTH_TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

export const SESSION_REVOCATION_REASONS = {
  LOGOUT: 'LOGOUT',
  ROTATED: 'ROTATED',
  REUSE_DETECTED: 'REUSE_DETECTED',
  LOGOUT_ALL: 'LOGOUT_ALL',
  EXPIRED: 'EXPIRED',
} as const;

export const KERALA_DISTRICTS = [
  'Alappuzha',
  'Ernakulam',
  'Idukki',
  'Kannur',
  'Kasaragod',
  'Kollam',
  'Kottayam',
  'Kozhikode',
  'Malappuram',
  'Palakkad',
  'Pathanamthitta',
  'Thiruvananthapuram',
  'Thrissur',
  'Wayanad',
] as const;

export const DESTINATION_VERIFICATION_STATUSES = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;

export const DESTINATION_PUBLICATION_STATUSES = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const DESTINATION_SUBMISSION_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export const MEDIA_RULES = {
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
  ] as const,
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_IMAGES_PER_DESTINATION: 20,
} as const;

export const MAP_CONFIG = {
  DEFAULT_PROVIDER: 'osm',
  DEFAULT_CENTER: {
    latitude: 10.8505,
    longitude: 76.2711,
  },
  DEFAULT_ZOOM: 8,
  MAX_RADIUS_KM: 100,
  DEFAULT_RADIUS_KM: 25,
} as const;

export const POST_VISIBILITIES = {
  PUBLIC: 'PUBLIC',
  FOLLOWERS: 'FOLLOWERS',
  PRIVATE: 'PRIVATE',
} as const;

export const POST_STATUSES = {
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  REMOVED: 'REMOVED',
} as const;

export const POST_RULES = {
  MIN_CONTENT_LENGTH: 1,
  MAX_CONTENT_LENGTH: 2000,
  MAX_MEDIA_PER_POST: 10,
  DEFAULT_FEED_LIMIT: 10,
  DEFAULT_FOLLOWING_FEED_LIMIT: 20,
  MAX_FEED_LIMIT: 50,
  MAX_CURSOR_LENGTH: 256,
} as const;

export const POST_COMMENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  REMOVED: 'REMOVED',
} as const;

export const POST_ENGAGEMENT_RULES = {
  MIN_COMMENT_LENGTH: 1,
  MAX_COMMENT_LENGTH: 1000,
  DEFAULT_COMMENTS_LIMIT: 20,
  MAX_COMMENTS_LIMIT: 50,
} as const;

export const FOLLOW_RULES = {
  DEFAULT_LIST_LIMIT: 20,
  MAX_LIST_LIMIT: 50,
} as const;

