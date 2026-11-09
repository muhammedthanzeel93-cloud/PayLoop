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

export const API_ENDPOINTS = {
  V1: '/api/v1',
  HEALTH: '/api/v1/health',
} as const;
