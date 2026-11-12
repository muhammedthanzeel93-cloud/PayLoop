import {
  GeoPoint,
  KeralaDistrict,
  DestinationVerificationStatus,
  DestinationPublicationStatus,
  DestinationSubmissionStatus,
  NearbyDestinationDto,
  MediaDto,
} from '@kerala-tourism/shared-types';
import {
  CreateDestinationInput,
  UpdateDestinationInput,
  CreateDestinationCategoryInput,
  CreateDestinationSubmissionInput,
  ReviewDestinationSubmissionInput,
  DestinationQueryInput,
  NearbyDestinationQueryInput,
  AttachDestinationMediaInput,
  UpdateDestinationMediaInput,
} from '@kerala-tourism/validation';

export type {
  CreateDestinationInput,
  UpdateDestinationInput,
  CreateDestinationCategoryInput,
  CreateDestinationSubmissionInput,
  ReviewDestinationSubmissionInput,
  DestinationQueryInput,
  NearbyDestinationQueryInput,
  AttachDestinationMediaInput,
  UpdateDestinationMediaInput,
  NearbyDestinationDto,
  MediaDto,
};

export interface SafeDestinationCategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
}

export interface SafeDestinationDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  categoryIds: string[];
  location: GeoPoint;
  address: string;
  district: KeralaDistrict;
  locality?: string;
  images: string[];
  facilities: string[];
  bestTimeToVisit?: string;
  entryFee: {
    amount: number;
    currency: string;
    isFree: boolean;
  };
  verificationStatus: DestinationVerificationStatus;
  publicationStatus: DestinationPublicationStatus;
  publishedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafeDestinationSubmissionDto {
  id: string;
  submittedBy: string;
  name: string;
  description: string;
  categoryIds: string[];
  submittedLocation: GeoPoint;
  submittedAddress: string;
  imageMediaIds: string[];
  submissionStatus: DestinationSubmissionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  destinationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
