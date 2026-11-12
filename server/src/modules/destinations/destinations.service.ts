import { Types } from 'mongoose';
import {
  DestinationsRepository,
  destinationsRepository,
} from './destinations.repository';
import {
  IDestinationDocument,
  IDestinationCategoryDocument,
  IDestinationSubmissionDocument,
} from '../../shared/models';
import {
  SafeDestinationDto,
  SafeDestinationCategoryDto,
  SafeDestinationSubmissionDto,
  PaginatedResult,
  CreateDestinationInput,
  UpdateDestinationInput,
  CreateDestinationSubmissionInput,
  ReviewDestinationSubmissionInput,
  DestinationQueryInput,
  NearbyDestinationQueryInput,
  NearbyDestinationDto,
  AttachDestinationMediaInput,
  UpdateDestinationMediaInput,
  MediaDto,
} from './destinations.types';
import {
  AppError,
  NotFoundError,
  ConflictError,
} from '../../shared/errors/AppError';
import { assertOwnership } from '../../shared/security/ownership';
import {
  DESTINATION_VERIFICATION_STATUSES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_SUBMISSION_STATUSES,
} from '@kerala-tourism/constants';
import { AuthenticatedPrincipal } from '@kerala-tourism/shared-types';
import { mediaService } from '../media';

export class DestinationsService {
  constructor(private repo: DestinationsRepository = destinationsRepository) {}

  public get repository(): DestinationsRepository {
    return this.repo;
  }

  public setRepository(newRepo: DestinationsRepository): void {
    this.repo = newRepo;
  }

  // ==============================================================================
  // PUBLIC EXPLORATION METHODS
  // ==============================================================================

