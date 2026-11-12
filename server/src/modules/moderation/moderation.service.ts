import { ClientSession, Types } from 'mongoose';
import {
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  AUDIT_TARGET_ENTITY_TYPES,
  DESTINATION_SUBMISSION_STATUSES,
  MODERATION_RULES,
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '@kerala-tourism/constants';
import type {
  AdminAuditAction,
  ContentReportDto,
  ModerationCommentDto,
  ModerationCommentMutationResponseDto,
  ModerationCommentsListResponseDto,
  ModerationCreatorSummaryDto,
  ModerationDestinationMutationResponseDto,
  ModerationDestinationsListResponseDto,
  ModerationDestinationSubmissionDto,
  ModerationPostDto,
  ModerationPostMutationResponseDto,
  ModerationPostsListResponseDto,
  ModerationQueueResponseDto,
  ReportReviewResponseDto,
  ReportsListResponseDto,
  ReportStatus,
} from '@kerala-tourism/shared-types';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError';
import { SafeAdminProfileLean } from '../admin/admin.types';
import { AuditLogService, auditLogService } from '../admin/audit-log.service';
import {
  AdminReportsQueryInput,
  ApproveDestinationModerationInput,
  ApprovePostModerationInput,
  CreateContentReportInput,
  ModerationCommentsQueryInput,
  ModerationDestinationsQueryInput,
  ModerationPostsQueryInput,
  ModerationQueueQueryInput,
  RejectDestinationModerationInput,
  RejectPostModerationInput,
  RemoveCommentModerationInput,
  RemovePostModerationInput,
  RestoreCommentModerationInput,
  ReviewReportInput,
  TouristReportsQueryInput,
} from './moderation.validation';
import {
  ModerationRepository,
  moderationRepository,
} from './moderation.repository';
import {
  ModerationCommentLean,
  ModerationDestinationLean,
  ModerationPostLean,
  ModerationRequestContext,
  ModerationSubmissionLean,
  ReportLean,
} from './moderation.types';

const ALLOWED_REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  [REPORT_STATUSES.PENDING]: [
    REPORT_STATUSES.UNDER_REVIEW,
    REPORT_STATUSES.RESOLVED,
    REPORT_STATUSES.DISMISSED,
  ],
  [REPORT_STATUSES.UNDER_REVIEW]: [
    REPORT_STATUSES.RESOLVED,
    REPORT_STATUSES.DISMISSED,
  ],
  [REPORT_STATUSES.RESOLVED]: [],
  [REPORT_STATUSES.DISMISSED]: [],
};

const REPORT_STATUS_TO_AUDIT_ACTION: Record<
  Exclude<ReportStatus, typeof REPORT_STATUSES.PENDING>,
  AdminAuditAction
> = {
  [REPORT_STATUSES.UNDER_REVIEW]: ADMIN_AUDIT_ACTIONS.REPORT_UNDER_REVIEW,
  [REPORT_STATUSES.RESOLVED]: ADMIN_AUDIT_ACTIONS.REPORT_RESOLVED,
  [REPORT_STATUSES.DISMISSED]: ADMIN_AUDIT_ACTIONS.REPORT_DISMISSED,
};

const buildPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / limit),
});

export class ModerationService {
  constructor(
    private repo: ModerationRepository = moderationRepository,
    private auditService: AuditLogService = auditLogService,
  ) {}

  public setRepository(repository: ModerationRepository): void {
    this.repo = repository;
  }

  public setAuditService(service: AuditLogService): void {
    this.auditService = service;
  }

  private async loadActorAdminProfile(
    actorAdminId: string,
    session?: ClientSession,
  ): Promise<SafeAdminProfileLean> {
    const profile = await this.repo.findAdminProfileByAccountId(actorAdminId, session);
    if (!profile) {
      throw new ForbiddenError('Admin profile not found', 'ADMIN_PROFILE_NOT_FOUND');
    }
    return profile;
  }

