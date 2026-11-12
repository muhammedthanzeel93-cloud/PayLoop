import {
  USER_ROLES,
  BOOKING_MODES,
  BOOKING_STATUSES,
  DESTINATION_STATUSES,
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  BUSINESS_TYPES,
  VERIFICATION_STATUSES,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  BUSINESS_DOCUMENT_TYPES,
  PREFERRED_LANGUAGES,
  AUTH_TOKEN_TYPES,
  SESSION_REVOCATION_REASONS,
  KERALA_DISTRICTS,
  DESTINATION_VERIFICATION_STATUSES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_SUBMISSION_STATUSES,
  MEDIA_RULES,
  POST_VISIBILITIES,
  POST_STATUSES,
  POST_COMMENT_STATUSES,
} from '@kerala-tourism/constants';

// Role Types
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type BookingMode = (typeof BOOKING_MODES)[keyof typeof BOOKING_MODES];
export type BookingStatus = (typeof BOOKING_STATUSES)[keyof typeof BOOKING_STATUSES];
export type DestinationStatus = (typeof DESTINATION_STATUSES)[keyof typeof DESTINATION_STATUSES];
export type KeralaDistrict = (typeof KERALA_DISTRICTS)[number];
export type DestinationVerificationStatus = (typeof DESTINATION_VERIFICATION_STATUSES)[keyof typeof DESTINATION_VERIFICATION_STATUSES];
export type DestinationPublicationStatus = (typeof DESTINATION_PUBLICATION_STATUSES)[keyof typeof DESTINATION_PUBLICATION_STATUSES];
export type DestinationSubmissionStatus = (typeof DESTINATION_SUBMISSION_STATUSES)[keyof typeof DESTINATION_SUBMISSION_STATUSES];
export type MediaMimeType = (typeof MEDIA_RULES.ALLOWED_MIME_TYPES)[number];
export type PostVisibility = (typeof POST_VISIBILITIES)[keyof typeof POST_VISIBILITIES];
export type PostStatus = (typeof POST_STATUSES)[keyof typeof POST_STATUSES];
export type PostCommentStatus = (typeof POST_COMMENT_STATUSES)[keyof typeof POST_COMMENT_STATUSES];

// Core Account & Profile Types
export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES];
export type BusinessType = (typeof BUSINESS_TYPES)[keyof typeof BUSINESS_TYPES];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[keyof typeof VERIFICATION_STATUSES];
export type AdminLevel = (typeof ADMIN_LEVELS)[keyof typeof ADMIN_LEVELS];
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];
export type BusinessDocumentType = (typeof BUSINESS_DOCUMENT_TYPES)[keyof typeof BUSINESS_DOCUMENT_TYPES];
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[keyof typeof PREFERRED_LANGUAGES];
export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[keyof typeof AUTH_TOKEN_TYPES];
export type SessionRevocationReason = (typeof SESSION_REVOCATION_REASONS)[keyof typeof SESSION_REVOCATION_REASONS];

