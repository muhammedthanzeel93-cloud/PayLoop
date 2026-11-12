import { Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  MEDIA_RULES,
  POST_RULES,
  POST_STATUSES,
  POST_VISIBILITIES,
} from '@kerala-tourism/constants';
import {
  AuthenticatedPrincipal,
  CursorPaginationMeta,
  PostAuthorDto,
  PostDestinationSummaryDto,
  PostDto,
  PostMediaDto,
} from '@kerala-tourism/shared-types';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError';
import { assertOwnership } from '../../shared/security/ownership';
import {
  IDestinationDocument,
  IMediaDocument,
  IPostDocument,
  ITouristProfileDocument,
} from '../../shared/models';
import { AuthRepository, authRepository } from '../auth/auth.repository';
import {
  DestinationsRepository,
  destinationsRepository,
} from '../destinations/destinations.repository';
import { MediaRepository, mediaRepository } from '../media/media.repository';
import { PostsRepository, postsRepository } from './post.repository';
import {
  CreatePostInput,
  CursorPaginatedPostsResult,
  DeletePostResult,
  FollowingFeedQuery,
  PaginatedPostsResult,
  PublicPostsFeedQuery,
  TouristOwnPostsQuery,
  UpdatePostInput,
  UpdatePostPersistenceInput,
} from './post.types';
import {
  decodeFollowingFeedCursor,
  encodeFollowingFeedCursor,
} from './post.validation';