  /**
   * List public destinations (only VERIFIED & PUBLISHED) with pagination, filters and sorting
   */
  public async listPublishedDestinations(
    query: DestinationQueryInput,
  ): Promise<PaginatedResult<SafeDestinationDto>> {
    const { items, total } = await this.repo.findPublishedDestinations(query);
    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      items: items.map((dest) => this.mapDestinationToDto(dest)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Find nearby published & verified destinations using geospatial radius ($geoNear)
   */
  public async findNearbyDestinations(
    query: NearbyDestinationQueryInput,
  ): Promise<PaginatedResult<NearbyDestinationDto>> {
    const { items, total } = await this.repo.findNearbyDestinations(query);
    const limit = query.limit || 10;
    const page = query.page || 1;
    const totalPages = Math.ceil(total / limit) || (total > 0 ? 1 : 0);

    return {
      items: items.map((dest) => this.mapNearbyDestinationToDto(dest)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get single published & verified destination by slug
   */
  public async getPublishedDestinationBySlug(slug: string): Promise<SafeDestinationDto> {
    const destination = await this.repo.findPublishedBySlug(slug);
    if (!destination) {
      throw new NotFoundError('Destination not found', 'DESTINATION_NOT_FOUND');
    }
    return this.mapDestinationToDto(destination);
  }

  /**
   * Search published & verified destinations by text query
   */
  public async searchPublishedDestinations(
    searchTerm?: string,
    page = 1,
    limit = 10,
  ): Promise<PaginatedResult<SafeDestinationDto>> {
    const sanitizedSearch = searchTerm?.trim() || '';
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safePage = Math.max(1, page);

    const queryInput: DestinationQueryInput = {
      page: safePage,
      limit: safeLimit,
      search: sanitizedSearch,
      sortBy: 'name',
      sortOrder: 'asc',
    };

    return this.listPublishedDestinations(queryInput);
  }

  /**
   * List active destination categories for public browsing
   */
  public async listActiveCategories(): Promise<SafeDestinationCategoryDto[]> {
    const categories = await this.repo.listActiveCategories();
    return categories.map((cat) => this.mapCategoryToDto(cat));
  }

  // ==============================================================================
  // TOURIST SUBMISSIONS METHODS
  // ==============================================================================

  /**
   * Submit community destination suggestion by authenticated tourist
   */
  public async submitByTourist(
    touristAccountId: string,
    input: CreateDestinationSubmissionInput,
  ): Promise<SafeDestinationSubmissionDto> {
    const submissionData: Partial<IDestinationSubmissionDocument> = {
      submittedBy: new Types.ObjectId(touristAccountId),
      name: input.name.trim(),
      description: input.description.trim(),
      categoryIds: (input.categoryIds || []).map((id) => new Types.ObjectId(id)),
      submittedLocation: input.submittedLocation,
      submittedAddress: input.submittedAddress.trim(),
      imageMediaIds: input.imageMediaIds,
      submissionStatus: DESTINATION_SUBMISSION_STATUSES.PENDING,
    };

    const created = await this.repo.createSubmission(submissionData);
    return this.mapSubmissionToDto(created);
  }

  /**
   * List submissions made by authenticated tourist
   */
  public async getTouristSubmissions(
    touristAccountId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<SafeDestinationSubmissionDto>> {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safePage = Math.max(1, page);

    const { items, total } = await this.repo.findSubmissionsByTourist(
      touristAccountId,
      safePage,
      safeLimit,
    );
    const totalPages = Math.ceil(total / safeLimit) || 1;

    return {
      items: items.map((sub) => this.mapSubmissionToDto(sub)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get submission detail for authenticated tourist with IDOR concealment (404)
   */
  public async getTouristSubmissionById(
    touristAccountId: string,
    submissionId: string,
  ): Promise<SafeDestinationSubmissionDto> {
    const submission = await this.repo.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundError('Destination submission not found', 'RESOURCE_NOT_FOUND');
    }

    // Conceal existence with 404 if the submission belongs to someone else
    assertOwnership(submission.submittedBy, touristAccountId, {
      resourceName: 'Destination submission',
      concealWithNotFound: true,
    });

    return this.mapSubmissionToDto(submission);
  }

  // ==============================================================================
  // ADMIN MANAGEMENT METHODS
  // ==============================================================================

  /**
   * Admin creates an official destination (VERIFIED, DRAFT)
   */
  public async adminCreateDestination(
    adminId: string,
    input: CreateDestinationInput,
  ): Promise<SafeDestinationDto> {
    const slug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existing = await this.repo.findDestinationBySlug(slug);
    if (existing) {
      throw new ConflictError(
        `A destination with slug '${slug}' already exists`,
        'DUPLICATE_SLUG',
      );
    }

    const destinationData: Partial<IDestinationDocument> = {
      name: input.name.trim(),
      slug,
      description: input.description.trim(),
      shortDescription: input.shortDescription?.trim(),
      categoryIds: (input.categoryIds || []).map((id) => new Types.ObjectId(id)),
      location: input.location,
      address: input.address.trim(),
      district: input.district,
      locality: input.locality?.trim(),
      images: input.images || [],
      facilities: input.facilities || [],
      bestTimeToVisit: input.bestTimeToVisit?.trim(),
      entryFee: input.entryFee || {
        amount: 0,
        currency: 'INR',
        isFree: true,
      },
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
      createdBy: new Types.ObjectId(adminId),
      verifiedBy: new Types.ObjectId(adminId),
    };

    const created = await this.repo.createDestination(destinationData);
    return this.mapDestinationToDto(created);
  }

  /**
   * Admin updates an existing destination
   */
  public async adminUpdateDestination(
    destinationId: string,
    input: UpdateDestinationInput,
  ): Promise<SafeDestinationDto> {
    const destination = await this.repo.findDestinationById(destinationId);
    if (!destination) {
      throw new NotFoundError('Destination not found', 'DESTINATION_NOT_FOUND');
    }

    const updates: Partial<IDestinationDocument> = {};
    if (input.name) {
      updates.name = input.name.trim();
      updates.slug = input.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }
    if (input.description) updates.description = input.description.trim();
    if (input.shortDescription !== undefined) updates.shortDescription = input.shortDescription?.trim();
    if (input.categoryIds) {
      updates.categoryIds = input.categoryIds.map((id) => new Types.ObjectId(id));
    }
    if (input.location) updates.location = input.location;
    if (input.address) updates.address = input.address.trim();
    if (input.district) updates.district = input.district;
    if (input.locality !== undefined) updates.locality = input.locality?.trim();
    if (input.images) updates.images = input.images;
    if (input.facilities) updates.facilities = input.facilities;
    if (input.bestTimeToVisit !== undefined) updates.bestTimeToVisit = input.bestTimeToVisit?.trim();
    if (input.entryFee) updates.entryFee = input.entryFee;

    const updated = await this.repo.updateDestination(destinationId, updates);
    return this.mapDestinationToDto(updated!);
  }

  /**
   * Admin publishes destination. Rejects unverified destinations.
   */
  public async adminPublishDestination(destinationId: string): Promise<SafeDestinationDto> {
    const destination = await this.repo.findDestinationById(destinationId);
    if (!destination) {
      throw new NotFoundError('Destination not found', 'DESTINATION_NOT_FOUND');
    }

    if (destination.verificationStatus !== DESTINATION_VERIFICATION_STATUSES.VERIFIED) {
      throw new AppError(
        'Cannot publish an unverified destination. Destination must be VERIFIED prior to publication.',
        400,
        'CANNOT_PUBLISH_UNVERIFIED_DESTINATION',
      );
    }

    const updated = await this.repo.updateDestination(destinationId, {
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
      publishedAt: new Date(),
    });

    return this.mapDestinationToDto(updated!);
  }

  /**
   * Admin archives destination
   */
  public async adminArchiveDestination(destinationId: string): Promise<SafeDestinationDto> {
    const destination = await this.repo.findDestinationById(destinationId);
    if (!destination) {
      throw new NotFoundError('Destination not found', 'DESTINATION_NOT_FOUND');
    }

    const updated = await this.repo.updateDestination(destinationId, {
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.ARCHIVED,
    });

    return this.mapDestinationToDto(updated!);
  }

  /**
   * Admin lists community submissions
   */
  public async adminListSubmissions(filter: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<SafeDestinationSubmissionDto>> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(Math.max(1, filter.limit || 20), 50);

    const { items, total } = await this.repo.listSubmissions({
      status: filter.status,
      page,
      limit,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((sub) => this.mapSubmissionToDto(sub)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Admin reviews submission (APPROVE creates official destination, REJECT records notes).
   * APPROVE is idempotent: repeated calls return the existing destination.
   */
  public async adminReviewSubmission(
    adminId: string,
    submissionId: string,
    input: ReviewDestinationSubmissionInput,
  ): Promise<{
    submission: SafeDestinationSubmissionDto;
    destination: SafeDestinationDto | null;
  }> {
    const submission = await this.repo.findSubmissionById(submissionId);
    if (!submission) {
      throw new NotFoundError('Destination submission not found', 'SUBMISSION_NOT_FOUND');
    }

    if (input.action === 'APPROVE') {
      // Idempotency: If already approved and destination exists, return without creating duplicate
      if (
        submission.submissionStatus === DESTINATION_SUBMISSION_STATUSES.APPROVED &&
        submission.destinationId
      ) {
        const existingDestination = await this.repo.findDestinationById(submission.destinationId);
        return {
          submission: this.mapSubmissionToDto(submission),
          destination: existingDestination ? this.mapDestinationToDto(existingDestination) : null,
        };
      }

      // Generate unique slug
      let baseSlug = submission.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const existingSlugDest = await this.repo.findDestinationBySlug(baseSlug);
      if (existingSlugDest) {
        baseSlug = `${baseSlug}-${Date.now().toString(36)}`;
      }

      // Create official Destination
      const destination = await this.repo.createDestination({
        name: submission.name,
        slug: baseSlug,
        description: submission.description,
        categoryIds: submission.categoryIds || [],
        location: submission.submittedLocation,
        address: submission.submittedAddress,
        district: 'Idukki', // Default fallback district if not specified
        images: submission.imageMediaIds || [],
        verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
        publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
        createdBy: submission.submittedBy,
        verifiedBy: new Types.ObjectId(adminId),
      });

      // Update submission status to APPROVED
      const updatedSubmission = await this.repo.updateSubmission(submissionId, {
        submissionStatus: DESTINATION_SUBMISSION_STATUSES.APPROVED,
        reviewedBy: new Types.ObjectId(adminId),
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes?.trim(),
        destinationId: destination._id,
      });

      return {
        submission: this.mapSubmissionToDto(updatedSubmission!),
        destination: this.mapDestinationToDto(destination),
      };
    } else {
      // REJECT action
      const updatedSubmission = await this.repo.updateSubmission(submissionId, {
        submissionStatus: DESTINATION_SUBMISSION_STATUSES.REJECTED,
        reviewedBy: new Types.ObjectId(adminId),
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes?.trim(),
      });

      return {
        submission: this.mapSubmissionToDto(updatedSubmission!),
        destination: null,
      };
    }
  }

  // ==============================================================================
  // DTO MAPPERS
  // ==============================================================================

  public mapDestinationToDto(doc: IDestinationDocument | Record<string, unknown>): SafeDestinationDto {
    const rawDoc = doc as Record<string, unknown>;
    const publishedAtStr = rawDoc.publishedAt
      ? rawDoc.publishedAt instanceof Date
        ? rawDoc.publishedAt.toISOString()
        : new Date(rawDoc.publishedAt as string | number).toISOString()
      : undefined;
    const createdAtStr = rawDoc.createdAt
      ? rawDoc.createdAt instanceof Date
        ? rawDoc.createdAt.toISOString()
        : new Date(rawDoc.createdAt as string | number).toISOString()
      : new Date().toISOString();
    const updatedAtStr = rawDoc.updatedAt
      ? rawDoc.updatedAt instanceof Date
        ? rawDoc.updatedAt.toISOString()
        : new Date(rawDoc.updatedAt as string | number).toISOString()
      : new Date().toISOString();

    return {
      id: ((rawDoc._id || rawDoc.id) as { toString(): string }).toString(),
      name: rawDoc.name as string,
      slug: rawDoc.slug as string,
      description: rawDoc.description as string,
      shortDescription: rawDoc.shortDescription as string | undefined,
      categoryIds: ((rawDoc.categoryIds as unknown[]) || []).map((id) =>
        (id as { toString(): string }).toString(),
      ),
      location: rawDoc.location as SafeDestinationDto['location'],
      address: rawDoc.address as string,
      district: rawDoc.district as SafeDestinationDto['district'],
      locality: rawDoc.locality as string | undefined,
      images: (rawDoc.images as string[]) || [],
      facilities: (rawDoc.facilities as string[]) || [],
      bestTimeToVisit: rawDoc.bestTimeToVisit as string | undefined,
      entryFee: (rawDoc.entryFee as SafeDestinationDto['entryFee']) || {
        amount: 0,
        currency: 'INR',
        isFree: true,
      },
      verificationStatus: rawDoc.verificationStatus as SafeDestinationDto['verificationStatus'],
      publicationStatus: rawDoc.publicationStatus as SafeDestinationDto['publicationStatus'],
      publishedAt: publishedAtStr,
      createdBy: rawDoc.createdBy ? (rawDoc.createdBy as { toString(): string }).toString() : undefined,
      createdAt: createdAtStr,
      updatedAt: updatedAtStr,
    };
  }

  public mapNearbyDestinationToDto(
    doc: Record<string, unknown> & { distanceMeters?: number },
  ): NearbyDestinationDto {
    const baseDto = this.mapDestinationToDto(doc);
    const distanceMeters =
      doc.distanceMeters !== undefined ? Math.round(doc.distanceMeters) : 0;
    const distanceKm =
      doc.distanceMeters !== undefined
        ? Number((doc.distanceMeters / 1000).toFixed(2))
        : 0;

    return {
      ...baseDto,
      distanceKm,
      distanceMeters,
    };
  }

  // ==============================================================================
  // MEDIA MANAGEMENT DELEGATION METHODS
  // ==============================================================================

  public async attachMedia(
    principal: AuthenticatedPrincipal,
    destinationId: string,
    input: AttachDestinationMediaInput,
  ): Promise<MediaDto> {
    return mediaService.attachMediaToDestination(principal, destinationId, input);
  }

  public async updateMedia(
    principal: AuthenticatedPrincipal,
    destinationId: string,
    mediaId: string,
    input: UpdateDestinationMediaInput,
  ): Promise<MediaDto> {
    return mediaService.updateDestinationMedia(principal, destinationId, mediaId, input);
  }

  public async deleteMedia(
    principal: AuthenticatedPrincipal,
    destinationId: string,
    mediaId: string,
  ): Promise<void> {
    return mediaService.deleteDestinationMedia(principal, destinationId, mediaId);
  }

  public async listMedia(destinationId: string): Promise<MediaDto[]> {
    return mediaService.listDestinationMedia(destinationId);
  }

  public mapCategoryToDto(doc: IDestinationCategoryDocument): SafeDestinationCategoryDto {
    return {
      id: doc._id.toString(),
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      icon: doc.icon,
    };
  }

  public mapSubmissionToDto(doc: IDestinationSubmissionDocument): SafeDestinationSubmissionDto {
    return {
      id: doc._id.toString(),
      submittedBy: doc.submittedBy.toString(),
      name: doc.name,
      description: doc.description,
      categoryIds: (doc.categoryIds || []).map((id) => id.toString()),
      submittedLocation: doc.submittedLocation,
      submittedAddress: doc.submittedAddress,
      imageMediaIds: doc.imageMediaIds || [],
      submissionStatus: doc.submissionStatus,
      reviewedBy: doc.reviewedBy ? doc.reviewedBy.toString() : undefined,
      reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : undefined,
      reviewNotes: doc.reviewNotes,
      destinationId: doc.destinationId ? doc.destinationId.toString() : undefined,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}

export const destinationsService = new DestinationsService();