// Authenticated Principal & Token Types
export interface IAccessTokenClaims {
  sub: string;
  email: string;
  accountType: AccountType;
  status: AccountStatus;
  tokenType: 'access';
  jti: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

export interface AuthenticatedPrincipal {
  id: string;
  email: string;
  accountType: AccountType;
  status: AccountStatus;
}

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
export interface DestinationEntryFee {
  amount: number;
  currency: string;
  isFree: boolean;
}

export interface Destination extends BaseEntity {
  name: string;
  title?: string;
  slug: string;
  description: string;
  shortDescription?: string;
  categoryIds?: string[];
  category?: 'BACKWATERS' | 'HILL_STATION' | 'BEACH' | 'HERITAGE' | 'FOREST' | 'CULTURE';
  location: GeoPoint;
  address: string;
  district: string;
  locality?: string;
  images: string[];
  facilities?: string[];
  bestTimeToVisit?: string;
  entryFee?: DestinationEntryFee;
  verificationStatus: DestinationVerificationStatus;
  publicationStatus: DestinationPublicationStatus;
  status?: DestinationStatus;
  createdBy: string;
  submittedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  publishedAt?: string;
  badges?: string[];
  averageRating?: number;
  reviewCount?: number;
}

// Destination Category Entity
export interface DestinationCategory extends BaseEntity {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
}

// Destination Submission Entity
export interface DestinationSubmission extends BaseEntity {
  submittedBy: string;
  name: string;
  description: string;
  categoryIds?: string[];
  submittedLocation: GeoPoint;
  submittedAddress: string;
  imageMediaIds: string[];
  submissionStatus: DestinationSubmissionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  destinationId?: string;
}

// Nearby Destination with Distance
export interface NearbyDestinationDto extends Omit<Destination, 'createdBy'> {
  createdBy?: string;
  distanceKm: number;
  distanceMeters?: number;
}

// Media Entity
export interface MediaDimensions {
  width: number;
  height: number;
}

export interface MediaDto extends BaseEntity {
  uploaderAccountId: string;
  destinationId?: string;
  storageKey: string;
  url: string;
  mimeType: MediaMimeType;
  fileSizeBytes: number;
  dimensions?: MediaDimensions;
  isPrimary: boolean;
  displayOrder: number;
  isModerated: boolean;
}

// Map Provider & Marker Types
export type MapProviderType = 'google' | 'mapbox' | 'osm';

export interface MapMarkerDto {
  id: string;
  name: string;
  slug: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  district: string;
  locality?: string;
  categoryIds?: string[];
  primaryImage?: string;
  distanceKm?: number;
  markerType: 'destination' | 'cluster';
}

export interface MapConfigDto {
  provider: MapProviderType;
  defaultCenter: {
    latitude: number;
    longitude: number;
  };
  defaultZoom: number;
  bounds: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  tileLayerUrl?: string;
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

// ==============================================================================
// Core Account, Profile & Session Domain Entities
// ==============================================================================

export interface IAccount {
  id: string;
  email: string;
  passwordHash?: string;
  accountType: AccountType;
  status: AccountStatus;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITouristProfile {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  bio?: string;
  phoneNumber?: string;
  preferredLanguage: PreferredLanguage;
  followersCount?: number;
  followingCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBusinessAddress {
  street: string;
  city: string;
  district: string;
  postalCode: string;
  state: string;
}

export interface IBusinessDocument {
  documentType: BusinessDocumentType;
  storageKey: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
}

export interface IBusinessProfile {
  id: string;
  accountId: string;
  businessName: string;
  businessType: BusinessType;
  businessAddress?: IBusinessAddress;
  contactNumber: string;
  verificationStatus: VerificationStatus;
  documents: IBusinessDocument[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdminProfile {
  id: string;
  accountId: string;
  displayName: string;
  permissions: AdminPermission[];
  adminLevel: AdminLevel;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceInformation {
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
}

export interface ISession {
  id: string;
  accountId: string;
  refreshTokenHash: string;
  familyId: string;
  replacedByTokenHash?: string | null;
  lastUsedAt?: Date | null;
  deviceInformation?: IDeviceInformation;
  expiresAt: Date;
  revokedAt?: Date | null;
  revocationReason?: SessionRevocationReason | string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ==============================================================================
// Social Posts & Community Feed Domain DTOs (Day 13)
// ==============================================================================

export interface PostAuthorDto {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  profileImage?: string;
}

export interface PostMediaDto {
  id: string;
  url: string;
  mimeType: MediaMimeType;
  fileSizeBytes: number;
  dimensions?: MediaDimensions;
}

export interface PostDestinationSummaryDto {
  id: string;
  name: string;
  slug: string;
  district: string;
  locality?: string;
  primaryImage?: string;
}

export interface PostDto extends BaseEntity {
  authorId: string;
  author?: PostAuthorDto;
  content: string;
  mediaIds: string[];
  media: PostMediaDto[];
  destinationId?: string;
  destination?: PostDestinationSummaryDto;
  visibility: PostVisibility;
  status: PostStatus;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  publishedAt?: string | null;
}

export interface PostLikeSummaryDto {
  id: string;
  accountId: string;
  postId: string;
  createdAt: string;
}

export interface PostLikeResponseDto {
  postId: string;
  liked: boolean;
  likesCount: number;
  like?: PostLikeSummaryDto;
}

export interface PostCommentDto extends BaseEntity {
  postId: string;
  authorId: string;
  author?: PostAuthorDto;
  content: string;
  status: PostCommentStatus;
}

export interface PostRepostSummaryDto {
  id: string;
  accountId: string;
  originalPostId: string;
  createdAt: string;
}

export interface PostRepostResponseDto {
  postId: string;
  reposted: boolean;
  repostsCount: number;
  repost?: PostRepostSummaryDto;
}

// ==============================================================================
// Follow & Unfollow System Domain DTOs (Day 15)
// ==============================================================================

export interface FollowRelationshipSummaryDto {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface FollowMutationResponseDto {
  targetUserId: string;
  following: boolean;
  followersCount: number;
  followingCount: number;
  follow?: FollowRelationshipSummaryDto;
}

export interface FollowUserSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  profileImage?: string;
  bio?: string;
  followedAt: string;
}

// ==============================================================================
// Following Feed Cursor Pagination DTOs (Day 16)
// ==============================================================================

export interface CursorPaginationMeta {
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}
