import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { ClientSession, Types } from 'mongoose';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_SUBMISSION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  MODERATION_CONTENT_TYPES,
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  POST_VISIBILITIES,
  PREFERRED_LANGUAGES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '@kerala-tourism/constants';
import type {
  AccountStatus,
  AccountType,
  AdminPermission,
  AuditLogEntryDto,
  ContentReportDto,
  KeralaDistrict,
  ModerationCommentDto,
  ModerationCreatorSummaryDto,
  ModerationDestinationSubmissionDto,
  ModerationPostDto,
  ModerationQueueItemDto,
  ModerationQueueResponseDto,
  ReportStatus,
  ReportTargetType,
} from '@kerala-tourism/shared-types';
import { createApp } from '../loaders/app';
import { authMiddleware } from '../middlewares/auth.middleware';
import { authorizationMiddleware } from '../middlewares/authorization.middleware';
import { resetRateLimiter } from '../middlewares/rateLimiter';
import { SafeAdminProfileLean } from '../modules/admin/admin.types';
import {
  AuditLogService,
  auditLogService,
  RecordAdminAuditInput,
  sanitizeAuditStateSnapshot,
} from '../modules/admin/audit-log.service';
import { AuthRepository } from '../modules/auth/auth.repository';
import {
  moderationRepository,
  ModerationRepository,
  buildCreatedAtRangeFilter,
} from '../modules/moderation/moderation.repository';
import { moderationService } from '../modules/moderation/moderation.service';
import type {
  CreateReportPersistenceInput,
  DestinationTransitionParams,
  ModerationCommentLean,
  ModerationDestinationLean,
  ModerationPostLean,
  ModerationSubmissionLean,
  ReportLean,
  VerifiedReportTargetResult,
} from '../modules/moderation/moderation.types';
import type {
  AdminReportsQueryInput,
  ModerationCommentsQueryInput,
  ModerationDestinationsQueryInput,
  ModerationPostsQueryInput,
  ModerationQueueQueryInput,
  TouristReportsQueryInput,
} from '../modules/moderation/moderation.validation';
import { AppError } from '../shared/errors/AppError';
import type {
  IAccountDocument,
  IAdminProfileDocument,
} from '../shared/models';
import { jwtService } from '../shared/security/jwt.service';
import { dispatchRequest } from './testUtils';

interface TestApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
}

interface StoredAccount {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  accountType: AccountType;
  status: AccountStatus;
  displayName: string;
  storageKey?: string;
}

class InMemoryAuthStore {
  public accounts = new Map<string, StoredAccount>();
  public adminProfiles = new Map<string, SafeAdminProfileLean>();
}

class InMemoryAuthRepository extends AuthRepository {
  constructor(private readonly store: InMemoryAuthStore) {
    super();
  }

  public override async findAccountById(
    id: Types.ObjectId | string,
  ): Promise<IAccountDocument | null> {
    const acc = this.store.accounts.get(id.toString());
    if (!acc) return null;
    return {
      _id: acc._id,
      id: acc._id.toString(),
      email: acc.email,
      passwordHash: acc.passwordHash,
      accountType: acc.accountType,
      status: acc.status,
    } as unknown as IAccountDocument;
  }

  public override async findAdminProfile(
    accountId: Types.ObjectId | string,
  ): Promise<IAdminProfileDocument | null> {
    const profile = this.store.adminProfiles.get(accountId.toString());
    if (!profile) return null;
    return {
      _id: profile._id,
      accountId: profile.accountId,
      displayName: profile.displayName,
      adminLevel: profile.adminLevel,
      permissions: profile.permissions,
      mfaEnabled: profile.mfaEnabled,
      preferredLanguage: PREFERRED_LANGUAGES.EN,
    } as unknown as IAdminProfileDocument;
  }
}

class InMemoryAuditLogService extends AuditLogService {
  public logs: Array<
    RecordAdminAuditInput & {
      _id: Types.ObjectId;
      createdAt: Date;
      sanitizedBeforeState: Record<string, unknown>;
      sanitizedAfterState: Record<string, unknown>;
    }
  > = [];

  public override async recordAdminAction(
    input: RecordAdminAuditInput,
    _session?: ClientSession,
  ): Promise<AuditLogEntryDto> {
    const now = new Date();
    const doc = {
      ...input,
      _id: new Types.ObjectId(),
      sanitizedBeforeState: sanitizeAuditStateSnapshot(input.beforeState),
      sanitizedAfterState: sanitizeAuditStateSnapshot(input.afterState),
      createdAt: now,
    };
    this.logs.push(doc);
    return {
      id: doc._id.toString(),
      actorAccountId: input.actorAccountId.toString(),
      actorAccountType: input.actorAccountType,
      actorAdminLevel: input.actorAdminLevel,
      action: input.action,
      targetEntityId: input.targetEntityId.toString(),
      targetEntityType: input.targetEntityType ?? 'ACCOUNT',
      reason: input.reason,
      beforeState: doc.sanitizedBeforeState,
      afterState: doc.sanitizedAfterState,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      timestamp: now.toISOString(),
    };
  }
}

class InMemoryModerationRepository extends ModerationRepository {
  public submissions = new Map<string, ModerationSubmissionLean>();
  public destinations = new Map<string, ModerationDestinationLean>();
  public posts = new Map<string, ModerationPostLean>();
  public comments = new Map<string, ModerationCommentLean>();
  public reports = new Map<string, ReportLean>();

  constructor(private readonly authStore: InMemoryAuthStore) {
    super();
  }