  private async generateUniqueDestinationSlug(
    name: string,
    session?: ClientSession,
  ): Promise<string> {
    const baseSlug =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'destination';

    const existing = await this.repo.findDestinationBySlug(baseSlug, session);
    if (!existing) {
      return baseSlug;
    }

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return `${baseSlug}-${suffix}`;
  }

  // ==============================================================================
  // DTO MAPPERS
  // ==============================================================================

  private mapSubmissionToDto(
    doc: ModerationSubmissionLean,
    creator: ModerationCreatorSummaryDto | null,
    activeReportsCount: number,
  ): ModerationDestinationSubmissionDto {
    return {
      id: doc._id.toString(),
      submittedBy: doc.submittedBy.toString(),
      creator,
      name: doc.name,
      description: doc.description,
      categoryIds: (doc.categoryIds || []).map((id) => id.toString()),
      district: doc.district ?? null,
      submittedLocation: doc.submittedLocation,
      submittedAddress: doc.submittedAddress,
      imageMediaIds: doc.imageMediaIds || [],
      submissionStatus: doc.submissionStatus,
      reviewedBy: doc.reviewedBy ? doc.reviewedBy.toString() : null,
      reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : null,
      reviewNotes: doc.reviewNotes ?? null,
      destinationId: doc.destinationId ? doc.destinationId.toString() : null,
      activeReportsCount,
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
    };
  }

  private mapDestinationToModerationDto(doc: ModerationDestinationLean) {
    return {
      id: doc._id.toString(),
      name: doc.name,
      slug: doc.slug,
      district: doc.district,
      location: doc.location,
      address: doc.address,
      verificationStatus: doc.verificationStatus,
      publicationStatus: doc.publicationStatus,
      verifiedBy: doc.verifiedBy ? doc.verifiedBy.toString() : null,
    };
  }

  private mapPostToDto(
    doc: ModerationPostLean,
    creator: ModerationCreatorSummaryDto | null,
    activeReportsCount: number,
  ): ModerationPostDto {
    return {
      id: doc._id.toString(),
      authorId: doc.authorId.toString(),
      creator,
      content: doc.content,
      mediaIds: (doc.mediaIds || []).map((id) => id.toString()),
      destinationId: doc.destinationId ? doc.destinationId.toString() : null,
      visibility: doc.visibility,
      status: doc.status,
      likesCount: doc.likesCount ?? 0,
      commentsCount: doc.commentsCount ?? 0,
      repostsCount: doc.repostsCount ?? 0,
      publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
      deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
      moderatedBy: doc.moderatedBy ? doc.moderatedBy.toString() : null,
      moderatedAt: doc.moderatedAt ? new Date(doc.moderatedAt).toISOString() : null,
      moderationReason: doc.moderationReason ?? null,
      activeReportsCount,
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
    };
  }

  private mapCommentToDto(
    doc: ModerationCommentLean,
    creator: ModerationCreatorSummaryDto | null,
    activeReportsCount: number,
  ): ModerationCommentDto {
    return {
      id: doc._id.toString(),
      postId: doc.postId.toString(),
      authorId: doc.authorId.toString(),
      creator,
      content: doc.content,
      status: doc.status,
      deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
      moderatedBy: doc.moderatedBy ? doc.moderatedBy.toString() : null,
      moderatedAt: doc.moderatedAt ? new Date(doc.moderatedAt).toISOString() : null,
      moderationReason: doc.moderationReason ?? null,
      activeReportsCount,
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
    };
  }

  private mapReportToDto(
    doc: ReportLean,
    options: { includeInternalReviewFields?: boolean } = {},
  ): ContentReportDto {
    const includeInternal = options.includeInternalReviewFields ?? true;
    const base: ContentReportDto = {
      id: doc._id.toString(),
      reporterId: doc.reporterId.toString(),
      targetType: doc.targetType,
      targetId: doc.targetId.toString(),
      reason: doc.reason,
      description: doc.description ?? null,
      status: doc.status,
      reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : null,
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
    };

    if (includeInternal) {
      base.reviewedBy = doc.reviewedBy ? doc.reviewedBy.toString() : null;
      base.moderatorNotes = doc.moderatorNotes ?? null;
    }

    return base;
  }

