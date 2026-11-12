import { ClientSession, Types } from 'mongoose';
import { POST_ENGAGEMENT_RULES } from '@kerala-tourism/constants';
import {
  AuthenticatedPrincipal,
  PostAuthorDto,
  PostCommentDto,
  PostLikeResponseDto,
  PostRepostResponseDto,
} from '@kerala-tourism/shared-types';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import { assertOwnership } from '../../shared/security/ownership';
import {
  IPostCommentDocument,
  IPostDocument,
  ITouristProfileDocument,
} from '../../shared/models';
import { AuthRepository, authRepository } from '../auth/auth.repository';
import { PostsRepository, postsRepository } from './post.repository';
import { verifyActiveTouristAccount } from './post.service';
import {
  PostEngagementRepository,
  postEngagementRepository,
} from './post-engagement.repository';
import {
  CreateCommentInput,
  CreateCommentResult,
  DeleteCommentResult,
  PaginatedCommentsResult,
  PostCommentsQuery,
  UpdateCommentInput,
} from './post-engagement.types';

export class PostEngagementService {
  constructor(
    private repo: PostEngagementRepository = postEngagementRepository,
    private postsRepo: PostsRepository = postsRepository,
    private authRepo: AuthRepository = authRepository,
  ) {}

  public setRepository(repository: PostEngagementRepository): void {
    this.repo = repository;
  }

  public setPostsRepository(repository: PostsRepository): void {
    this.postsRepo = repository;
  }

  public setAuthRepository(repository: AuthRepository): void {
    this.authRepo = repository;
  }

  private async requireEligiblePublicPost(
    postId: string,
    session?: ClientSession,
  ): Promise<IPostDocument> {
    const post = await this.repo.findEligiblePublicPostById(postId, session);
    if (!post) {
      throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
    }
    return post;
  }