  public override async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    return fn(undefined);
  }

  public override async findAdminProfileByAccountId(
    accountId: string | Types.ObjectId,
  ): Promise<SafeAdminProfileLean | null> {
    return this.authStore.adminProfiles.get(accountId.toString()) ?? null;
  }

  public override async getActiveReportCountsByTarget(
    targetType: ReportTargetType,
    targetIds: Array<string | Types.ObjectId>,
  ): Promise<Map<string, number>> {
    const idSet = new Set(targetIds.map((id) => id.toString()));
    const counts = new Map<string, number>();
    for (const report of this.reports.values()) {
      if (
        report.targetType === targetType &&
        idSet.has(report.targetId.toString()) &&
        (report.status === REPORT_STATUSES.PENDING ||
          report.status === REPORT_STATUSES.UNDER_REVIEW)
      ) {
        const key = report.targetId.toString();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }

  public override async getActiveReportedTargetIds(
    targetType: ReportTargetType,
    limit = 500,
  ): Promise<Types.ObjectId[]> {
    const seen = new Set<string>();
    const ids: Types.ObjectId[] = [];
    for (const report of this.reports.values()) {
      if (
        report.targetType === targetType &&
        (report.status === REPORT_STATUSES.PENDING ||
          report.status === REPORT_STATUSES.UNDER_REVIEW)
      ) {
        const key = report.targetId.toString();
        if (!seen.has(key)) {
          seen.add(key);
          ids.push(report.targetId);
          if (ids.length >= limit) break;
        }
      }
    }
    return ids;
  }

  public override async hydrateCreators(
    accountIds: Array<string | Types.ObjectId>,
  ): Promise<Map<string, ModerationCreatorSummaryDto>> {
    const map = new Map<string, ModerationCreatorSummaryDto>();
    for (const id of accountIds) {
      const hex = id.toString();
      const acc = this.authStore.accounts.get(hex);
      if (acc) {
        map.set(hex, {
          id: hex,
          accountType: acc.accountType,
          status: acc.status,
          displayName: acc.displayName,
        });
      }
    }
    return map;
  }

  private matchesDateRange(
    createdAt: Date,
    dateRange: { $gte?: Date; $lte?: Date } | undefined,
  ): boolean {
    if (!dateRange) return true;
    const t = new Date(createdAt).getTime();
    if (dateRange.$gte && t < dateRange.$gte.getTime()) return false;
    if (dateRange.$lte && t > dateRange.$lte.getTime()) return false;
    return true;
  }

  public override async findUnifiedModerationQueue(
    query: ModerationQueueQueryInput,
  ): Promise<{ items: ModerationQueueItemDto[]; total: number }> {
    const dateRange = buildCreatedAtRangeFilter({
      submissionDate: query.submissionDate,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
    const targetTypes = query.contentType
      ? [query.contentType]
      : query.district
        ? [MODERATION_CONTENT_TYPES.DESTINATION]
        : [
            MODERATION_CONTENT_TYPES.DESTINATION,
            MODERATION_CONTENT_TYPES.POST,
            MODERATION_CONTENT_TYPES.COMMENT,
          ];

    const raw: Array<{
      contentType: (typeof MODERATION_CONTENT_TYPES)[keyof typeof MODERATION_CONTENT_TYPES];
      contentId: string;
      moderationStatus: string;
      creatorAccountId: string;
      district: KeralaDistrict | null;
      titleOrExcerpt: string;
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    if (targetTypes.includes(MODERATION_CONTENT_TYPES.DESTINATION)) {
      const targetStatus =
        query.moderationStatus ?? DESTINATION_SUBMISSION_STATUSES.PENDING;
      if (
        (Object.values(DESTINATION_SUBMISSION_STATUSES) as string[]).includes(
          targetStatus,
        )
      ) {
        for (const sub of this.submissions.values()) {
          if (sub.submissionStatus !== targetStatus) continue;
          if (query.district && sub.district !== query.district) continue;
          if (
            query.creatorAccountId &&
            sub.submittedBy.toString() !== query.creatorAccountId
          )
            continue;
          if (!this.matchesDateRange(sub.createdAt, dateRange)) continue;
          raw.push({
            contentType: MODERATION_CONTENT_TYPES.DESTINATION,
            contentId: sub._id.toString(),
            moderationStatus: sub.submissionStatus,
            creatorAccountId: sub.submittedBy.toString(),
            district: sub.district ?? null,
            titleOrExcerpt: sub.name,
            createdAt: sub.createdAt,
            updatedAt: sub.updatedAt,
          });
        }
      }
    }

    if (targetTypes.includes(MODERATION_CONTENT_TYPES.POST)) {
      const allowed = Object.values(POST_STATUSES) as string[];
      if (!query.moderationStatus || allowed.includes(query.moderationStatus)) {
        const reportedIds = new Set(
          (await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.POST)).map((id) =>
            id.toString(),
          ),
        );
        for (const post of this.posts.values()) {
          if (query.moderationStatus) {
            if (post.status !== query.moderationStatus) continue;
          } else {
            if (post.deletedAt !== null && post.deletedAt !== undefined) continue;
            if (
              post.status !== POST_STATUSES.PENDING &&
              !reportedIds.has(post._id.toString())
            ) {
              continue;
            }
          }
          if (
            query.creatorAccountId &&
            post.authorId.toString() !== query.creatorAccountId
          )
            continue;
          if (!this.matchesDateRange(post.createdAt, dateRange)) continue;
          raw.push({
            contentType: MODERATION_CONTENT_TYPES.POST,
            contentId: post._id.toString(),
            moderationStatus: post.status,
            creatorAccountId: post.authorId.toString(),
            district: null,
            titleOrExcerpt: post.content.slice(0, 140),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
          });
        }
      }
    }

    if (targetTypes.includes(MODERATION_CONTENT_TYPES.COMMENT)) {
      const allowed = Object.values(POST_COMMENT_STATUSES) as string[];
      if (!query.moderationStatus || allowed.includes(query.moderationStatus)) {
        const reportedIds = new Set(
          (await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.COMMENT)).map(
            (id) => id.toString(),
          ),
        );
        for (const comment of this.comments.values()) {
          if (query.moderationStatus) {
            if (comment.status !== query.moderationStatus) continue;
          } else {
            if (comment.deletedAt !== null && comment.deletedAt !== undefined) continue;
            if (
              comment.status !== POST_COMMENT_STATUSES.ACTIVE ||
              !reportedIds.has(comment._id.toString())
            ) {
              continue;
            }
          }
          if (
            query.creatorAccountId &&
            comment.authorId.toString() !== query.creatorAccountId
          )
            continue;
          if (!this.matchesDateRange(comment.createdAt, dateRange)) continue;
          raw.push({
            contentType: MODERATION_CONTENT_TYPES.COMMENT,
            contentId: comment._id.toString(),
            moderationStatus: comment.status,
            creatorAccountId: comment.authorId.toString(),
            district: null,
            titleOrExcerpt: comment.content.slice(0, 140),
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
          });
        }
      }
    }

    raw.sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (diff !== 0) return diff;
      return b.contentId.localeCompare(a.contentId);
    });

    const total = raw.length;
    const skip = (query.page - 1) * query.limit;
    const paged = raw.slice(skip, skip + query.limit);

    const creators = await this.hydrateCreators(paged.map((r) => r.creatorAccountId));
    const destReports = await this.getActiveReportCountsByTarget(
      REPORT_TARGET_TYPES.DESTINATION,
      paged.filter((i) => i.contentType === MODERATION_CONTENT_TYPES.DESTINATION).map((i) => i.contentId),
    );
    const postReports = await this.getActiveReportCountsByTarget(
      REPORT_TARGET_TYPES.POST,
      paged.filter((i) => i.contentType === MODERATION_CONTENT_TYPES.POST).map((i) => i.contentId),
    );
    const commentReports = await this.getActiveReportCountsByTarget(
      REPORT_TARGET_TYPES.COMMENT,
      paged.filter((i) => i.contentType === MODERATION_CONTENT_TYPES.COMMENT).map((i) => i.contentId),
    );

    const items: ModerationQueueItemDto[] = paged.map((row) => {
      const reportMap =
        row.contentType === MODERATION_CONTENT_TYPES.DESTINATION
          ? destReports
          : row.contentType === MODERATION_CONTENT_TYPES.POST
            ? postReports
            : commentReports;
      return {
        contentType: row.contentType,
        contentId: row.contentId,
        moderationStatus: row.moderationStatus,
        creatorAccountId: row.creatorAccountId,
        creator: creators.get(row.creatorAccountId) ?? null,
        district: row.district,
        titleOrExcerpt: row.titleOrExcerpt,
        activeReportsCount: reportMap.get(row.contentId) ?? 0,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      };
    });

    return { items, total };
  }

  public override async findDestinationsForModeration(
    query: ModerationDestinationsQueryInput,
  ): Promise<{ items: ModerationSubmissionLean[]; total: number }> {
    const dateRange = buildCreatedAtRangeFilter({
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
    const list = Array.from(this.submissions.values()).filter((s) => {
      if (query.status && s.submissionStatus !== query.status) return false;
      if (query.district && s.district !== query.district) return false;
      if (
        query.creatorAccountId &&
        s.submittedBy.toString() !== query.creatorAccountId
      )
        return false;
      if (!this.matchesDateRange(s.createdAt, dateRange)) return false;
      return true;
    });
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = (query.page - 1) * query.limit;
    return { items: list.slice(skip, skip + query.limit), total: list.length };
  }

  public override async findPostsForModeration(
    query: ModerationPostsQueryInput,
  ): Promise<{ items: ModerationPostLean[]; total: number }> {
    const dateRange = buildCreatedAtRangeFilter({
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
    let reportedSet: Set<string> | null = null;
    if (query.reportedOnly === 'true') {
      reportedSet = new Set(
        (await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.POST)).map((id) =>
          id.toString(),
        ),
      );
    }
    const list = Array.from(this.posts.values()).filter((p) => {
      if (query.status && p.status !== query.status) return false;
      if (query.creatorAccountId && p.authorId.toString() !== query.creatorAccountId)
        return false;
      if (!this.matchesDateRange(p.createdAt, dateRange)) return false;
      if (reportedSet && !reportedSet.has(p._id.toString())) return false;
      return true;
    });
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = (query.page - 1) * query.limit;
    return { items: list.slice(skip, skip + query.limit), total: list.length };
  }

  public override async findCommentsForModeration(
    query: ModerationCommentsQueryInput,
  ): Promise<{ items: ModerationCommentLean[]; total: number }> {
    let reportedSet: Set<string> | null = null;
    if (query.reportedOnly === 'true') {
      reportedSet = new Set(
        (await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.COMMENT)).map((id) =>
          id.toString(),
        ),
      );
    }
    const list = Array.from(this.comments.values()).filter((c) => {
      if (query.status && c.status !== query.status) return false;
      if (query.postId && c.postId.toString() !== query.postId) return false;
      if (query.creatorAccountId && c.authorId.toString() !== query.creatorAccountId)
        return false;
      if (reportedSet && !reportedSet.has(c._id.toString())) return false;
      return true;
    });
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = (query.page - 1) * query.limit;
    return { items: list.slice(skip, skip + query.limit), total: list.length };
  }

  public override async findDestinationSubmissionById(
    submissionId: string,
  ): Promise<ModerationSubmissionLean | null> {
    const doc = this.submissions.get(submissionId);
    return doc ? { ...doc } : null;
  }

  public override async claimPendingDestinationSubmissionAtomic(
    params: DestinationTransitionParams,
  ): Promise<ModerationSubmissionLean | null> {
    const existing = this.submissions.get(params.submissionId);
    if (
      !existing ||
      existing.submissionStatus !== DESTINATION_SUBMISSION_STATUSES.PENDING
    ) {
      return null;
    }
    const updated: ModerationSubmissionLean = {
      ...existing,
      submissionStatus: params.nextStatus,
      reviewedBy: params.reviewedBy,
      reviewedAt: params.reviewedAt,
      ...(params.reviewNotes !== undefined ? { reviewNotes: params.reviewNotes } : {}),
      ...(params.destinationId ? { destinationId: params.destinationId } : {}),
      updatedAt: new Date(),
    };
    this.submissions.set(params.submissionId, updated);
    return { ...updated };
  }

  public override async attachDestinationIdToSubmission(
    submissionId: string,
    destinationId: Types.ObjectId,
  ): Promise<ModerationSubmissionLean | null> {
    const existing = this.submissions.get(submissionId);
    if (!existing) return null;
    const updated = { ...existing, destinationId, updatedAt: new Date() };
    this.submissions.set(submissionId, updated);
    return { ...updated };
  }

  public override async findDestinationById(
    destinationId: string | Types.ObjectId,
  ): Promise<ModerationDestinationLean | null> {
    const d = this.destinations.get(destinationId.toString());
    return d ? { ...d } : null;
  }

  public override async findDestinationBySlug(
    slug: string,
  ): Promise<ModerationDestinationLean | null> {
    for (const d of this.destinations.values()) {
      if (d.slug === slug.toLowerCase().trim()) return { ...d };
    }
    return null;
  }

  public override async createVerifiedDraftDestination(data: {
    name: string;
    slug: string;
    description: string;
    categoryIds: Types.ObjectId[];
    location: ModerationDestinationLean['location'];
    address: string;
    district: KeralaDistrict;
    images: string[];
    createdBy: Types.ObjectId;
    verifiedBy: Types.ObjectId;
  }): Promise<ModerationDestinationLean> {
    const _id = new Types.ObjectId();
    const created: ModerationDestinationLean = {
      _id,
      name: data.name,
      slug: data.slug,
      district: data.district,
      location: data.location,
      address: data.address,
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
      verifiedBy: data.verifiedBy,
    };
    this.destinations.set(_id.toString(), created);
    return { ...created };
  }

  public override async updateDestinationAsVerifiedPreservingLifecycle(
    destinationId: string | Types.ObjectId,
    updates: {
      verifiedBy: Types.ObjectId;
      location?: ModerationDestinationLean['location'];
      district?: KeralaDistrict;
      address?: string;
    },
  ): Promise<ModerationDestinationLean | null> {
    const d = this.destinations.get(destinationId.toString());
    if (!d) return null;
    const updated: ModerationDestinationLean = {
      ...d,
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      verifiedBy: updates.verifiedBy,
      ...(updates.location ? { location: updates.location } : {}),
      ...(updates.district ? { district: updates.district } : {}),
      ...(updates.address ? { address: updates.address } : {}),
    };
    this.destinations.set(d._id.toString(), updated);
    return { ...updated };
  }

  public override async findPostById(
    postId: string | Types.ObjectId,
  ): Promise<ModerationPostLean | null> {
    const p = this.posts.get(postId.toString());
    return p ? { ...p } : null;
  }

  public override async transitionPostStatusAtomic(params: {
    postId: string;
    expectedStatus: string;
    nextStatus: string;
    moderatedBy: Types.ObjectId;
    moderatedAt: Date;
    moderationReason?: string | null;
    publishedAt?: Date | null;
    deletedAt?: Date | null;
  }): Promise<ModerationPostLean | null> {
    const p = this.posts.get(params.postId);
    if (
      !p ||
      p.status !== params.expectedStatus ||
      (p.deletedAt !== null && p.deletedAt !== undefined)
    ) {
      return null;
    }
    const updated: ModerationPostLean = {
      ...p,
      status: params.nextStatus as ModerationPostLean['status'],
      moderatedBy: params.moderatedBy,
      moderatedAt: params.moderatedAt,
      ...(params.moderationReason !== undefined
        ? { moderationReason: params.moderationReason }
        : {}),
      ...(params.publishedAt !== undefined ? { publishedAt: params.publishedAt } : {}),
      ...(params.deletedAt !== undefined ? { deletedAt: params.deletedAt } : {}),
      updatedAt: new Date(),
    };
    this.posts.set(params.postId, updated);
    return { ...updated };
  }

  public override async findCommentById(
    commentId: string | Types.ObjectId,
  ): Promise<ModerationCommentLean | null> {
    const c = this.comments.get(commentId.toString());
    return c ? { ...c } : null;
  }

  public override async transitionCommentStatusAtomic(params: {
    commentId: string;
    expectedStatus: string;
    requireNotDeleted?: boolean;
    nextStatus: string;
    deletedAt: Date | null;
    moderatedBy: Types.ObjectId;
    moderatedAt: Date;
    moderationReason?: string | null;
  }): Promise<ModerationCommentLean | null> {
    const c = this.comments.get(params.commentId);
    if (!c || c.status !== params.expectedStatus) {
      return null;
    }
    if (params.requireNotDeleted && c.deletedAt !== null && c.deletedAt !== undefined) {
      return null;
    }
    const updated: ModerationCommentLean = {
      ...c,
      status: params.nextStatus as ModerationCommentLean['status'],
      deletedAt: params.deletedAt,
      moderatedBy: params.moderatedBy,
      moderatedAt: params.moderatedAt,
      ...(params.moderationReason !== undefined
        ? { moderationReason: params.moderationReason }
        : {}),
      updatedAt: new Date(),
    };
    this.comments.set(params.commentId, updated);
    return { ...updated };
  }

  public override async adjustPostCommentsCount(
    postId: string | Types.ObjectId,
    delta: 1 | -1,
  ): Promise<number> {
    const p = this.posts.get(postId.toString());
    if (!p) return 0;
    if (delta < 0) {
      if (p.commentsCount > 0) {
        p.commentsCount += delta;
      }
      return Math.max(0, p.commentsCount);
    }
    if (p.deletedAt === null || p.deletedAt === undefined) {
      if (p.status !== POST_STATUSES.REMOVED) {
        p.commentsCount += 1;
      }
    }
    return Math.max(0, p.commentsCount);
  }

  public override async verifyReportTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<VerifiedReportTargetResult> {
    if (targetType === REPORT_TARGET_TYPES.ACCOUNT) {
      const acc = this.authStore.accounts.get(targetId);
      return acc
        ? { exists: true, ownerAccountId: acc._id.toString() }
        : { exists: false, ownerAccountId: null };
    }
    if (targetType === REPORT_TARGET_TYPES.DESTINATION) {
      const dest = this.destinations.get(targetId);
      return dest
        ? { exists: true, ownerAccountId: null }
        : { exists: false, ownerAccountId: null };
    }
    if (targetType === REPORT_TARGET_TYPES.POST) {
      const post = this.posts.get(targetId);
      if (
        !post ||
        post.deletedAt !== null && post.deletedAt !== undefined ||
        post.status === POST_STATUSES.REMOVED
      ) {
        return { exists: false, ownerAccountId: null };
      }
      return { exists: true, ownerAccountId: post.authorId.toString() };
    }
    const comment = this.comments.get(targetId);
    if (
      !comment ||
      (comment.deletedAt !== null && comment.deletedAt !== undefined) ||
      comment.status !== POST_COMMENT_STATUSES.ACTIVE
    ) {
      return { exists: false, ownerAccountId: null };
    }
    return { exists: true, ownerAccountId: comment.authorId.toString() };
  }

  public override async hasActiveReportByReporter(
    reporterId: string | Types.ObjectId,
    targetType: ReportTargetType,
    targetId: string | Types.ObjectId,
  ): Promise<boolean> {
    for (const r of this.reports.values()) {
      if (
        r.reporterId.toString() === reporterId.toString() &&
        r.targetType === targetType &&
        r.targetId.toString() === targetId.toString() &&
        (r.status === REPORT_STATUSES.PENDING || r.status === REPORT_STATUSES.UNDER_REVIEW)
      ) {
        return true;
      }
    }
    return false;
  }

  public override async createReport(
    input: CreateReportPersistenceInput,
  ): Promise<ReportLean> {
    const duplicate = await this.hasActiveReportByReporter(
      input.reporterId,
      input.targetType,
      input.targetId,
    );
    if (duplicate) {
      throw new AppError(
        'You already have an active report against this content',
        409,
        'DUPLICATE_ACTIVE_REPORT',
      );
    }
    const now = new Date();
    const created: ReportLean = {
      _id: new Types.ObjectId(),
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      description: input.description,
      status: REPORT_STATUSES.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      moderatorNotes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.reports.set(created._id.toString(), created);
    return { ...created };
  }

  public override async findReportsByReporter(
    reporterId: string,
    query: TouristReportsQueryInput,
  ): Promise<{ items: ReportLean[]; total: number }> {
    const list = Array.from(this.reports.values()).filter((r) => {
      if (r.reporterId.toString() !== reporterId) return false;
      if (query.status && r.status !== query.status) return false;
      if (query.targetType && r.targetType !== query.targetType) return false;
      return true;
    });
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = (query.page - 1) * query.limit;
    return { items: list.slice(skip, skip + query.limit), total: list.length };
  }

  public override async findReportsForAdmin(
    query: AdminReportsQueryInput,
  ): Promise<{ items: ReportLean[]; total: number }> {
    const list = Array.from(this.reports.values()).filter((r) => {
      if (query.status && r.status !== query.status) return false;
      if (query.targetType && r.targetType !== query.targetType) return false;
      if (query.reason && r.reason !== query.reason) return false;
      return true;
    });
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const skip = (query.page - 1) * query.limit;
    return { items: list.slice(skip, skip + query.limit), total: list.length };
  }

  public override async findReportById(reportId: string): Promise<ReportLean | null> {
    const r = this.reports.get(reportId);
    return r ? { ...r } : null;
  }

  public override async transitionReportStatusAtomic(params: {
    reportId: string;
    allowedFromStatuses: ReportStatus[];
    nextStatus: ReportStatus;
    reviewedBy: Types.ObjectId;
    reviewedAt: Date;
    moderatorNotes?: string | null;
  }): Promise<ReportLean | null> {
    const r = this.reports.get(params.reportId);
    if (!r || !params.allowedFromStatuses.includes(r.status)) {
      return null;
    }
    const updated: ReportLean = {
      ...r,
      status: params.nextStatus,
      reviewedBy: params.reviewedBy,
      reviewedAt: params.reviewedAt,
      ...(params.moderatorNotes !== undefined
        ? { moderatorNotes: params.moderatorNotes }
        : {}),
      updatedAt: new Date(),
    };
    this.reports.set(params.reportId, updated);
    return { ...updated };
  }
}

describe('Day 18 Admin Content Moderation & User Reporting Unit/API Tests', () => {
  const app = createApp();
  let authStore: InMemoryAuthStore;
  let modRepo: InMemoryModerationRepository;
  let auditMock: InMemoryAuditLogService;

  const seedAdmin = (options?: {
    email?: string;
    status?: AccountStatus;
    permissions?: AdminPermission[];
  }) => {
    const id = new Types.ObjectId();
    const account: StoredAccount = {
      _id: id,
      email: options?.email ?? 'mod.admin@kerala.gov.in',
      passwordHash: '$argon2id$secret-hash',
      accountType: ACCOUNT_TYPES.ADMIN,
      status: options?.status ?? ACCOUNT_STATUSES.ACTIVE,
      displayName: 'Moderation Officer',
      storageKey: 'admin/private/key.png',
    };
    authStore.accounts.set(id.toString(), account);
    authStore.adminProfiles.set(id.toString(), {
      _id: new Types.ObjectId(),
      accountId: id,
      displayName: account.displayName,
      adminLevel: ADMIN_LEVELS.MODERATOR,
      permissions: options?.permissions ?? [
        ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE,
        ADMIN_PERMISSIONS.MODERATE_DESTINATIONS,
        ADMIN_PERMISSIONS.MODERATE_POSTS,
        ADMIN_PERMISSIONS.MODERATE_COMMENTS,
        ADMIN_PERMISSIONS.REVIEW_REPORTS,
      ],
      mfaEnabled: true,
    });
    const token = jwtService.signAccessToken({
      id: id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });
    return { id, token };
  };

  const seedTourist = (email: string, displayName = 'Kiran Tourist') => {
    const id = new Types.ObjectId();
    authStore.accounts.set(id.toString(), {
      _id: id,
      email,
      passwordHash: '$argon2id$tourist-secret',
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
      displayName,
    });
    const token = jwtService.signAccessToken({
      id: id.toString(),
      email,
      accountType: ACCOUNT_TYPES.TOURIST,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    return { id, token };
  };

  const seedBusiness = (email: string) => {
    const id = new Types.ObjectId();
    authStore.accounts.set(id.toString(), {
      _id: id,
      email,
      passwordHash: '$argon2id$biz-secret',
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.ACTIVE,
      displayName: 'Backwater Resort',
    });
    const token = jwtService.signAccessToken({
      id: id.toString(),
      email,
      accountType: ACCOUNT_TYPES.BUSINESS,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    return { id, token };
  };

  const seedSubmission = (
    submittedBy: Types.ObjectId,
    overrides?: Partial<ModerationSubmissionLean>,
  ): ModerationSubmissionLean => {
    const id = new Types.ObjectId();
    const now = new Date();
    const doc: ModerationSubmissionLean = {
      _id: id,
      submittedBy,
      name: 'Athirappilly Viewpoint',
      description: 'Scenic waterfall overlook spot submitted by a local traveler.',
      categoryIds: [new Types.ObjectId()],
      district: 'Thrissur',
      submittedLocation: { type: 'Point', coordinates: [76.569, 10.285] },
      submittedAddress: 'Athirappilly Forest Road, Thrissur, Kerala',
      imageMediaIds: [],
      submissionStatus: DESTINATION_SUBMISSION_STATUSES.PENDING,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    modRepo.submissions.set(id.toString(), doc);
    return doc;
  };

  const seedPost = (
    authorId: Types.ObjectId,
    overrides?: Partial<ModerationPostLean>,
  ): ModerationPostLean => {
    const id = new Types.ObjectId();
    const now = new Date();
    const doc: ModerationPostLean = {
      _id: id,
      authorId,
      content: 'Morning mist over Munnar tea plantations.',
      mediaIds: [],
      destinationId: null,
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PENDING,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      publishedAt: null,
      deletedAt: null,
      moderatedBy: null,
      moderatedAt: null,
      moderationReason: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    modRepo.posts.set(id.toString(), doc);
    return doc;
  };

  const seedComment = (
    postId: Types.ObjectId,
    authorId: Types.ObjectId,
    overrides?: Partial<ModerationCommentLean>,
  ): ModerationCommentLean => {
    const id = new Types.ObjectId();
    const now = new Date();
    const doc: ModerationCommentLean = {
      _id: id,
      postId,
      authorId,
      content: 'Great view of the tea gardens!',
      status: POST_COMMENT_STATUSES.ACTIVE,
      deletedAt: null,
      moderatedBy: null,
      moderatedAt: null,
      moderationReason: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    modRepo.comments.set(id.toString(), doc);
    return doc;
  };

  beforeEach(() => {
    resetRateLimiter();
    authStore = new InMemoryAuthStore();
    const authMock = new InMemoryAuthRepository(authStore);
    modRepo = new InMemoryModerationRepository(authStore);
    auditMock = new InMemoryAuditLogService();

    authMiddleware.setRepository(authMock);
    authorizationMiddleware.setRepository(authMock);
    moderationService.setRepository(modRepo);
    moderationService.setAuditService(auditMock);
  });

  after(() => {
    resetRateLimiter();
    authMiddleware.setRepository(new AuthRepository());
    authorizationMiddleware.setRepository(new AuthRepository());
    moderationService.setRepository(moderationRepository);
    moderationService.setAuditService(auditLogService);
  });

  describe('RBAC & Unified Moderation Queue', () => {
    it('blocks unauthenticated, non-admin, suspended admin, and permissionless admin requests', async () => {
      const tourist = seedTourist('t1@example.com');
      const business = seedBusiness('b1@example.com');
      const suspended = seedAdmin({
        email: 'suspended@kerala.gov.in',
        status: ACCOUNT_STATUSES.SUSPENDED,
      });
      const wrongPermAdmin = seedAdmin({
        email: 'noperm@kerala.gov.in',
        permissions: [ADMIN_PERMISSIONS.VIEW_DASHBOARD],
      });
      const postModOnly = seedAdmin({
        email: 'postmod@kerala.gov.in',
        permissions: [ADMIN_PERMISSIONS.MODERATE_POSTS],
      });

      const unauth = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/queue',
      });
      assert.equal(unauth.status, 401);

      const tRes = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/queue',
        headers: { authorization: `Bearer ${tourist.token}` },
      });
      assert.equal(tRes.status, 403);

      const bRes = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/queue',
        headers: { authorization: `Bearer ${business.token}` },
      });
      assert.equal(bRes.status, 403);

      const suspRes = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/queue',
        headers: { authorization: `Bearer ${suspended.token}` },
      });
      assert.equal(suspRes.status, 403);

      const noPermRes = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/queue',
        headers: { authorization: `Bearer ${wrongPermAdmin.token}` },
      });
      assert.equal(noPermRes.status, 403);

      // Section list accepts either VIEW_MODERATION_QUEUE or dedicated permission, never unrelated permission
      const destListDenied = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/destinations',
        headers: { authorization: `Bearer ${postModOnly.token}` },
      });
      assert.equal(destListDenied.status, 403);

      const postListAllowed = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/posts',
        headers: { authorization: `Bearer ${postModOnly.token}` },
      });
      assert.equal(postListAllowed.status, 200);
    });

    it('returns sorted queue items without creator PII, supports filters, and rejects deep unfiltered window > 500', async () => {
      const admin = seedAdmin();
      const touristA = seedTourist('alice@example.com', 'Alice Traveller');
      const touristB = seedTourist('bob@example.com', 'Bob Explorer');

      const t0 = new Date('2026-11-10T08:00:00.000Z');
      const t1 = new Date('2026-11-10T10:00:00.000Z');
      const t2 = new Date('2026-11-10T12:00:00.000Z');

      const sub = seedSubmission(touristA.id, {
        district: 'Idukki',
        createdAt: t0,
        updatedAt: t0,
      });
      const pendingPost = seedPost(touristA.id, {
        status: POST_STATUSES.PENDING,
        createdAt: t1,
        updatedAt: t1,
      });
      const publishedPost = seedPost(touristB.id, {
        status: POST_STATUSES.PUBLISHED,
        publishedAt: t1,
        createdAt: t1,
        updatedAt: t1,
      });
      const reportedComment = seedComment(publishedPost._id, touristB.id, {
        createdAt: t2,
        updatedAt: t2,
      });
      await modRepo.createReport({
        reporterId: touristA.id,
        targetType: REPORT_TARGET_TYPES.COMMENT,
        targetId: reportedComment._id,
        reason: REPORT_REASONS.SPAM,
        description: null,
      });

      const queueRes = await dispatchRequest<TestApiResponse<ModerationQueueResponseDto>>(
        app,
        {
          method: 'GET',
          url: '/api/v1/admin/moderation/queue',
          headers: { authorization: `Bearer ${admin.token}` },
        },
      );
      assert.equal(queueRes.status, 200);
      assert.equal(queueRes.body.data?.items.length, 3);
      assert.deepEqual(
        queueRes.body.data?.items.map((i) => i.contentId),
        [reportedComment._id.toString(), pendingPost._id.toString(), sub._id.toString()],
      );

      // Verify zero PII leakage in creator summary
      const firstItemStr = JSON.stringify(queueRes.body.data?.items);
      assert.equal(firstItemStr.includes('alice@example.com'), false);
      assert.equal(firstItemStr.includes('passwordHash'), false);
      assert.equal(firstItemStr.includes('storageKey'), false);

      // District filter narrows to DESTINATION only
      const districtRes = await dispatchRequest<TestApiResponse<ModerationQueueResponseDto>>(
        app,
        {
          method: 'GET',
          url: '/api/v1/admin/moderation/queue?district=Idukki',
          headers: { authorization: `Bearer ${admin.token}` },
        },
      );
      assert.equal(districtRes.status, 200);
      assert.equal(districtRes.body.data?.items.length, 1);
      assert.equal(districtRes.body.data?.items[0].contentId, sub._id.toString());

      // Deep unfiltered pagination > 500 blocked
      const deepRes = await dispatchRequest<TestApiResponse>(app, {
        method: 'GET',
        url: '/api/v1/admin/moderation/queue?page=11&limit=50',
        headers: { authorization: `Bearer ${admin.token}` },
      });
      assert.equal(deepRes.status, 400);
    });
  });

  describe('Destination Submission Moderation', () => {
    it('approves PENDING submission into VERIFIED DRAFT destination preserving submitted fields, prevents auto-publish and duplicate approval', async () => {
      const admin = seedAdmin();
      const tourist = seedTourist('sub@example.com', 'Nikhil');
      const sub = seedSubmission(tourist.id);

      const res = await dispatchRequest<
        TestApiResponse<{
          submission: ModerationDestinationSubmissionDto;
          destination: ModerationDestinationLean;
        }>
      >(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${sub._id.toString()}/approve`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: {
          reviewNotes: 'Verified coordinates and municipal name.',
          district: 'Thrissur',
          location: { type: 'Point', coordinates: [76.571, 10.287] },
          address: 'Athirappilly Official Road, Thrissur, Kerala',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.data?.submission.submissionStatus, DESTINATION_SUBMISSION_STATUSES.APPROVED);
      // Original submitted fields remain intact
      assert.deepEqual(res.body.data?.submission.submittedLocation.coordinates, [76.569, 10.285]);
      assert.equal(
        res.body.data?.submission.submittedAddress,
        'Athirappilly Forest Road, Thrissur, Kerala',
      );
      // Official destination created as VERIFIED + DRAFT (never auto-published)
      assert.equal(
        res.body.data?.destination.verificationStatus,
        DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      );
      assert.equal(
        res.body.data?.destination.publicationStatus,
        DESTINATION_PUBLICATION_STATUSES.DRAFT,
      );
      assert.deepEqual(res.body.data?.destination.location.coordinates, [76.571, 10.287]);
      assert.equal(auditMock.logs.length, 1);
      assert.equal(auditMock.logs[0].action, ADMIN_AUDIT_ACTIONS.DESTINATION_SUBMISSION_APPROVED);

      // Duplicate approve attempt rejected with 409
      const dup = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${sub._id.toString()}/approve`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: {},
      });
      assert.equal(dup.status, 409);
      assert.equal(dup.body.error?.code, 'INVALID_STATUS_TRANSITION');
    });

    it('requires reviewNotes for rejection and rejects PENDING submission atomically', async () => {
      const admin = seedAdmin();
      const tourist = seedTourist('sub2@example.com');
      const sub = seedSubmission(tourist.id);

      const missingNotes = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${sub._id.toString()}/reject`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: {},
      });
      assert.equal(missingNotes.status, 400);

      const rej = await dispatchRequest<
        TestApiResponse<{ submission: ModerationDestinationSubmissionDto }>
      >(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${sub._id.toString()}/reject`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reviewNotes: 'Duplicate submission for existing waterfall spot.' },
      });
      assert.equal(rej.status, 200);
      assert.equal(rej.body.data?.submission.submissionStatus, DESTINATION_SUBMISSION_STATUSES.REJECTED);
      assert.equal(auditMock.logs[0].action, ADMIN_AUDIT_ACTIONS.DESTINATION_SUBMISSION_REJECTED);

      // Cannot reject twice
      const secondRej = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/destinations/${sub._id.toString()}/reject`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reviewNotes: 'Trying again.' },
      });
      assert.equal(secondRej.status, 409);
    });
  });

  describe('Post & Comment Moderation', () => {
    it('approves PENDING post, rejects invalid status transitions, and soft-removes PUBLISHED post without hard delete', async () => {
      const admin = seedAdmin();
      const tourist = seedTourist('author@example.com');
      const pending = seedPost(tourist.id, { status: POST_STATUSES.PENDING });
      const otherPending = seedPost(tourist.id, { status: POST_STATUSES.PENDING });

      const appRes = await dispatchRequest<TestApiResponse<{ post: ModerationPostDto }>>(
        app,
        {
          method: 'PATCH',
          url: `/api/v1/admin/moderation/posts/${pending._id.toString()}/approve`,
          headers: { authorization: `Bearer ${admin.token}` },
          body: { reason: 'Compliant travel update.' },
        },
      );
      assert.equal(appRes.status, 200);
      assert.equal(appRes.body.data?.post.status, POST_STATUSES.PUBLISHED);
      assert.ok(appRes.body.data?.post.publishedAt);

      // Cannot reject already PUBLISHED post
      const rejectPublished = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/posts/${pending._id.toString()}/reject`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Cannot reject published post.' },
      });
      assert.equal(rejectPublished.status, 409);

      // Remove PUBLISHED post -> REMOVED + deletedAt set (record still preserved in repository)
      const remRes = await dispatchRequest<TestApiResponse<{ post: ModerationPostDto }>>(
        app,
        {
          method: 'PATCH',
          url: `/api/v1/admin/moderation/posts/${pending._id.toString()}/remove`,
          headers: { authorization: `Bearer ${admin.token}` },
          body: { reason: 'Confirmed spam promotional links.' },
        },
      );
      assert.equal(remRes.status, 200);
      assert.equal(remRes.body.data?.post.status, POST_STATUSES.REMOVED);
      assert.ok(remRes.body.data?.post.deletedAt);
      assert.ok(modRepo.posts.get(pending._id.toString()));

      // Cannot approve REMOVED post or re-remove REMOVED post
      const approveRemoved = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/posts/${pending._id.toString()}/approve`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: {},
      });
      assert.equal(approveRemoved.status, 409);

      // Reject second PENDING post
      const rejRes = await dispatchRequest<TestApiResponse<{ post: ModerationPostDto }>>(
        app,
        {
          method: 'PATCH',
          url: `/api/v1/admin/moderation/posts/${otherPending._id.toString()}/reject`,
          headers: { authorization: `Bearer ${admin.token}` },
          body: { reason: 'Off-topic unrelated advertisement.' },
        },
      );
      assert.equal(rejRes.status, 200);
      assert.equal(rejRes.body.data?.post.status, POST_STATUSES.REJECTED);
      assert.equal(auditMock.logs.length, 3);
    });

    it('removes and restores moderator-removed comments while protecting commentsCount >= 0 and blocking restore of author-deleted or orphaned comments', async () => {
      const admin = seedAdmin();
      const tourist = seedTourist('commenter@example.com');
      const livePost = seedPost(tourist.id, {
        status: POST_STATUSES.PUBLISHED,
        commentsCount: 1,
      });
      const modComment = seedComment(livePost._id, tourist.id);
      const authorDeletedComment = seedComment(livePost._id, tourist.id, {
        status: POST_COMMENT_STATUSES.REMOVED,
        deletedAt: new Date(),
        moderatedBy: null,
      });

      const rem = await dispatchRequest<
        TestApiResponse<{ comment: ModerationCommentDto; postCommentsCount: number }>
      >(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${modComment._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Abusive language.' },
      });
      assert.equal(rem.status, 200);
      assert.equal(rem.body.data?.comment.status, POST_COMMENT_STATUSES.REMOVED);
      assert.equal(rem.body.data?.postCommentsCount, 0);

      // Double remove fails with 409 and never drops commentsCount below 0
      const dupRem = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${modComment._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Duplicate removal attempt.' },
      });
      assert.equal(dupRem.status, 409);
      assert.equal(modRepo.posts.get(livePost._id.toString())?.commentsCount, 0);

      // Author-deleted comment cannot be moderator-restored
      const restoreAuthorDeleted = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${authorDeletedComment._id.toString()}/restore`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Attempting invalid restore' },
      });
      assert.equal(restoreAuthorDeleted.status, 409);

      // Restore moderator-removed comment on live post
      const resOk = await dispatchRequest<
        TestApiResponse<{ comment: ModerationCommentDto; postCommentsCount: number }>
      >(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${modComment._id.toString()}/restore`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'False positive after secondary review.' },
      });
      assert.equal(resOk.status, 200);
      assert.equal(resOk.body.data?.comment.status, POST_COMMENT_STATUSES.ACTIVE);
      assert.equal(resOk.body.data?.postCommentsCount, 1);

      // If parent post is later removed, comment removal then cannot restore onto deleted parent post
      await dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${modComment._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Re-removed prior to post removal.' },
      });
      await dispatchRequest(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/posts/${livePost._id.toString()}/remove`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Parent post removed.' },
      });
      const restoreOrphaned = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/comments/${modComment._id.toString()}/restore`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { reason: 'Should fail on removed post' },
      });
      assert.equal(restoreOrphaned.status, 409);
    });
  });

  describe('Tourist Reporting, Admin Report Review, Rate Limits & Audit Redaction', () => {
    it('validates tourist reports, prevents self/duplicate/client-spoofed reports, hides moderatorNotes from reporter, and enforces terminal review transitions', async () => {
      const admin = seedAdmin();
      const reporter = seedTourist('reporter@example.com', 'Reporter One');
      const author = seedTourist('targetauthor@example.com', 'Author Two');
      const business = seedBusiness('biz@example.com');
      const post = seedPost(author.id, { status: POST_STATUSES.PUBLISHED, publishedAt: new Date() });
      const ownPost = seedPost(reporter.id, { status: POST_STATUSES.PUBLISHED, publishedAt: new Date() });

      // Non-tourist (business) cannot submit tourist reports
      const bizTry = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${business.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      });
      assert.equal(bizTry.status, 403);

      // Client-supplied reporterId rejected by strict schema
      const spoofTry = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          reporterId: author.id.toString(),
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      });
      assert.equal(spoofTry.status, 400);

      // Self-report blocked with 403
      const selfReport = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: ownPost._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      });
      assert.equal(selfReport.status, 403);
      assert.equal(selfReport.body.error?.code, 'SELF_REPORT_FORBIDDEN');

      // Missing target returns 404
      const missingRes = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: new Types.ObjectId().toString(),
          reason: REPORT_REASONS.SPAM,
        },
      });
      assert.equal(missingRes.status, 404);

      // OTHER requires description >= 5 chars
      const otherMissingDesc = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.OTHER,
          description: 'hi',
        },
      });
      assert.equal(otherMissingDesc.status, 400);

      // Valid report creation -> 201 and target post remains PUBLISHED
      const createRes = await dispatchRequest<TestApiResponse<ContentReportDto>>(
        app,
        {
          method: 'POST',
          url: '/api/v1/tourist/reports',
          headers: { authorization: `Bearer ${reporter.token}` },
          body: {
            targetType: REPORT_TARGET_TYPES.POST,
            targetId: post._id.toString(),
            reason: REPORT_REASONS.MISLEADING_INFORMATION,
            description: 'Incorrect trail closure information.',
          },
        },
      );
      assert.equal(createRes.status, 201);
      const reportId = createRes.body.data?.id ?? '';
      assert.ok(reportId);
      assert.equal(modRepo.posts.get(post._id.toString())?.status, POST_STATUSES.PUBLISHED);

      // Duplicate active report blocked with 409
      const dupReport = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      });
      assert.equal(dupReport.status, 409);

      // Admin reviews -> UNDER_REVIEW -> RESOLVED
      const underReview = await dispatchRequest<TestApiResponse<{ report: ContentReportDto }>>(
        app,
        {
          method: 'PATCH',
          url: `/api/v1/admin/moderation/reports/${reportId}/review`,
          headers: { authorization: `Bearer ${admin.token}` },
          body: { status: REPORT_STATUSES.UNDER_REVIEW },
        },
      );
      assert.equal(underReview.status, 200);
      assert.equal(underReview.body.data?.report.status, REPORT_STATUSES.UNDER_REVIEW);

      // Resolving without moderatorNotes returns 400
      const resolveNoNotes = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/reports/${reportId}/review`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: { status: REPORT_STATUSES.RESOLVED },
      });
      assert.equal(resolveNoNotes.status, 400);

      const resolved = await dispatchRequest<TestApiResponse<{ report: ContentReportDto }>>(
        app,
        {
          method: 'PATCH',
          url: `/api/v1/admin/moderation/reports/${reportId}/review`,
          headers: { authorization: `Bearer ${admin.token}` },
          body: {
            status: REPORT_STATUSES.RESOLVED,
            moderatorNotes: 'Internal note: flagged for verification team.',
          },
        },
      );
      assert.equal(resolved.status, 200);
      assert.equal(resolved.body.data?.report.status, REPORT_STATUSES.RESOLVED);
      // Target post still untouched by report review itself
      assert.equal(modRepo.posts.get(post._id.toString())?.status, POST_STATUSES.PUBLISHED);

      // Terminal RESOLVED report cannot transition again -> 409
      const reReview = await dispatchRequest<TestApiResponse>(app, {
        method: 'PATCH',
        url: `/api/v1/admin/moderation/reports/${reportId}/review`,
        headers: { authorization: `Bearer ${admin.token}` },
        body: {
          status: REPORT_STATUSES.DISMISSED,
          moderatorNotes: 'Should fail on terminal report.',
        },
      });
      assert.equal(reReview.status, 409);

      // Reporter's own list hides internal moderatorNotes
      const myReports = await dispatchRequest<
        TestApiResponse<{ items: ContentReportDto[] }>
      >(app, {
        method: 'GET',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
      });
      assert.equal(myReports.status, 200);
      assert.equal(myReports.body.data?.items.length, 1);
      assert.equal(myReports.body.data?.items[0].moderatorNotes, undefined);

      // Post-resolution: tourist can now file a new report if needed
      const postResolutionReport = await dispatchRequest<TestApiResponse>(app, {
        method: 'POST',
        url: '/api/v1/tourist/reports',
        headers: { authorization: `Bearer ${reporter.token}` },
        body: {
          targetType: REPORT_TARGET_TYPES.POST,
          targetId: post._id.toString(),
          reason: REPORT_REASONS.SPAM,
        },
      });
      assert.equal(postResolutionReport.status, 201);
    });

    it('enforces moderationRateLimiter (429), reportRateLimiter (429), and recursive audit state redaction', async () => {
      const admin = seedAdmin();
      const reporter = seedTourist('flood@example.com');
      const author = seedTourist('author2@example.com');

      // Exhaust reportRateLimiter (max 15 in test, 20 in dev)
      let hitReport429 = false;
      for (let i = 0; i < 25; i += 1) {
        const post = seedPost(author.id, {
          status: POST_STATUSES.PUBLISHED,
          publishedAt: new Date(),
        });
        const r = await dispatchRequest<TestApiResponse>(app, {
          method: 'POST',
          url: '/api/v1/tourist/reports',
          headers: { authorization: `Bearer ${reporter.token}` },
          body: {
            targetType: REPORT_TARGET_TYPES.POST,
            targetId: post._id.toString(),
            reason: REPORT_REASONS.SPAM,
          },
        });
        if (r.status === 429) {
          hitReport429 = true;
          assert.equal(r.body.error?.code, 'TOO_MANY_REQUESTS');
          break;
        }
        assert.equal(r.status, 201);
      }
      assert.equal(hitReport429, true);

      // Exhaust moderationRateLimiter (max 20 in test, 60 in dev)
      let hitMod429 = false;
      for (let i = 0; i < 65; i += 1) {
        const post = seedPost(author.id, { status: POST_STATUSES.PENDING });
        const m = await dispatchRequest<TestApiResponse>(app, {
          method: 'PATCH',
          url: `/api/v1/admin/moderation/posts/${post._id.toString()}/approve`,
          headers: { authorization: `Bearer ${admin.token}` },
          body: {},
        });
        if (m.status === 429) {
          hitMod429 = true;
          assert.equal(m.body.error?.code, 'TOO_MANY_REQUESTS');
          break;
        }
        assert.equal(m.status, 200);
      }
      assert.equal(hitMod429, true);

      // Verify nested audit redaction removes secret fields
      const sanitized = sanitizeAuditStateSnapshot({
        status: 'PUBLISHED',
        passwordHash: 'secret-top',
        nested: {
          safeField: 'kept',
          token: 'secret-token',
          storageKey: 'private/key.jpg',
          deep: [{ accessToken: 'secret-access', label: 'visible' }],
        },
      });
      assert.equal(sanitized.status, 'PUBLISHED');
      assert.equal(sanitized.passwordHash, undefined);
      const nested = sanitized.nested as Record<string, unknown>;
      assert.equal(nested.safeField, 'kept');
      assert.equal(nested.token, undefined);
      assert.equal(nested.storageKey, undefined);
      const deepArr = nested.deep as Array<Record<string, unknown>>;
      assert.equal(deepArr[0].accessToken, undefined);
      assert.equal(deepArr[0].label, 'visible');
    });
  });
});