  // ==============================================================================
  // MODERATION QUEUE & SECTION LISTING SERVICES
  // ==============================================================================

  public async getModerationQueue(
    query: ModerationQueueQueryInput,
  ): Promise<ModerationQueueResponseDto> {
    const { items, total } = await this.repo.findUnifiedModerationQueue(query);
    return {
      items,
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  public async listDestinationsForModeration(
    query: ModerationDestinationsQueryInput,
  ): Promise<ModerationDestinationsListResponseDto> {
    const { items, total } = await this.repo.findDestinationsForModeration(query);
    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators(items.map((i) => i.submittedBy)),
      this.repo.getActiveReportCountsByTarget(
        REPORT_TARGET_TYPES.DESTINATION,
        items.map((i) => i._id),
      ),
    ]);

    return {
      items: items.map((doc) =>
        this.mapSubmissionToDto(
          doc,
          creators.get(doc.submittedBy.toString()) ?? null,
          reportCounts.get(doc._id.toString()) ?? 0,
        ),
      ),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  public async listPostsForModeration(
    query: ModerationPostsQueryInput,
  ): Promise<ModerationPostsListResponseDto> {
    const { items, total } = await this.repo.findPostsForModeration(query);
    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators(items.map((i) => i.authorId)),
      this.repo.getActiveReportCountsByTarget(
        REPORT_TARGET_TYPES.POST,
        items.map((i) => i._id),
      ),
    ]);

    return {
      items: items.map((doc) =>
        this.mapPostToDto(
          doc,
          creators.get(doc.authorId.toString()) ?? null,
          reportCounts.get(doc._id.toString()) ?? 0,
        ),
      ),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  public async listCommentsForModeration(
    query: ModerationCommentsQueryInput,
  ): Promise<ModerationCommentsListResponseDto> {
    const { items, total } = await this.repo.findCommentsForModeration(query);
    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators(items.map((i) => i.authorId)),
      this.repo.getActiveReportCountsByTarget(
        REPORT_TARGET_TYPES.COMMENT,
        items.map((i) => i._id),
      ),
    ]);

    return {
      items: items.map((doc) =>
        this.mapCommentToDto(
          doc,
          creators.get(doc.authorId.toString()) ?? null,
          reportCounts.get(doc._id.toString()) ?? 0,
        ),
      ),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  // ==============================================================================
  // DESTINATION MODERATION
  // ==============================================================================

  public async approveDestinationSubmission(
    actorAdminId: string,
    submissionId: string,
    input: ApproveDestinationModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationDestinationMutationResponseDto> {
    const mutation = await this.repo.withTransaction(async (session) => {
      const actorProfile = await this.loadActorAdminProfile(actorAdminId, session);
      const existing = await this.repo.findDestinationSubmissionById(submissionId, session);
      if (!existing) {
        throw new NotFoundError('Destination submission not found', 'SUBMISSION_NOT_FOUND');
      }

      if (existing.submissionStatus !== DESTINATION_SUBMISSION_STATUSES.PENDING) {
        throw new AppError(
          `Destination submission cannot be approved from status '${existing.submissionStatus}'`,
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const now = new Date();
      const actorObjId = new Types.ObjectId(actorAdminId);
      const claimedSubmission = await this.repo.claimPendingDestinationSubmissionAtomic({
        submissionId,
        nextStatus: DESTINATION_SUBMISSION_STATUSES.APPROVED,
        reviewedBy: actorObjId,
        reviewedAt: now,
        reviewNotes: input.reviewNotes?.trim(),
        session,
      });

      if (!claimedSubmission) {
        throw new AppError(
          'Destination submission was already reviewed concurrently',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      let destination: ModerationDestinationLean | null = null;
      const targetDestId = input.destinationId ?? existing.destinationId?.toString();

      if (targetDestId) {
        const existingDest = await this.repo.findDestinationById(targetDestId, session);
        if (!existingDest) {
          throw new NotFoundError('Target official destination not found', 'DESTINATION_NOT_FOUND');
        }
        destination = await this.repo.updateDestinationAsVerifiedPreservingLifecycle(
          existingDest._id,
          {
            verifiedBy: actorObjId,
            location: input.location ?? existing.submittedLocation,
            district: input.district ?? existing.district ?? existingDest.district,
            address: input.address ?? existing.submittedAddress,
          },
          session,
        );
      } else {
        const slug = await this.generateUniqueDestinationSlug(existing.name, session);
        destination = await this.repo.createVerifiedDraftDestination(
          {
            name: existing.name,
            slug,
            description: existing.description,
            categoryIds: existing.categoryIds || [],
            // Preserve submittedLocation on the submission document separately from verified destination coordinates
            location: input.location ?? existing.submittedLocation,
            address: input.address ?? existing.submittedAddress,
            district: input.district ?? existing.district ?? 'Idukki',
            images: existing.imageMediaIds || [],
            createdBy: existing.submittedBy,
            verifiedBy: actorObjId,
          },
          session,
        );
      }

      const finalSubmission =
        (await this.repo.attachDestinationIdToSubmission(
          submissionId,
          destination!._id,
          session,
        )) ?? claimedSubmission;

      const auditLog = await this.auditService.recordAdminAction(
        {
          actorAccountId: actorAdminId,
          actorAccountType: ACCOUNT_TYPES.ADMIN,
          actorAdminLevel: actorProfile.adminLevel,
          action: ADMIN_AUDIT_ACTIONS.DESTINATION_SUBMISSION_APPROVED,
          targetEntityId: submissionId,
          targetEntityType: AUDIT_TARGET_ENTITY_TYPES.DESTINATION_SUBMISSION,
          reason: input.reviewNotes?.trim() || 'Destination submission approved by moderator',
          beforeState: {
            submissionStatus: existing.submissionStatus,
            destinationId: existing.destinationId?.toString() ?? null,
          },
          afterState: {
            submissionStatus: DESTINATION_SUBMISSION_STATUSES.APPROVED,
            destinationId: destination!._id.toString(),
            verificationStatus: destination!.verificationStatus,
            publicationStatus: destination!.publicationStatus,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        session,
      );

      return { finalSubmission, destination: destination!, auditLog };
    });

    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators([mutation.finalSubmission.submittedBy]),
      this.repo.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.DESTINATION, [submissionId]),
    ]);

    return {
      submission: this.mapSubmissionToDto(
        mutation.finalSubmission,
        creators.get(mutation.finalSubmission.submittedBy.toString()) ?? null,
        reportCounts.get(submissionId) ?? 0,
      ),
      destination: this.mapDestinationToModerationDto(mutation.destination),
      auditLog: mutation.auditLog,
    };
  }

  public async rejectDestinationSubmission(
    actorAdminId: string,
    submissionId: string,
    input: RejectDestinationModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationDestinationMutationResponseDto> {
    const mutation = await this.repo.withTransaction(async (session) => {
      const actorProfile = await this.loadActorAdminProfile(actorAdminId, session);
      const existing = await this.repo.findDestinationSubmissionById(submissionId, session);
      if (!existing) {
        throw new NotFoundError('Destination submission not found', 'SUBMISSION_NOT_FOUND');
      }

      if (existing.submissionStatus !== DESTINATION_SUBMISSION_STATUSES.PENDING) {
        throw new AppError(
          `Destination submission cannot be rejected from status '${existing.submissionStatus}'`,
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const now = new Date();
      const reviewNotes = input.reviewNotes.trim();
      const updated = await this.repo.claimPendingDestinationSubmissionAtomic({
        submissionId,
        nextStatus: DESTINATION_SUBMISSION_STATUSES.REJECTED,
        reviewedBy: new Types.ObjectId(actorAdminId),
        reviewedAt: now,
        reviewNotes,
        session,
      });

      if (!updated) {
        throw new AppError(
          'Destination submission was already reviewed concurrently',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const auditLog = await this.auditService.recordAdminAction(
        {
          actorAccountId: actorAdminId,
          actorAccountType: ACCOUNT_TYPES.ADMIN,
          actorAdminLevel: actorProfile.adminLevel,
          action: ADMIN_AUDIT_ACTIONS.DESTINATION_SUBMISSION_REJECTED,
          targetEntityId: submissionId,
          targetEntityType: AUDIT_TARGET_ENTITY_TYPES.DESTINATION_SUBMISSION,
          reason: reviewNotes,
          beforeState: { submissionStatus: existing.submissionStatus },
          afterState: { submissionStatus: DESTINATION_SUBMISSION_STATUSES.REJECTED },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        session,
      );

      return { updated, auditLog };
    });

    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators([mutation.updated.submittedBy]),
      this.repo.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.DESTINATION, [submissionId]),
    ]);

    return {
      submission: this.mapSubmissionToDto(
        mutation.updated,
        creators.get(mutation.updated.submittedBy.toString()) ?? null,
        reportCounts.get(submissionId) ?? 0,
      ),
      destination: null,
      auditLog: mutation.auditLog,
    };
  }

  // ==============================================================================
  // SOCIAL POST MODERATION
  // ==============================================================================

  private async transitionPostModerationState(params: {
    actorAdminId: string;
    postId: string;
    expectedStatus: string;
    nextStatus: string;
    auditAction: AdminAuditAction;
    reason: string;
    setPublishedAt?: boolean;
    markDeleted?: boolean;
    context: ModerationRequestContext;
  }): Promise<ModerationPostMutationResponseDto> {
    const mutation = await this.repo.withTransaction(async (session) => {
      const actorProfile = await this.loadActorAdminProfile(params.actorAdminId, session);
      const existing = await this.repo.findPostById(params.postId, session);
      if (!existing) {
        throw new NotFoundError('Post not found', 'RESOURCE_NOT_FOUND');
      }

      if (existing.deletedAt !== null && existing.deletedAt !== undefined) {
        throw new AppError(
          'Post has already been removed and cannot transition state',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      if (existing.status !== params.expectedStatus) {
        throw new AppError(
          `Cannot transition post from '${existing.status}' to '${params.nextStatus}'`,
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const now = new Date();
      const updated = await this.repo.transitionPostStatusAtomic({
        postId: params.postId,
        expectedStatus: params.expectedStatus,
        nextStatus: params.nextStatus,
        moderatedBy: new Types.ObjectId(params.actorAdminId),
        moderatedAt: now,
        moderationReason: params.reason,
        ...(params.setPublishedAt ? { publishedAt: existing.publishedAt ?? now } : {}),
        ...(params.markDeleted ? { deletedAt: now } : {}),
        session,
      });

      if (!updated) {
        throw new AppError(
          'Post status changed concurrently and is no longer eligible for this transition',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const auditLog = await this.auditService.recordAdminAction(
        {
          actorAccountId: params.actorAdminId,
          actorAccountType: ACCOUNT_TYPES.ADMIN,
          actorAdminLevel: actorProfile.adminLevel,
          action: params.auditAction,
          targetEntityId: params.postId,
          targetEntityType: AUDIT_TARGET_ENTITY_TYPES.POST,
          reason: params.reason,
          beforeState: {
            status: existing.status,
            deletedAt: existing.deletedAt ? new Date(existing.deletedAt).toISOString() : null,
          },
          afterState: {
            status: updated.status,
            deletedAt: updated.deletedAt ? new Date(updated.deletedAt).toISOString() : null,
          },
          ipAddress: params.context.ipAddress,
          userAgent: params.context.userAgent,
        },
        session,
      );

      return { updated, auditLog };
    });

    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators([mutation.updated.authorId]),
      this.repo.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.POST, [params.postId]),
    ]);

    return {
      post: this.mapPostToDto(
        mutation.updated,
        creators.get(mutation.updated.authorId.toString()) ?? null,
        reportCounts.get(params.postId) ?? 0,
      ),
      auditLog: mutation.auditLog,
    };
  }

  public async approvePost(
    actorAdminId: string,
    postId: string,
    input: ApprovePostModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationPostMutationResponseDto> {
    return this.transitionPostModerationState({
      actorAdminId,
      postId,
      expectedStatus: POST_STATUSES.PENDING,
      nextStatus: POST_STATUSES.PUBLISHED,
      auditAction: ADMIN_AUDIT_ACTIONS.POST_APPROVED,
      reason: input.reason?.trim() || 'Post approved by moderator',
      setPublishedAt: true,
      context,
    });
  }

  public async rejectPost(
    actorAdminId: string,
    postId: string,
    input: RejectPostModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationPostMutationResponseDto> {
    return this.transitionPostModerationState({
      actorAdminId,
      postId,
      expectedStatus: POST_STATUSES.PENDING,
      nextStatus: POST_STATUSES.REJECTED,
      auditAction: ADMIN_AUDIT_ACTIONS.POST_REJECTED,
      reason: input.reason.trim(),
      context,
    });
  }

  public async removePost(
    actorAdminId: string,
    postId: string,
    input: RemovePostModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationPostMutationResponseDto> {
    return this.transitionPostModerationState({
      actorAdminId,
      postId,
      expectedStatus: POST_STATUSES.PUBLISHED,
      nextStatus: POST_STATUSES.REMOVED,
      auditAction: ADMIN_AUDIT_ACTIONS.POST_REMOVED,
      reason: input.reason.trim(),
      markDeleted: true,
      context,
    });
  }

  // ==============================================================================
  // COMMENT MODERATION
  // ==============================================================================

  public async removeComment(
    actorAdminId: string,
    commentId: string,
    input: RemoveCommentModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationCommentMutationResponseDto> {
    const mutation = await this.repo.withTransaction(async (session) => {
      const actorProfile = await this.loadActorAdminProfile(actorAdminId, session);
      const existing = await this.repo.findCommentById(commentId, session);
      if (!existing) {
        throw new NotFoundError('Comment not found', 'RESOURCE_NOT_FOUND');
      }

      if (existing.status !== POST_COMMENT_STATUSES.ACTIVE || existing.deletedAt) {
        throw new AppError(
          'Comment is already removed',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const now = new Date();
      const reason = input.reason.trim();
      const updated = await this.repo.transitionCommentStatusAtomic({
        commentId,
        expectedStatus: POST_COMMENT_STATUSES.ACTIVE,
        requireNotDeleted: true,
        nextStatus: POST_COMMENT_STATUSES.REMOVED,
        deletedAt: now,
        moderatedBy: new Types.ObjectId(actorAdminId),
        moderatedAt: now,
        moderationReason: reason,
        session,
      });

      if (!updated) {
        throw new AppError(
          'Comment was already removed concurrently',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const postCommentsCount = await this.repo.adjustPostCommentsCount(
        existing.postId,
        -1,
        session,
      );

      const auditLog = await this.auditService.recordAdminAction(
        {
          actorAccountId: actorAdminId,
          actorAccountType: ACCOUNT_TYPES.ADMIN,
          actorAdminLevel: actorProfile.adminLevel,
          action: ADMIN_AUDIT_ACTIONS.COMMENT_REMOVED,
          targetEntityId: commentId,
          targetEntityType: AUDIT_TARGET_ENTITY_TYPES.COMMENT,
          reason,
          beforeState: {
            status: POST_COMMENT_STATUSES.ACTIVE,
            postId: existing.postId.toString(),
          },
          afterState: {
            status: POST_COMMENT_STATUSES.REMOVED,
            deletedAt: now.toISOString(),
            postCommentsCount,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        session,
      );

      return { updated, postCommentsCount, auditLog };
    });

    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators([mutation.updated.authorId]),
      this.repo.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.COMMENT, [commentId]),
    ]);

    return {
      comment: this.mapCommentToDto(
        mutation.updated,
        creators.get(mutation.updated.authorId.toString()) ?? null,
        reportCounts.get(commentId) ?? 0,
      ),
      postCommentsCount: mutation.postCommentsCount,
      auditLog: mutation.auditLog,
    };
  }

  public async restoreComment(
    actorAdminId: string,
    commentId: string,
    input: RestoreCommentModerationInput,
    context: ModerationRequestContext,
  ): Promise<ModerationCommentMutationResponseDto> {
    const reason =
      input.reason?.trim() || MODERATION_RULES.DEFAULT_COMMENT_RESTORE_REASON;

    const mutation = await this.repo.withTransaction(async (session) => {
      const actorProfile = await this.loadActorAdminProfile(actorAdminId, session);
      const existing = await this.repo.findCommentById(commentId, session);
      if (!existing) {
        throw new NotFoundError('Comment not found', 'RESOURCE_NOT_FOUND');
      }

      if (existing.status !== POST_COMMENT_STATUSES.REMOVED) {
        throw new AppError(
          'Only removed comments are eligible for restoration',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      if (!existing.moderatedBy) {
        throw new AppError(
          'Author-deleted comments cannot be restored by a moderator',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const parentPost = await this.repo.findPostById(existing.postId, session);
      if (
        !parentPost ||
        (parentPost.deletedAt !== null && parentPost.deletedAt !== undefined) ||
        parentPost.status === POST_STATUSES.REMOVED
      ) {
        throw new AppError(
          'Cannot restore a comment whose parent post is missing or removed',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const now = new Date();
      const updated = await this.repo.transitionCommentStatusAtomic({
        commentId,
        expectedStatus: POST_COMMENT_STATUSES.REMOVED,
        nextStatus: POST_COMMENT_STATUSES.ACTIVE,
        deletedAt: null,
        moderatedBy: new Types.ObjectId(actorAdminId),
        moderatedAt: now,
        moderationReason: reason,
        session,
      });

      if (!updated) {
        throw new AppError(
          'Comment status changed concurrently and is no longer eligible for restoration',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const postCommentsCount = await this.repo.adjustPostCommentsCount(
        existing.postId,
        1,
        session,
      );

      const auditLog = await this.auditService.recordAdminAction(
        {
          actorAccountId: actorAdminId,
          actorAccountType: ACCOUNT_TYPES.ADMIN,
          actorAdminLevel: actorProfile.adminLevel,
          action: ADMIN_AUDIT_ACTIONS.COMMENT_RESTORED,
          targetEntityId: commentId,
          targetEntityType: AUDIT_TARGET_ENTITY_TYPES.COMMENT,
          reason,
          beforeState: {
            status: POST_COMMENT_STATUSES.REMOVED,
            postId: existing.postId.toString(),
          },
          afterState: {
            status: POST_COMMENT_STATUSES.ACTIVE,
            deletedAt: null,
            postCommentsCount,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        session,
      );

      return { updated, postCommentsCount, auditLog };
    });

    const [creators, reportCounts] = await Promise.all([
      this.repo.hydrateCreators([mutation.updated.authorId]),
      this.repo.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.COMMENT, [commentId]),
    ]);

    return {
      comment: this.mapCommentToDto(
        mutation.updated,
        creators.get(mutation.updated.authorId.toString()) ?? null,
        reportCounts.get(commentId) ?? 0,
      ),
      postCommentsCount: mutation.postCommentsCount,
      auditLog: mutation.auditLog,
    };
  }

  // ==============================================================================
  // USER REPORTS & ADMIN REPORT REVIEW
  // ==============================================================================

  public async createTouristReport(
    reporterAccountId: string,
    input: CreateContentReportInput,
  ): Promise<ContentReportDto> {
    const verification = await this.repo.verifyReportTarget(input.targetType, input.targetId);
    if (!verification.exists) {
      throw new NotFoundError('Reported target content or account not found', 'RESOURCE_NOT_FOUND');
    }

    if (
      (input.targetType === REPORT_TARGET_TYPES.ACCOUNT && input.targetId === reporterAccountId) ||
      (verification.ownerAccountId !== null && verification.ownerAccountId === reporterAccountId)
    ) {
      throw new ForbiddenError(
        'Users cannot report themselves or their own authored content',
        'SELF_REPORT_FORBIDDEN',
      );
    }

    const alreadyActive = await this.repo.hasActiveReportByReporter(
      reporterAccountId,
      input.targetType,
      input.targetId,
    );
    if (alreadyActive) {
      throw new AppError(
        'You already have an active report against this content',
        409,
        'DUPLICATE_ACTIVE_REPORT',
      );
    }

    const created = await this.repo.createReport({
      reporterId: new Types.ObjectId(reporterAccountId),
      targetType: input.targetType,
      targetId: new Types.ObjectId(input.targetId),
      reason: input.reason,
      description: input.description?.trim() || null,
    });

    return this.mapReportToDto(created, { includeInternalReviewFields: false });
  }

  public async listTouristReports(
    reporterAccountId: string,
    query: TouristReportsQueryInput,
  ): Promise<ReportsListResponseDto> {
    const { items, total } = await this.repo.findReportsByReporter(reporterAccountId, query);
    return {
      items: items.map((doc) => this.mapReportToDto(doc, { includeInternalReviewFields: false })),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  public async listAdminReports(
    query: AdminReportsQueryInput,
  ): Promise<ReportsListResponseDto> {
    const { items, total } = await this.repo.findReportsForAdmin(query);
    return {
      items: items.map((doc) => this.mapReportToDto(doc)),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  public async reviewReport(
    actorAdminId: string,
    reportId: string,
    input: ReviewReportInput,
    context: ModerationRequestContext,
  ): Promise<ReportReviewResponseDto> {
    const mutation = await this.repo.withTransaction(async (session) => {
      const actorProfile = await this.loadActorAdminProfile(actorAdminId, session);
      const existing = await this.repo.findReportById(reportId, session);
      if (!existing) {
        throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
      }

      const allowedNext = ALLOWED_REPORT_TRANSITIONS[existing.status] ?? [];
      if (!allowedNext.includes(input.status)) {
        throw new AppError(
          `Cannot transition report from '${existing.status}' to '${input.status}'`,
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const now = new Date();
      const moderatorNotes = input.moderatorNotes?.trim() || null;
      const updated = await this.repo.transitionReportStatusAtomic({
        reportId,
        allowedFromStatuses: [existing.status],
        nextStatus: input.status,
        reviewedBy: new Types.ObjectId(actorAdminId),
        reviewedAt: now,
        moderatorNotes: moderatorNotes ?? existing.moderatorNotes ?? null,
        session,
      });

      if (!updated) {
        throw new AppError(
          'Report status changed concurrently and is no longer eligible for this review action',
          409,
          'INVALID_STATUS_TRANSITION',
        );
      }

      const auditAction = REPORT_STATUS_TO_AUDIT_ACTION[input.status];
      const auditLog = await this.auditService.recordAdminAction(
        {
          actorAccountId: actorAdminId,
          actorAccountType: ACCOUNT_TYPES.ADMIN,
          actorAdminLevel: actorProfile.adminLevel,
          action: auditAction,
          targetEntityId: reportId,
          targetEntityType: AUDIT_TARGET_ENTITY_TYPES.REPORT,
          reason: moderatorNotes || `Report status transitioned to ${input.status}`,
          beforeState: {
            status: existing.status,
            targetType: existing.targetType,
            targetId: existing.targetId.toString(),
          },
          afterState: {
            status: updated.status,
            targetType: updated.targetType,
            targetId: updated.targetId.toString(),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        session,
      );

      return { updated, auditLog };
    });

    return {
      report: this.mapReportToDto(mutation.updated),
      auditLog: mutation.auditLog,
    };
  }
}

export const moderationService = new ModerationService();