export const verifyActiveTouristAccount = async (
  principal: AuthenticatedPrincipal,
  authRepo: AuthRepository,
): Promise<void> => {
  if (!principal || !principal.id) {
    throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
  }

  const account = await authRepo.findAccountById(principal.id);
  if (!account) {
    throw new UnauthorizedError('Authenticated account no longer exists', 'ACCOUNT_NOT_FOUND');
  }

  if (account.status === ACCOUNT_STATUSES.SUSPENDED) {
    throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
  }

  if (account.status === ACCOUNT_STATUSES.DEACTIVATED) {
    throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  if (account.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
  }

  if (account.accountType !== ACCOUNT_TYPES.TOURIST) {
    throw new ForbiddenError(
      'Access forbidden: Only active TOURIST accounts can manage tourist posts',
      'FORBIDDEN_ACCOUNT_TYPE',
    );
  }
};

export class PostsService {
  constructor(
    private repo: PostsRepository = postsRepository,
    private mediaRepo: MediaRepository = mediaRepository,
    private destinationsRepo: DestinationsRepository = destinationsRepository,
    private authRepo: AuthRepository = authRepository,
  ) {}

  public setRepository(repository: PostsRepository): void {
    this.repo = repository;
  }

  public setMediaRepository(repository: MediaRepository): void {
    this.mediaRepo = repository;
  }

  public setDestinationsRepository(repository: DestinationsRepository): void {
    this.destinationsRepo = repository;
  }

  public setAuthRepository(repository: AuthRepository): void {
    this.authRepo = repository;
  }

  /**
   * Ensures only active TOURIST accounts create or mutate tourist posts.
   */
  private async assertActiveTouristAccount(principal: AuthenticatedPrincipal): Promise<void> {
    await verifyActiveTouristAccount(principal, this.authRepo);
  }

  /**
   * Validates destination existence and VERIFIED + PUBLISHED eligibility.
   */
  private async validateAndResolveDestination(
    destinationId: string | null | undefined,
  ): Promise<Types.ObjectId | null | undefined> {
    if (destinationId === undefined) {
      return undefined;
    }

    if (destinationId === null) {
      return null;
    }

    const destination = await this.destinationsRepo.findDestinationById(destinationId);
    if (!destination) {
      throw new NotFoundError('Associated destination not found', 'DESTINATION_NOT_FOUND');
    }

    if (
      destination.verificationStatus !== DESTINATION_VERIFICATION_STATUSES.VERIFIED ||
      destination.publicationStatus !== DESTINATION_PUBLICATION_STATUSES.PUBLISHED
    ) {
      throw new ValidationError(
        'Destination must be VERIFIED and PUBLISHED for post association',
        [{ field: 'destinationId', message: 'Destination is not verified and published' }],
      );
    }

    return new Types.ObjectId(destination._id.toString());
  }

  /**
   * Validates existence, ownership, moderation eligibility, MIME type, size, URL safety,
   * destination consistency, and deduplicates media references preserving order.
   */
  private async validateAndResolveMedia(
    principal: AuthenticatedPrincipal,
    rawMediaIds: string[],
    destinationId?: string | null,
  ): Promise<Types.ObjectId[]> {
    const uniqueIds = Array.from(new Set(rawMediaIds));
    if (uniqueIds.length === 0) {
      return [];
    }

    if (uniqueIds.length > POST_RULES.MAX_MEDIA_PER_POST) {
      throw new ValidationError(
        `A post cannot exceed ${POST_RULES.MAX_MEDIA_PER_POST} media items`,
        [{ field: 'mediaIds', message: 'Maximum media limit exceeded' }],
      );
    }

    const mediaDocs = await this.mediaRepo.findByIds(uniqueIds);
    const mediaById = new Map(mediaDocs.map((doc) => [doc._id.toString(), doc]));

    for (const mediaId of uniqueIds) {
      const media = mediaById.get(mediaId);
      if (!media) {
        throw new NotFoundError(`Media item '${mediaId}' was not found`, 'MEDIA_NOT_FOUND');
      }

      if (media.uploaderAccountId.toString() !== principal.id) {
        throw new ForbiddenError(
          'You are not authorized to associate one or more media items with this post',
          'UNAUTHORIZED_MEDIA_ACCESS',
        );
      }

      if (media.isModerated !== true) {
        throw new ValidationError(
          'One or more media items are not eligible or moderated for post association',
          [{ field: 'mediaIds', message: 'Media is not moderated for post association' }],
        );
      }

      if (!(MEDIA_RULES.ALLOWED_MIME_TYPES as readonly string[]).includes(media.mimeType)) {
        throw new ValidationError(
          `Unsupported media MIME type '${media.mimeType}'. Allowed types: ${MEDIA_RULES.ALLOWED_MIME_TYPES.join(', ')}`,
          [{ field: 'mediaIds', message: 'Unsupported media MIME type' }],
        );
      }

      if (
        typeof media.fileSizeBytes !== 'number' ||
        media.fileSizeBytes < 1 ||
        media.fileSizeBytes > MEDIA_RULES.MAX_FILE_SIZE_BYTES
      ) {
        throw new ValidationError(
          `Media size must be between 1 byte and ${MEDIA_RULES.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
          [{ field: 'mediaIds', message: 'Media file size exceeds allowed limit' }],
        );
      }

      const hasSafeUrl =
        typeof media.url === 'string' &&
        (media.url.startsWith('https://') || media.url.startsWith('http://'));
      const hasPrivatePrefix =
        typeof media.storageKey !== 'string' ||
        media.storageKey.trim().length === 0 ||
        media.storageKey.startsWith('private/') ||
        media.storageKey.startsWith('kyc/');

      if (!hasSafeUrl || hasPrivatePrefix) {
        throw new ValidationError(
          'Media asset is restricted or ineligible for post association',
          [{ field: 'mediaIds', message: 'Media is not eligible for public delivery' }],
        );
      }

      if (
        media.destinationId &&
        destinationId &&
        media.destinationId.toString() !== destinationId
      ) {
        throw new ValidationError(
          'Media item is bound to a different destination than the one specified',
          [{ field: 'mediaIds', message: 'Media destination mismatch' }],
        );
      }
    }

    return uniqueIds.map((id) => new Types.ObjectId(id));
  }

  /**
   * Batch hydrates posts with safe public author, media, and destination summaries.
   * Strips sensitive data (emails, password hashes, storage keys).
   */
  private async hydratePosts(posts: IPostDocument[]): Promise<PostDto[]> {
    if (posts.length === 0) {
      return [];
    }

    const authorIds = Array.from(new Set(posts.map((p) => p.authorId.toString())));
    const mediaIds = Array.from(
      new Set(posts.flatMap((p) => (p.mediaIds || []).map((id) => id.toString()))),
    );
    const destinationIds = Array.from(
      new Set(
        posts
          .map((p) => (p.destinationId ? p.destinationId.toString() : null))
          .filter((id): id is string => id !== null),
      ),
    );

    const [profiles, mediaDocs, destDocs] = await Promise.all([
      this.repo.findTouristProfilesByAccountIds(authorIds),
      this.mediaRepo.findByIds(mediaIds),
      this.destinationsRepo.findDestinationsByIds(destinationIds),
    ]);

    const profileMap = new Map<string, ITouristProfileDocument>(
      profiles.map((prof) => [prof.accountId.toString(), prof]),
    );
    const mediaMap = new Map<string, IMediaDocument>(
      mediaDocs.map((m) => [m._id.toString(), m]),
    );
    const destMap = new Map<string, IDestinationDocument>(
      destDocs.map((d) => [d._id.toString(), d]),
    );

    return posts.map((post) => {
      const authorIdStr = post.authorId.toString();
      const profile = profileMap.get(authorIdStr);
      const author: PostAuthorDto = profile
        ? {
            id: authorIdStr,
            firstName: profile.firstName,
            lastName: profile.lastName,
            displayName: `${profile.firstName} ${profile.lastName}`.trim() || 'Kerala Traveler',
            profileImage: profile.profileImage,
          }
        : {
            id: authorIdStr,
            displayName: 'Kerala Traveler',
          };

      const rawMediaIdStrs = (post.mediaIds || []).map((id) => id.toString());
      const resolvedMedia: PostMediaDto[] = [];
      for (const mId of rawMediaIdStrs) {
        const mDoc = mediaMap.get(mId);
        const isSafeStorageKey =
          typeof mDoc?.storageKey !== 'string' ||
          (!mDoc.storageKey.startsWith('private/') && !mDoc.storageKey.startsWith('kyc/'));
        if (mDoc && mDoc.isModerated === true && isSafeStorageKey) {
          resolvedMedia.push({
            id: mDoc._id.toString(),
            url: mDoc.url,
            mimeType: mDoc.mimeType,
            fileSizeBytes: mDoc.fileSizeBytes,
            dimensions: mDoc.dimensions,
          });
        }
      }

      let destinationSummary: PostDestinationSummaryDto | undefined;
      const destIdStr = post.destinationId ? post.destinationId.toString() : undefined;
      if (destIdStr) {
        const dDoc = destMap.get(destIdStr);
        if (
          dDoc &&
          dDoc.verificationStatus === DESTINATION_VERIFICATION_STATUSES.VERIFIED &&
          dDoc.publicationStatus === DESTINATION_PUBLICATION_STATUSES.PUBLISHED
        ) {
          destinationSummary = {
            id: dDoc._id.toString(),
            name: dDoc.name,
            slug: dDoc.slug,
            district: dDoc.district,
            locality: dDoc.locality,
            primaryImage:
              Array.isArray(dDoc.images) && dDoc.images.length > 0 ? dDoc.images[0] : undefined,
          };
        }
      }

      return {
        id: post._id.toString(),
        authorId: authorIdStr,
        author,
        content: post.content,
        mediaIds: rawMediaIdStrs,
        media: resolvedMedia,
        destinationId: destIdStr,
        destination: destinationSummary,
        visibility: post.visibility,
        status: post.status,
        likesCount: typeof post.likesCount === 'number' && post.likesCount >= 0 ? post.likesCount : 0,
        commentsCount:
          typeof post.commentsCount === 'number' && post.commentsCount >= 0
            ? post.commentsCount
            : 0,
        repostsCount:
          typeof post.repostsCount === 'number' && post.repostsCount >= 0 ? post.repostsCount : 0,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        createdAt: post.createdAt ? post.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: post.updatedAt ? post.updatedAt.toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Create a new tourist post. authorId is exclusively derived from principal.id.
   */
  public async createPost(
    principal: AuthenticatedPrincipal,
    input: CreatePostInput,
  ): Promise<PostDto> {
    await this.assertActiveTouristAccount(principal);

    const resolvedDestinationId = await this.validateAndResolveDestination(input.destinationId);
    const resolvedMediaIds = await this.validateAndResolveMedia(
      principal,
      input.mediaIds || [],
      resolvedDestinationId ? resolvedDestinationId.toString() : null,
    );

    const now = new Date();
    const created = await this.repo.createPost({
      authorId: new Types.ObjectId(principal.id),
      content: input.content,
      mediaIds: resolvedMediaIds,
      destinationId: resolvedDestinationId ?? null,
      visibility: input.visibility ?? POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      publishedAt: now,
      deletedAt: null,
    });

    const [dto] = await this.hydratePosts([created]);
    return dto;
  }

  /**
   * Public chronological paginated feed (strictly PUBLIC + PUBLISHED + non-deleted).
   */
  public async getPublicFeed(query: PublicPostsFeedQuery): Promise<PaginatedPostsResult> {
    const page = query.page || 1;
    const limit = query.limit || POST_RULES.DEFAULT_FEED_LIMIT;

    const { items, total } = await this.repo.findPublicFeed({
      page,
      limit,
      destinationId: query.destinationId,
    });

    const hydrated = await this.hydratePosts(items);

    return {
      items: hydrated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Personalized following feed for the authenticated tourist using keyset cursor pagination.
   */
  public async getFollowingFeed(
    principal: AuthenticatedPrincipal,
    query: FollowingFeedQuery,
  ): Promise<CursorPaginatedPostsResult> {
    await this.assertActiveTouristAccount(principal);

    const limit = query.limit || POST_RULES.DEFAULT_FOLLOWING_FEED_LIMIT;
    const decodedCursor = query.cursor ? decodeFollowingFeedCursor(query.cursor) : undefined;

    const { items, hasMore } = await this.repo.findFollowingFeed(principal.id, {
      limit,
      cursor: decodedCursor,
    });

    const hydrated = await this.hydratePosts(items);
    const pagination: CursorPaginationMeta = {
      limit,
      hasMore,
    };

    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const cursorPublishedAt =
        lastItem.publishedAt instanceof Date ? lastItem.publishedAt : lastItem.createdAt;
      pagination.nextCursor = encodeFollowingFeedCursor(
        cursorPublishedAt,
        lastItem._id.toString(),
      );
    }

    return {
      items: hydrated,
      pagination,
    };
  }

  /**
   * Retrieve a single public, published, non-deleted post by ID.
   */
  public async getPublicPostById(postId: string): Promise<PostDto> {
    const post = await this.repo.findPublicPostById(postId);
    if (!post) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }

    const [dto] = await this.hydratePosts([post]);
    return dto;
  }

  /**
   * Retrieve authenticated tourist's own active posts.
   */
  public async listOwnPosts(
    principal: AuthenticatedPrincipal,
    query: TouristOwnPostsQuery,
  ): Promise<PaginatedPostsResult> {
    await this.assertActiveTouristAccount(principal);

    const page = query.page || 1;
    const limit = query.limit || POST_RULES.DEFAULT_FEED_LIMIT;

    const { items, total } = await this.repo.findByAuthor(principal.id, {
      page,
      limit,
      visibility: query.visibility,
      status: query.status,
    });

    const hydrated = await this.hydratePosts(items);

    return {
      items: hydrated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieve a single post owned by the authenticated tourist.
   * Conceals unauthorized posts behind 404 RESOURCE_NOT_FOUND to prevent IDOR enumeration.
   */
  public async getOwnPostById(
    principal: AuthenticatedPrincipal,
    postId: string,
  ): Promise<PostDto> {
    await this.assertActiveTouristAccount(principal);

    const post = await this.repo.findById(postId);
    if (!post) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }

    assertOwnership(post.authorId, principal.id, {
      resourceName: 'Post',
      concealWithNotFound: true,
    });

    const [dto] = await this.hydratePosts([post]);
    return dto;
  }

  /**
   * Update an existing post strictly owned by the authenticated tourist.
   */
  public async updateOwnPost(
    principal: AuthenticatedPrincipal,
    postId: string,
    input: UpdatePostInput,
  ): Promise<PostDto> {
    await this.assertActiveTouristAccount(principal);

    const existing = await this.repo.findById(postId);
    if (!existing) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }

    assertOwnership(existing.authorId, principal.id, {
      resourceName: 'Post',
      concealWithNotFound: true,
    });

    if (existing.status === POST_STATUSES.REJECTED) {
      throw new ForbiddenError('Rejected posts cannot be modified', 'POST_REJECTED');
    }

    const updates: UpdatePostPersistenceInput = {};

    if (input.content !== undefined) {
      updates.content = input.content;
    }

    if (input.visibility !== undefined) {
      updates.visibility = input.visibility;
    }

    let effectiveDestId: string | null = existing.destinationId
      ? existing.destinationId.toString()
      : null;

    if (input.destinationId !== undefined) {
      const resolvedDest = await this.validateAndResolveDestination(input.destinationId);
      updates.destinationId = resolvedDest ?? null;
      effectiveDestId = resolvedDest ? resolvedDest.toString() : null;
    } else if (
      input.visibility === POST_VISIBILITIES.PUBLIC &&
      effectiveDestId !== null
    ) {
      await this.validateAndResolveDestination(effectiveDestId);
    }

    if (input.mediaIds !== undefined) {
      updates.mediaIds = await this.validateAndResolveMedia(
        principal,
        input.mediaIds,
        effectiveDestId,
      );
    }

    const updated = await this.repo.updatePost(existing._id, updates);
    if (!updated) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }

    const [dto] = await this.hydratePosts([updated]);
    return dto;
  }

  /**
   * Soft delete an existing post strictly owned by the authenticated tourist.
   */
  public async deleteOwnPost(
    principal: AuthenticatedPrincipal,
    postId: string,
  ): Promise<DeletePostResult> {
    await this.assertActiveTouristAccount(principal);

    const existing = await this.repo.findById(postId);
    if (!existing) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }

    assertOwnership(existing.authorId, principal.id, {
      resourceName: 'Post',
      concealWithNotFound: true,
    });

    const deleted = await this.repo.softDeletePost(existing._id);
    if (!deleted) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }

    return {
      id: deleted._id.toString(),
      status: deleted.status,
      deletedAt: deleted.deletedAt
        ? deleted.deletedAt.toISOString()
        : new Date().toISOString(),
    };
  }
}

export const postsService = new PostsService();
