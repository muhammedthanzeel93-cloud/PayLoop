import { Types } from 'mongoose';
import { MediaRepository, mediaRepository } from './media.repository';
import { IMediaDocument } from './media.model';
import {
  IStorageProvider,
  MockStorageProvider,
} from './storage.interface';
import { IDestinationDocument } from '../../shared/models';
import {
  DestinationsRepository,
  destinationsRepository,
} from '../destinations/destinations.repository';
import {
  AuthRepository,
  authRepository,
} from '../auth/auth.repository';
import {
  AuthenticatedPrincipal,
  MediaDto,
} from '@kerala-tourism/shared-types';
import {
  AttachDestinationMediaInput,
  UpdateDestinationMediaInput,
} from '@kerala-tourism/validation';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../shared/errors/AppError';
import {
  ACCOUNT_TYPES,
  ADMIN_PERMISSIONS,
  ADMIN_LEVELS,
  MEDIA_RULES,
} from '@kerala-tourism/constants';

export class MediaService {
  constructor(
    private repo: MediaRepository = mediaRepository,
    private destRepo: DestinationsRepository = destinationsRepository,
    private authRepo: AuthRepository = authRepository,
    private storage: IStorageProvider = new MockStorageProvider(),
  ) {}

  public get storageProvider(): IStorageProvider {
    return this.storage;
  }

  public setStorageProvider(newStorage: IStorageProvider): void {
    this.storage = newStorage;
  }

  public setRepository(newRepo: MediaRepository): void {
    this.repo = newRepo;
  }

  public setDestinationsRepository(newDestRepo: DestinationsRepository): void {
    this.destRepo = newDestRepo;
  }

  public setAuthRepository(newAuthRepo: AuthRepository): void {
    this.authRepo = newAuthRepo;
  }

  /**
   * Verify if caller is authorized to manage destination media (creator or admin with MANAGE_DESTINATIONS)
   */
  public async assertDestinationMediaPermission(
    principal: AuthenticatedPrincipal,
    destinationId: string | Types.ObjectId,
  ): Promise<IDestinationDocument> {
    const destination = await this.destRepo.findDestinationById(destinationId);
    if (!destination) {
      throw new NotFoundError('Destination not found', 'DESTINATION_NOT_FOUND');
    }

    // 1. Destination Creator has access
    if (destination.createdBy && destination.createdBy.toString() === principal.id) {
      return destination;
    }

    // 2. Admin with MANAGE_DESTINATIONS has access
    if (principal.accountType === ACCOUNT_TYPES.ADMIN) {
      const adminProfile = await this.authRepo.findAdminProfile(principal.id);
      if (
        adminProfile &&
        (adminProfile.permissions.includes(ADMIN_PERMISSIONS.MANAGE_DESTINATIONS) ||
          adminProfile.adminLevel === ADMIN_LEVELS.SUPER_ADMIN)
      ) {
        return destination;
      }
    }

    throw new ForbiddenError(
      'You do not have permission to manage media for this destination',
      'FORBIDDEN',
    );
  }

  /**
   * Attach media to a destination
   */
  public async attachMediaToDestination(
    principal: AuthenticatedPrincipal,
    destinationId: string,
    input: AttachDestinationMediaInput,
  ): Promise<MediaDto> {
    const destination = await this.assertDestinationMediaPermission(principal, destinationId);

    // Validate MIME type
    if (!(MEDIA_RULES.ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
      throw new ValidationError(
        `Unsupported MIME type. Allowed types: ${MEDIA_RULES.ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size limit
    if (input.fileSizeBytes > MEDIA_RULES.MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File size exceeds maximum allowed limit of ${MEDIA_RULES.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      );
    }

    // Check storage key uniqueness
    const existing = await this.repo.findByStorageKey(input.storageKey);
    if (existing) {
      throw new ConflictError('Media with this storage key already exists', 'DUPLICATE_STORAGE_KEY');
    }

    const destObjectId = new Types.ObjectId(destinationId);

    // If marked primary, unset existing primary media
    if (input.isPrimary) {
      await this.repo.unsetPrimaryForDestination(destObjectId);
    }

    const mediaDoc = await this.repo.createMedia({
      uploaderAccountId: new Types.ObjectId(principal.id),
      destinationId: destObjectId,
      storageKey: input.storageKey,
      url: input.url,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      dimensions: input.dimensions,
      isPrimary: input.isPrimary,
      displayOrder: input.displayOrder,
      isModerated: true,
    });

    // Synchronize destination images array
    if (!destination.images.includes(input.url)) {
      if (input.isPrimary) {
        destination.images.unshift(input.url);
      } else {
        destination.images.push(input.url);
      }
      await this.destRepo.updateDestination(destination._id, { images: destination.images });
    }

    return this.mapMediaToDto(mediaDoc);
  }

  /**
   * Update destination media metadata (primary status, display order)
   */
  public async updateDestinationMedia(
    principal: AuthenticatedPrincipal,
    destinationId: string,
    mediaId: string,
    input: UpdateDestinationMediaInput,
  ): Promise<MediaDto> {
    const destination = await this.assertDestinationMediaPermission(principal, destinationId);

    const media = await this.repo.findById(mediaId);
    if (!media || media.destinationId?.toString() !== destinationId) {
      throw new NotFoundError('Media not found for this destination', 'MEDIA_NOT_FOUND');
    }

    const updates: Partial<IMediaDocument> = {};

    if (input.displayOrder !== undefined) {
      updates.displayOrder = input.displayOrder;
    }

    if (input.isPrimary !== undefined) {
      if (input.isPrimary) {
        await this.repo.unsetPrimaryForDestination(new Types.ObjectId(destinationId));
        updates.isPrimary = true;

        // Move to front of destination images
        destination.images = [
          media.url,
          ...destination.images.filter((img) => img !== media.url),
        ];
        await this.destRepo.updateDestination(destination._id, { images: destination.images });
      } else {
        updates.isPrimary = false;
      }
    }

    const updated = await this.repo.updateMedia(mediaId, updates);
    return this.mapMediaToDto(updated!);
  }

  /**
   * Delete media associated with destination
   */
  public async deleteDestinationMedia(
    principal: AuthenticatedPrincipal,
    destinationId: string,
    mediaId: string,
  ): Promise<void> {
    const destination = await this.assertDestinationMediaPermission(principal, destinationId);

    const media = await this.repo.findById(mediaId);
    if (!media || media.destinationId?.toString() !== destinationId) {
      throw new NotFoundError('Media not found for this destination', 'MEDIA_NOT_FOUND');
    }

    // Delete from storage provider
    await this.storage.delete(media.storageKey);

    // Remove from database
    await this.repo.deleteMedia(mediaId);

    // Remove from destination images array
    destination.images = destination.images.filter((img) => img !== media.url);
    await this.destRepo.updateDestination(destination._id, { images: destination.images });
  }

  /**
   * List media gallery for a destination
   */
  public async listDestinationMedia(destinationId: string): Promise<MediaDto[]> {
    const items = await this.repo.findByDestination(destinationId);
    return items.map((item) => this.mapMediaToDto(item));
  }

  public mapMediaToDto(doc: IMediaDocument): MediaDto {
    return {
      id: doc._id.toString(),
      uploaderAccountId: doc.uploaderAccountId.toString(),
      destinationId: doc.destinationId ? doc.destinationId.toString() : undefined,
      storageKey: doc.storageKey,
      url: doc.url,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      dimensions: doc.dimensions,
      isPrimary: doc.isPrimary,
      displayOrder: doc.displayOrder,
      isModerated: doc.isModerated,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}

export const mediaService = new MediaService();