  private async hydrateComments(comments: IPostCommentDocument[]): Promise<PostCommentDto[]> {
    if (comments.length === 0) {
      return [];
    }

    const authorIds = Array.from(new Set(comments.map((c) => c.authorId.toString())));
    const profiles = await this.postsRepo.findTouristProfilesByAccountIds(authorIds);
    const profileMap = new Map<string, ITouristProfileDocument>(
      profiles.map((p) => [p.accountId.toString(), p]),
    );

    return comments.map((comment) => {
      const authorIdStr = comment.authorId.toString();
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

      return {
        id: comment._id.toString(),
        postId: comment.postId.toString(),
        authorId: authorIdStr,
        author,
        content: comment.content,
        status: comment.status,
        createdAt: comment.createdAt ? comment.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: comment.updatedAt ? comment.updatedAt.toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Like an eligible public published post atomically with duplicate prevention.
   */
  public async likePost(
    principal: AuthenticatedPrincipal,
    postId: string,
  ): Promise<PostLikeResponseDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    return this.repo.withTransaction(async (session) => {
      const post = await this.requireEligiblePublicPost(postId, session);

      const existing = await this.repo.findPostLike(principal.id, post._id, session);
      if (existing) {
        throw new ConflictError('You have already liked this post');
      }

      const created = await this.repo.createPostLike(principal.id, post._id, session);

      let likesCount: number;
      try {
        likesCount = await this.repo.adjustPostCounter(post._id, 'likesCount', 1, session);
      } catch (err) {
        if (!session) {
          await this.repo.deletePostLike(principal.id, post._id);
        }
        throw err;
      }

      return {
        postId: post._id.toString(),
        liked: true,
        likesCount,
        like: {
          id: created._id.toString(),
          accountId: principal.id,
          postId: post._id.toString(),
          createdAt: created.createdAt
            ? created.createdAt.toISOString()
            : new Date().toISOString(),
        },
      };
    });
  }

  /**
   * Remove only the authenticated tourist's own like on an eligible post.
   */
  public async unlikePost(
    principal: AuthenticatedPrincipal,
    postId: string,
  ): Promise<PostLikeResponseDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    return this.repo.withTransaction(async (session) => {
      const post = await this.requireEligiblePublicPost(postId, session);
      const deleted = await this.repo.deletePostLike(principal.id, post._id, session);

      if (!deleted) {
        throw new NotFoundError('Like not found', 'RESOURCE_NOT_FOUND');
      }

      const likesCount = await this.repo.adjustPostCounter(post._id, 'likesCount', -1, session);

      return {
        postId: post._id.toString(),
        liked: false,
        likesCount,
      };
    });
  }

  /**
   * Create a comment on an eligible published public post.
   * Author identity is derived strictly from principal.id.
   */
  public async createComment(
    principal: AuthenticatedPrincipal,
    postId: string,
    input: CreateCommentInput,
  ): Promise<CreateCommentResult> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    const { created, commentsCount } = await this.repo.withTransaction(async (session) => {
      const post = await this.requireEligiblePublicPost(postId, session);

      const commentDoc = await this.repo.createComment(
        {
          postId: post._id,
          authorId: new Types.ObjectId(principal.id),
          content: input.content,
        },
        session,
      );

      let updatedCount: number;
      try {
        updatedCount = await this.repo.adjustPostCounter(
          post._id,
          'commentsCount',
          1,
          session,
        );
      } catch (err) {
        if (!session) {
          await this.repo.softDeleteActiveComment(commentDoc._id);
        }
        throw err;
      }

      return { created: commentDoc, commentsCount: updatedCount };
    });

    const [hydrated] = await this.hydrateComments([created]);
    return { comment: hydrated, commentsCount };
  }

  /**
   * Public paginated listing of active comments sorted newest-first.
   * Conceals non-public, unpublished, rejected, or removed posts with 404.
   */
  public async listPostComments(
    postId: string,
    query: PostCommentsQuery,
  ): Promise<PaginatedCommentsResult> {
    const post = await this.requireEligiblePublicPost(postId);

    const page = query.page || 1;
    const limit = query.limit || POST_ENGAGEMENT_RULES.DEFAULT_COMMENTS_LIMIT;

    const { items, total } = await this.repo.findActiveCommentsByPost(post._id, { page, limit });
    const hydrated = await this.hydrateComments(items);

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
   * Update only the authenticated author's active comment.
   */
  public async updateComment(
    principal: AuthenticatedPrincipal,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<PostCommentDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    const existing = await this.repo.findActiveCommentById(commentId);
    if (!existing) {
      throw new NotFoundError('Comment not found', 'RESOURCE_NOT_FOUND');
    }

    assertOwnership(existing.authorId, principal.id, {
      resourceName: 'Comment',
      concealWithNotFound: true,
    });

    await this.requireEligiblePublicPost(existing.postId.toString());

    const updated = await this.repo.updateCommentContent(existing._id, input.content);
    if (!updated) {
      throw new NotFoundError('Comment not found', 'RESOURCE_NOT_FOUND');
    }

    const [hydrated] = await this.hydrateComments([updated]);
    return hydrated;
  }

  /**
   * Soft delete only the authenticated author's active comment and decrement post commentsCount.
   */
  public async deleteComment(
    principal: AuthenticatedPrincipal,
    commentId: string,
  ): Promise<DeleteCommentResult> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    return this.repo.withTransaction(async (session) => {
      const existing = await this.repo.findActiveCommentById(commentId, session);
      if (!existing) {
        throw new NotFoundError('Comment not found', 'RESOURCE_NOT_FOUND');
      }

      assertOwnership(existing.authorId, principal.id, {
        resourceName: 'Comment',
        concealWithNotFound: true,
      });

      const deleted = await this.repo.softDeleteActiveComment(existing._id, session);
      if (!deleted) {
        throw new NotFoundError('Comment not found', 'RESOURCE_NOT_FOUND');
      }

      const commentsCount = await this.repo.adjustPostCounter(
        existing.postId,
        'commentsCount',
        -1,
        session,
      );

      return {
        id: deleted._id.toString(),
        postId: deleted.postId.toString(),
        status: deleted.status,
        deletedAt: deleted.deletedAt
          ? deleted.deletedAt.toISOString()
          : new Date().toISOString(),
        commentsCount,
      };
    });
  }

  /**
   * Repost an eligible published public post without duplicating original content or media.
   */
  public async repostPost(
    principal: AuthenticatedPrincipal,
    postId: string,
  ): Promise<PostRepostResponseDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    return this.repo.withTransaction(async (session) => {
      const post = await this.requireEligiblePublicPost(postId, session);

      const existing = await this.repo.findPostRepost(principal.id, post._id, session);
      if (existing) {
        throw new ConflictError('You have already reposted this post');
      }

      const created = await this.repo.createPostRepost(principal.id, post._id, session);

      let repostsCount: number;
      try {
        repostsCount = await this.repo.adjustPostCounter(post._id, 'repostsCount', 1, session);
      } catch (err) {
        if (!session) {
          await this.repo.deletePostRepost(principal.id, post._id);
        }
        throw err;
      }

      return {
        postId: post._id.toString(),
        reposted: true,
        repostsCount,
        repost: {
          id: created._id.toString(),
          accountId: principal.id,
          originalPostId: post._id.toString(),
          createdAt: created.createdAt
            ? created.createdAt.toISOString()
            : new Date().toISOString(),
        },
      };
    });
  }

  /**
   * Remove only the authenticated tourist's own repost on a post.
   */
  public async unrepostPost(
    principal: AuthenticatedPrincipal,
    postId: string,
  ): Promise<PostRepostResponseDto> {
    await verifyActiveTouristAccount(principal, this.authRepo);

    return this.repo.withTransaction(async (session) => {
      const post = await this.requireEligiblePublicPost(postId, session);
      const deleted = await this.repo.deletePostRepost(principal.id, post._id, session);

      if (!deleted) {
        throw new NotFoundError('Repost not found', 'RESOURCE_NOT_FOUND');
      }

      const repostsCount = await this.repo.adjustPostCounter(
        post._id,
        'repostsCount',
        -1,
        session,
      );

      return {
        postId: post._id.toString(),
        reposted: false,
        repostsCount,
      };
    });
  }
}

export const postEngagementService = new PostEngagementService();
