import {
  USER_ROLES,
  BOOKING_MODES,
  BOOKING_STATUSES,
  DESTINATION_STATUSES,
} from '@kerala-tourism/constants';

// Role Types
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type BookingMode = (typeof BOOKING_MODES)[keyof typeof BOOKING_MODES];
export type BookingStatus = (typeof BOOKING_STATUSES)[keyof typeof BOOKING_STATUSES];
export type DestinationStatus = (typeof DESTINATION_STATUSES)[keyof typeof DESTINATION_STATUSES];

// Base Entity Interface
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// User Entity
export interface User extends BaseEntity {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatarUrl?: string;
  isVerified: boolean;
  reputationScore?: number;
}

// Geospatial
export interface Coordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude] per GeoJSON spec
}

// Destination Entity
export interface Destination extends BaseEntity {
  title: string;
  slug: string;
  description: string;
  district: string;
  category: 'BACKWATERS' | 'HILL_STATION' | 'BEACH' | 'HERITAGE' | 'FOREST' | 'CULTURE';
  location: GeoPoint;
  address: string;
  images: string[];
  submittedBy: string; // User ID
  status: DestinationStatus;
  verifiedBy?: string; // Admin User ID
  verifiedAt?: string;
  badges: string[];
  averageRating: number;
  reviewCount: number;
}

// Room & Stay Inventory
export interface RoomInventory extends BaseEntity {
  propertyId: string;
  roomName: string;
  roomType: 'DELUXE_SUITE' | 'HERITAGE_VILLA' | 'ECO_COTTAGE' | 'TRANSIT_POD';
  supportsHourly: boolean;
  supportsDaily: boolean;
  baseHourlyRate?: number;
  baseDailyRate: number;
  capacity: number;
  amenities: string[];
  turnoverBufferMinutes: number;
}

// Booking Entity
export interface Booking extends BaseEntity {
  bookingNumber: string;
  touristId: string;
  propertyId: string;
  roomId: string;
  mode: BookingMode;
  checkInTime: string;
  checkOutTime: string;
  durationHours?: number;
  guestsCount: number;
  totalAmount: number;
  status: BookingStatus;
  qrPassCode?: string;
  specialRequests?: string;
}

// API Health Response (Safe & Secret-Free)
export interface HealthDatabaseStatus {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  name?: string;
  host?: string;
  readyState: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  database: HealthDatabaseStatus;
  services: {
    api: 'up' | 'down';
  };
}

// Standard API Response Wrappers
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}
