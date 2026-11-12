import mongoose, { ClientSession, FilterQuery, Types } from 'mongoose';
import {
  DESTINATION_PUBLICATION_STATUSES,
  DESTINATION_SUBMISSION_STATUSES,
  DESTINATION_VERIFICATION_STATUSES,
  MODERATION_CONTENT_TYPES,
  POST_COMMENT_STATUSES,
  POST_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from '@kerala-tourism/constants';
import type {
  KeralaDistrict,
  ModerationContentType,
  ModerationCreatorSummaryDto,
  ModerationQueueItemDto,
  ReportStatus,
  ReportTargetType,
} from '@kerala-tourism/shared-types';
import { env } from '../../config/env';
import { AppError, InternalServerError } from '../../shared/errors/AppError';
import {
  AccountModel,
  AdminProfileModel,
  BusinessProfileModel,
  DestinationModel,
  DestinationSubmissionModel,
  IPostCommentDocument,
  IPostDocument,
  IReportDocument,
  PostCommentModel,
  PostModel,
  ReportModel,
  TouristProfileModel,
} from '../../shared/models';
import { IDestinationSubmissionDocument } from '../destinations/destination-submission.model';
import { SafeAdminProfileLean } from '../admin/admin.types';
import {
  AdminReportsQueryInput,
  ModerationCommentsQueryInput,
  ModerationDestinationsQueryInput,
  ModerationPostsQueryInput,
  ModerationQueueQueryInput,
  TouristReportsQueryInput,
} from './moderation.validation';
import {
  CreateReportPersistenceInput,
  DestinationTransitionParams,
  ModerationCommentLean,
  ModerationDestinationLean,
  ModerationPostLean,
  ModerationSubmissionLean,
  ReportLean,
  SafeCreatorAccountLean,
  VerifiedReportTargetResult,
} from './moderation.types';

const MAX_TX_RETRIES = 8;

const ACTIVE_REPORT_STATUSES: ReportStatus[] = [
  REPORT_STATUSES.PENDING,
  REPORT_STATUSES.UNDER_REVIEW,
];

const SAFE_ADMIN_PROFILE_PROJECTION =
  '_id accountId displayName adminLevel permissions mfaEnabled';

const isDuplicateKeyError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const maybeErr = err as { code?: number; cause?: { code?: number } };
  return maybeErr.code === 11000 || maybeErr.cause?.code === 11000;
};

const isTransientTransactionError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const maybeErr = err as {
    code?: number;
    errorLabels?: string[];
    hasErrorLabel?: (label: string) => boolean;
  };
  return (
    maybeErr.code === 112 ||
    maybeErr.errorLabels?.includes('TransientTransactionError') === true ||
    (typeof maybeErr.hasErrorLabel === 'function' &&
      maybeErr.hasErrorLabel('TransientTransactionError'))
  );
};

const isUnsupportedTransactionError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : '';
  return (
    message.includes('replica set member') ||
    message.includes('Transaction numbers are only allowed')
  );
};

export const buildCreatedAtRangeFilter = (options: {
  submissionDate?: string;
  submittedFrom?: string;
  submittedTo?: string;
}): { $gte?: Date; $lte?: Date } | undefined => {
  let gte: Date | undefined;
  let lte: Date | undefined;

  if (options.submissionDate) {
    const raw = options.submissionDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      gte = new Date(`${raw}T00:00:00.000Z`);
      lte = new Date(`${raw}T23:59:59.999Z`);
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        const dayStart = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));
        const dayEnd = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999));
        gte = dayStart;
        lte = dayEnd;
      }
    }
  }

  if (options.submittedFrom) {
    const parsedFrom = new Date(options.submittedFrom);
    if (!Number.isNaN(parsedFrom.getTime())) {
      gte = gte && gte > parsedFrom ? gte : parsedFrom;
    }
  }

  if (options.submittedTo) {
    const parsedTo = new Date(options.submittedTo);
    if (!Number.isNaN(parsedTo.getTime())) {
      lte = lte && lte < parsedTo ? lte : parsedTo;
    }
  }

  if (!gte && !lte) {
    return undefined;
  }

  return {
    ...(gte ? { $gte: gte } : {}),
    ...(lte ? { $lte: lte } : {}),
  };
};

export class ModerationRepository {
  /**
   * Executes multi-document writes inside a MongoDB ACID transaction with jittered WriteConflict retries.
   * Fails closed in production when replica-set transactions are unsupported.
   */
  public async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const requireTransactions =
      env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';

    for (let attempt = 1; attempt <= MAX_TX_RETRIES; attempt += 1) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const result = await fn(session);
        await session.commitTransaction();
        return result;
      } catch (txError: unknown) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }

        if (isUnsupportedTransactionError(txError)) {
          if (requireTransactions) {
            throw new InternalServerError(
              'Moderation mutations require a MongoDB replica set transaction topology',
              'TRANSACTION_REQUIRED',
            );
          }
          return await fn(undefined);
        }

        if (isTransientTransactionError(txError) && attempt < MAX_TX_RETRIES) {
          const jitterMs = 10 + Math.floor(Math.random() * 25);
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
          continue;
        }

        throw txError;
      } finally {
        await session.endSession();
      }
    }

    throw new InternalServerError(
      'Moderation transaction retries exhausted',
      'TRANSACTION_EXHAUSTED',
    );
  }

  public async findAdminProfileByAccountId(
    accountId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<SafeAdminProfileLean | null> {
    const query = AdminProfileModel.findOne({
      accountId: new Types.ObjectId(accountId.toString()),
    }).select(SAFE_ADMIN_PROFILE_PROJECTION);

    if (session) {
      query.session(session);
    }

    return query.lean<SafeAdminProfileLean | null>();
  }

  public async getActiveReportCountsByTarget(
    targetType: ReportTargetType,
    targetIds: Array<string | Types.ObjectId>,
  ): Promise<Map<string, number>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const objectIds = targetIds.map((id) => new Types.ObjectId(id.toString()));
    const rows = await ReportModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          targetType,
          targetId: { $in: objectIds },
          status: { $in: ACTIVE_REPORT_STATUSES },
        },
      },
      {
        $group: {
          _id: '$targetId',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(row._id.toString(), row.count);
    }
    return result;
  }

  public async getActiveReportedTargetIds(
    targetType: ReportTargetType,
    limit = 500,
  ): Promise<Types.ObjectId[]> {
    const rows = await ReportModel.aggregate<{ _id: Types.ObjectId }>([
      {
        $match: {
          targetType,
          status: { $in: ACTIVE_REPORT_STATUSES },
        },
      },
      {
        $group: {
          _id: '$targetId',
        },
      },
      {
        $limit: limit,
      },
    ]);

    return rows.map((row) => row._id);
  }

  /**
   * Batch-hydrates safe creator identity summaries without exposing email, passwordHash, or storageKeys.
   */
  public async hydrateCreators(
    accountIds: Array<string | Types.ObjectId>,
  ): Promise<Map<string, ModerationCreatorSummaryDto>> {
    const uniqueHex = Array.from(new Set(accountIds.map((id) => id.toString())));
    if (uniqueHex.length === 0) {
      return new Map();
    }

    const objectIds = uniqueHex.map((id) => new Types.ObjectId(id));
    const [accounts, touristProfiles, businessProfiles, adminProfiles] = await Promise.all([
      AccountModel.find({ _id: { $in: objectIds } })
        .select('_id accountType status')
        .lean<SafeCreatorAccountLean[]>(),
      TouristProfileModel.find({ accountId: { $in: objectIds } })
        .select('accountId firstName lastName')
        .lean<Array<{ accountId: Types.ObjectId; firstName: string; lastName: string }>>(),
      BusinessProfileModel.find({ accountId: { $in: objectIds } })
        .select('accountId businessName')
        .lean<Array<{ accountId: Types.ObjectId; businessName: string }>>(),
      AdminProfileModel.find({ accountId: { $in: objectIds } })
        .select('accountId displayName')
        .lean<Array<{ accountId: Types.ObjectId; displayName: string }>>(),
    ]);

    const displayNameMap = new Map<string, string>();
    for (const tp of touristProfiles) {
      displayNameMap.set(tp.accountId.toString(), `${tp.firstName} ${tp.lastName}`.trim());
    }
    for (const bp of businessProfiles) {
      displayNameMap.set(bp.accountId.toString(), bp.businessName);
    }
    for (const ap of adminProfiles) {
      displayNameMap.set(ap.accountId.toString(), ap.displayName);
    }

    const result = new Map<string, ModerationCreatorSummaryDto>();
    for (const acc of accounts) {
      const id = acc._id.toString();
      result.set(id, {
        id,
        accountType: acc.accountType,
        status: acc.status,
        displayName: displayNameMap.get(id) ?? `${acc.accountType} User`,
      });
    }

    return result;
  }

  // ==============================================================================
  // CENTRALIZED MODERATION QUEUE & SECTION LIST QUERIES
  // ==============================================================================

  public async findUnifiedModerationQueue(query: ModerationQueueQueryInput): Promise<{
    items: ModerationQueueItemDto[];
    total: number;
  }> {
    const dateRange = buildCreatedAtRangeFilter({
      submissionDate: query.submissionDate,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
    const creatorObjId = query.creatorAccountId
      ? new Types.ObjectId(query.creatorAccountId)
      : undefined;

    const targetTypes: ModerationContentType[] = query.contentType
      ? [query.contentType]
      : query.district
        ? [MODERATION_CONTENT_TYPES.DESTINATION]
        : [
            MODERATION_CONTENT_TYPES.DESTINATION,
            MODERATION_CONTENT_TYPES.POST,
            MODERATION_CONTENT_TYPES.COMMENT,
          ];

    const isSingleSource = targetTypes.length === 1;
    const skip = (query.page - 1) * query.limit;
    const boundedWindow = isSingleSource ? query.limit : query.page * query.limit;

    const fetchDestinationQueueSlice = async (): Promise<{
      rawItems: Array<{
        contentType: ModerationContentType;
        contentId: string;
        moderationStatus: string;
        creatorAccountId: string;
        district: KeralaDistrict | null;
        titleOrExcerpt: string;
        createdAt: Date;
        updatedAt: Date;
      }>;
      total: number;
    }> => {
      if (!targetTypes.includes(MODERATION_CONTENT_TYPES.DESTINATION)) {
        return { rawItems: [], total: 0 };
      }
      const allowedStatuses = Object.values(DESTINATION_SUBMISSION_STATUSES) as string[];
      if (query.moderationStatus && !allowedStatuses.includes(query.moderationStatus)) {
        return { rawItems: [], total: 0 };
      }

      const filter: FilterQuery<IDestinationSubmissionDocument> = {
        submissionStatus: query.moderationStatus ?? DESTINATION_SUBMISSION_STATUSES.PENDING,
      };
      if (query.district) filter.district = query.district;
      if (creatorObjId) filter.submittedBy = creatorObjId;
      if (dateRange) filter.createdAt = dateRange;

      const q = DestinationSubmissionModel.find(filter)
        .select('_id submittedBy name district submissionStatus createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(boundedWindow);
      if (isSingleSource) q.skip(skip);

      const [docs, total] = await Promise.all([
        q.lean<
          Array<{
            _id: Types.ObjectId;
            submittedBy: Types.ObjectId;
            name: string;
            district?: KeralaDistrict;
            submissionStatus: string;
            createdAt: Date;
            updatedAt: Date;
          }>
        >(),
        DestinationSubmissionModel.countDocuments(filter),
      ]);

      return {
        rawItems: docs.map((d) => ({
          contentType: MODERATION_CONTENT_TYPES.DESTINATION,
          contentId: d._id.toString(),
          moderationStatus: d.submissionStatus,
          creatorAccountId: d.submittedBy.toString(),
          district: d.district ?? null,
          titleOrExcerpt: d.name,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        total,
      };
    };

    const fetchPostQueueSlice = async (): Promise<{
      rawItems: Array<{
        contentType: ModerationContentType;
        contentId: string;
        moderationStatus: string;
        creatorAccountId: string;
        district: KeralaDistrict | null;
        titleOrExcerpt: string;
        createdAt: Date;
        updatedAt: Date;
      }>;
      total: number;
    }> => {
      if (!targetTypes.includes(MODERATION_CONTENT_TYPES.POST)) {
        return { rawItems: [], total: 0 };
      }
      const allowedStatuses = Object.values(POST_STATUSES) as string[];
      if (query.moderationStatus && !allowedStatuses.includes(query.moderationStatus)) {
        return { rawItems: [], total: 0 };
      }

      const filter: FilterQuery<IPostDocument> = {};
      if (query.moderationStatus) {
        filter.status = query.moderationStatus;
      } else {
        const activeReportedPostIds = await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.POST);
        filter.deletedAt = null;
        filter.$or = activeReportedPostIds.length
          ? [{ status: POST_STATUSES.PENDING }, { _id: { $in: activeReportedPostIds } }]
          : [{ status: POST_STATUSES.PENDING }];
      }
      if (creatorObjId) filter.authorId = creatorObjId;
      if (dateRange) filter.createdAt = dateRange;

      const q = PostModel.find(filter)
        .select('_id authorId content status createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(boundedWindow);
      if (isSingleSource) q.skip(skip);

      const [docs, total] = await Promise.all([
        q.lean<
          Array<{
            _id: Types.ObjectId;
            authorId: Types.ObjectId;
            content: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
          }>
        >(),
        PostModel.countDocuments(filter),
      ]);

      return {
        rawItems: docs.map((d) => ({
          contentType: MODERATION_CONTENT_TYPES.POST,
          contentId: d._id.toString(),
          moderationStatus: d.status,
          creatorAccountId: d.authorId.toString(),
          district: null,
          titleOrExcerpt: d.content.slice(0, 140),
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        total,
      };
    };

    const fetchCommentQueueSlice = async (): Promise<{
      rawItems: Array<{
        contentType: ModerationContentType;
        contentId: string;
        moderationStatus: string;
        creatorAccountId: string;
        district: KeralaDistrict | null;
        titleOrExcerpt: string;
        createdAt: Date;
        updatedAt: Date;
      }>;
      total: number;
    }> => {
      if (!targetTypes.includes(MODERATION_CONTENT_TYPES.COMMENT)) {
        return { rawItems: [], total: 0 };
      }
      const allowedStatuses = Object.values(POST_COMMENT_STATUSES) as string[];
      if (query.moderationStatus && !allowedStatuses.includes(query.moderationStatus)) {
        return { rawItems: [], total: 0 };
      }

      const activeReportedCommentIds = await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.COMMENT);
      if (!query.moderationStatus && activeReportedCommentIds.length === 0) {
        return { rawItems: [], total: 0 };
      }

      const filter: FilterQuery<IPostCommentDocument> = {};
      if (query.moderationStatus) {
        filter.status = query.moderationStatus;
      } else {
        filter._id = { $in: activeReportedCommentIds };
        filter.status = POST_COMMENT_STATUSES.ACTIVE;
        filter.deletedAt = null;
      }
      if (creatorObjId) filter.authorId = creatorObjId;
      if (dateRange) filter.createdAt = dateRange;

      const q = PostCommentModel.find(filter)
        .select('_id authorId content status createdAt updatedAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(boundedWindow);
      if (isSingleSource) q.skip(skip);

      const [docs, total] = await Promise.all([
        q.lean<
          Array<{
            _id: Types.ObjectId;
            authorId: Types.ObjectId;
            content: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
          }>
        >(),
        PostCommentModel.countDocuments(filter),
      ]);

      return {
        rawItems: docs.map((d) => ({
          contentType: MODERATION_CONTENT_TYPES.COMMENT,
          contentId: d._id.toString(),
          moderationStatus: d.status,
          creatorAccountId: d.authorId.toString(),
          district: null,
          titleOrExcerpt: d.content.slice(0, 140),
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        total,
      };
    };

    const [destRes, postRes, commentRes] = await Promise.all([
      fetchDestinationQueueSlice(),
      fetchPostQueueSlice(),
      fetchCommentQueueSlice(),
    ]);

    const total = destRes.total + postRes.total + commentRes.total;
    const combined = [...destRes.rawItems, ...postRes.rawItems, ...commentRes.rawItems];
    if (!isSingleSource) {
      combined.sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (diff !== 0) return diff;
        return b.contentId.localeCompare(a.contentId);
      });
    }

    const paged = isSingleSource ? combined : combined.slice(skip, skip + query.limit);

    const destIds = paged
      .filter((i) => i.contentType === MODERATION_CONTENT_TYPES.DESTINATION)
      .map((i) => i.contentId);
    const postIds = paged
      .filter((i) => i.contentType === MODERATION_CONTENT_TYPES.POST)
      .map((i) => i.contentId);
    const commentIds = paged
      .filter((i) => i.contentType === MODERATION_CONTENT_TYPES.COMMENT)
      .map((i) => i.contentId);

    const [creatorsMap, destReports, postReports, commentReports] = await Promise.all([
      this.hydrateCreators(paged.map((i) => i.creatorAccountId)),
      this.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.DESTINATION, destIds),
      this.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.POST, postIds),
      this.getActiveReportCountsByTarget(REPORT_TARGET_TYPES.COMMENT, commentIds),
    ]);

    const items: ModerationQueueItemDto[] = paged.map((row) => {
      const reportCountMap =
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
        creator: creatorsMap.get(row.creatorAccountId) ?? null,
        district: row.district,
        titleOrExcerpt: row.titleOrExcerpt,
        activeReportsCount: reportCountMap.get(row.contentId) ?? 0,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      };
    });

    return { items, total };
  }

  public async findDestinationsForModeration(query: ModerationDestinationsQueryInput): Promise<{
    items: ModerationSubmissionLean[];
    total: number;
  }> {
    const filter: FilterQuery<IDestinationSubmissionDocument> = {};
    if (query.status) filter.submissionStatus = query.status;
    if (query.district) filter.district = query.district;
    if (query.creatorAccountId) filter.submittedBy = new Types.ObjectId(query.creatorAccountId);
    const dateRange = buildCreatedAtRangeFilter({
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
    if (dateRange) filter.createdAt = dateRange;

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      DestinationSubmissionModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ModerationSubmissionLean[]>(),
      DestinationSubmissionModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  public async findPostsForModeration(query: ModerationPostsQueryInput): Promise<{
    items: ModerationPostLean[];
    total: number;
  }> {
    const filter: FilterQuery<IPostDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.creatorAccountId) filter.authorId = new Types.ObjectId(query.creatorAccountId);
    const dateRange = buildCreatedAtRangeFilter({
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
    });
    if (dateRange) filter.createdAt = dateRange;
    if (query.reportedOnly === 'true') {
      const reportedPostIds = await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.POST);
      if (reportedPostIds.length === 0) {
        return { items: [], total: 0 };
      }
      filter._id = { $in: reportedPostIds };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      PostModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ModerationPostLean[]>(),
      PostModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  public async findCommentsForModeration(query: ModerationCommentsQueryInput): Promise<{
    items: ModerationCommentLean[];
    total: number;
  }> {
    const filter: FilterQuery<IPostCommentDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.postId) filter.postId = new Types.ObjectId(query.postId);
    if (query.creatorAccountId) filter.authorId = new Types.ObjectId(query.creatorAccountId);
    if (query.reportedOnly === 'true') {
      const reportedCommentIds = await this.getActiveReportedTargetIds(REPORT_TARGET_TYPES.COMMENT);
      if (reportedCommentIds.length === 0) {
        return { items: [], total: 0 };
      }
      filter._id = { $in: reportedCommentIds };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      PostCommentModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ModerationCommentLean[]>(),
      PostCommentModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  // ==============================================================================
  // DESTINATION MODERATION PERSISTENCE
  // ==============================================================================

  public async findDestinationSubmissionById(
    submissionId: string,
    session?: ClientSession,
  ): Promise<ModerationSubmissionLean | null> {
    const q = DestinationSubmissionModel.findById(submissionId);
    if (session) q.session(session);
    return q.lean<ModerationSubmissionLean | null>();
  }

  public async claimPendingDestinationSubmissionAtomic(
    params: DestinationTransitionParams,
  ): Promise<ModerationSubmissionLean | null> {
    return DestinationSubmissionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(params.submissionId),
        submissionStatus: DESTINATION_SUBMISSION_STATUSES.PENDING,
      },
      {
        $set: {
          submissionStatus: params.nextStatus,
          reviewedBy: params.reviewedBy,
          reviewedAt: params.reviewedAt,
          ...(params.reviewNotes !== undefined ? { reviewNotes: params.reviewNotes } : {}),
          ...(params.destinationId ? { destinationId: params.destinationId } : {}),
        },
      },
      {
        new: true,
        runValidators: true,
        ...(params.session ? { session: params.session } : {}),
      },
    ).lean<ModerationSubmissionLean | null>();
  }

  public async attachDestinationIdToSubmission(
    submissionId: string,
    destinationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<ModerationSubmissionLean | null> {
    return DestinationSubmissionModel.findByIdAndUpdate(
      submissionId,
      { $set: { destinationId } },
      { new: true, ...(session ? { session } : {}) },
    ).lean<ModerationSubmissionLean | null>();
  }

  public async findDestinationById(
    destinationId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<ModerationDestinationLean | null> {
    const q = DestinationModel.findById(destinationId);
    if (session) q.session(session);
    return q.lean<ModerationDestinationLean | null>();
  }

  public async findDestinationBySlug(
    slug: string,
    session?: ClientSession,
  ): Promise<ModerationDestinationLean | null> {
    const q = DestinationModel.findOne({ slug: slug.toLowerCase().trim() });
    if (session) q.session(session);
    return q.lean<ModerationDestinationLean | null>();
  }

  public async createVerifiedDraftDestination(
    data: {
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
    },
    session?: ClientSession,
  ): Promise<ModerationDestinationLean> {
    const [created] = await DestinationModel.create(
      [
        {
          ...data,
          verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
          publicationStatus: DESTINATION_PUBLICATION_STATUSES.DRAFT,
        },
      ],
      session ? { session } : undefined,
    );
    return created.toObject() as unknown as ModerationDestinationLean;
  }

  public async updateDestinationAsVerifiedPreservingLifecycle(
    destinationId: string | Types.ObjectId,
    updates: {
      verifiedBy: Types.ObjectId;
      location?: ModerationDestinationLean['location'];
      district?: KeralaDistrict;
      address?: string;
    },
    session?: ClientSession,
  ): Promise<ModerationDestinationLean | null> {
    return DestinationModel.findByIdAndUpdate(
      destinationId,
      {
        $set: {
          verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
          verifiedBy: updates.verifiedBy,
          ...(updates.location ? { location: updates.location } : {}),
          ...(updates.district ? { district: updates.district } : {}),
          ...(updates.address ? { address: updates.address } : {}),
        },
      },
      {
        new: true,
        runValidators: true,
        ...(session ? { session } : {}),
      },
    ).lean<ModerationDestinationLean | null>();
  }

  // ==============================================================================
  // POST & COMMENT MODERATION PERSISTENCE
  // ==============================================================================

  public async findPostById(
    postId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<ModerationPostLean | null> {
    const q = PostModel.findById(postId);
    if (session) q.session(session);
    return q.lean<ModerationPostLean | null>();
  }

  public async transitionPostStatusAtomic(params: {
    postId: string;
    expectedStatus: string;
    nextStatus: string;
    moderatedBy: Types.ObjectId;
    moderatedAt: Date;
    moderationReason?: string | null;
    publishedAt?: Date | null;
    deletedAt?: Date | null;
    session?: ClientSession;
  }): Promise<ModerationPostLean | null> {
    const filter: FilterQuery<IPostDocument> = {
      _id: new Types.ObjectId(params.postId),
      status: params.expectedStatus,
      deletedAt: null,
    };

    const setUpdates: Record<string, unknown> = {
      status: params.nextStatus,
      moderatedBy: params.moderatedBy,
      moderatedAt: params.moderatedAt,
      ...(params.moderationReason !== undefined
        ? { moderationReason: params.moderationReason }
        : {}),
    };
    if (params.publishedAt !== undefined) {
      setUpdates.publishedAt = params.publishedAt;
    }
    if (params.deletedAt !== undefined) {
      setUpdates.deletedAt = params.deletedAt;
    }

    return PostModel.findOneAndUpdate(
      filter,
      { $set: setUpdates },
      {
        new: true,
        runValidators: true,
        ...(params.session ? { session: params.session } : {}),
      },
    ).lean<ModerationPostLean | null>();
  }

  public async findCommentById(
    commentId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<ModerationCommentLean | null> {
    const q = PostCommentModel.findById(commentId);
    if (session) q.session(session);
    return q.lean<ModerationCommentLean | null>();
  }

  public async transitionCommentStatusAtomic(params: {
    commentId: string;
    expectedStatus: string;
    requireNotDeleted?: boolean;
    nextStatus: string;
    deletedAt: Date | null;
    moderatedBy: Types.ObjectId;
    moderatedAt: Date;
    moderationReason?: string | null;
    session?: ClientSession;
  }): Promise<ModerationCommentLean | null> {
    const filter: FilterQuery<IPostCommentDocument> = {
      _id: new Types.ObjectId(params.commentId),
      status: params.expectedStatus,
    };
    if (params.requireNotDeleted) {
      filter.deletedAt = null;
    }

    return PostCommentModel.findOneAndUpdate(
      filter,
      {
        $set: {
          status: params.nextStatus,
          deletedAt: params.deletedAt,
          moderatedBy: params.moderatedBy,
          moderatedAt: params.moderatedAt,
          ...(params.moderationReason !== undefined
            ? { moderationReason: params.moderationReason }
            : {}),
        },
      },
      {
        new: true,
        runValidators: true,
        ...(params.session ? { session: params.session } : {}),
      },
    ).lean<ModerationCommentLean | null>();
  }

  public async adjustPostCommentsCount(
    postId: string | Types.ObjectId,
    delta: 1 | -1,
    session?: ClientSession,
  ): Promise<number> {
    const objectId = new Types.ObjectId(postId.toString());
    const filter: FilterQuery<IPostDocument> = { _id: objectId };
    if (delta < 0) {
      filter.commentsCount = { $gt: 0 };
    } else {
      filter.deletedAt = null;
      filter.status = { $ne: POST_STATUSES.REMOVED };
    }

    const updated = await PostModel.findOneAndUpdate(
      filter,
      { $inc: { commentsCount: delta } },
      { new: true, ...(session ? { session } : {}) },
    ).lean<{ commentsCount?: number } | null>();

    if (updated) {
      return Math.max(0, updated.commentsCount ?? 0);
    }

    const fallback = await PostModel.findById(objectId)
      .select('commentsCount')
      .session(session ?? null)
      .lean<{ commentsCount?: number } | null>();

    return Math.max(0, fallback?.commentsCount ?? 0);
  }

  // ==============================================================================
  // USER REPORTS PERSISTENCE
  // ==============================================================================

  public async verifyReportTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<VerifiedReportTargetResult> {
    const objectId = new Types.ObjectId(targetId);

    if (targetType === REPORT_TARGET_TYPES.ACCOUNT) {
      const acc = await AccountModel.findById(objectId).select('_id').lean<{ _id: Types.ObjectId } | null>();
      return acc
        ? { exists: true, ownerAccountId: acc._id.toString() }
        : { exists: false, ownerAccountId: null };
    }

    if (targetType === REPORT_TARGET_TYPES.DESTINATION) {
      const dest = await DestinationModel.findById(objectId)
        .select('_id createdBy')
        .lean<{ _id: Types.ObjectId; createdBy?: Types.ObjectId } | null>();
      return dest
        ? { exists: true, ownerAccountId: dest.createdBy?.toString() ?? null }
        : { exists: false, ownerAccountId: null };
    }

    if (targetType === REPORT_TARGET_TYPES.POST) {
      const post = await PostModel.findOne({
        _id: objectId,
        deletedAt: null,
        status: { $ne: POST_STATUSES.REMOVED },
      })
        .select('_id authorId')
        .lean<{ _id: Types.ObjectId; authorId: Types.ObjectId } | null>();
      return post
        ? { exists: true, ownerAccountId: post.authorId.toString() }
        : { exists: false, ownerAccountId: null };
    }

    const comment = await PostCommentModel.findOne({
      _id: objectId,
      deletedAt: null,
      status: POST_COMMENT_STATUSES.ACTIVE,
    })
      .select('_id authorId')
      .lean<{ _id: Types.ObjectId; authorId: Types.ObjectId } | null>();

    return comment
      ? { exists: true, ownerAccountId: comment.authorId.toString() }
      : { exists: false, ownerAccountId: null };
  }

  public async hasActiveReportByReporter(
    reporterId: string | Types.ObjectId,
    targetType: ReportTargetType,
    targetId: string | Types.ObjectId,
  ): Promise<boolean> {
    const existing = await ReportModel.findOne({
      reporterId: new Types.ObjectId(reporterId.toString()),
      targetType,
      targetId: new Types.ObjectId(targetId.toString()),
      status: { $in: ACTIVE_REPORT_STATUSES },
    })
      .select('_id')
      .lean<{ _id: Types.ObjectId } | null>();

    return Boolean(existing);
  }

  public async createReport(input: CreateReportPersistenceInput): Promise<ReportLean> {
    try {
      const created = await ReportModel.create({
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        description: input.description,
        status: REPORT_STATUSES.PENDING,
      });
      return created.toObject() as unknown as ReportLean;
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw new AppError(
          'You already have an active report against this content',
          409,
          'DUPLICATE_ACTIVE_REPORT',
        );
      }
      throw err;
    }
  }

  public async findReportsByReporter(
    reporterId: string,
    query: TouristReportsQueryInput,
  ): Promise<{ items: ReportLean[]; total: number }> {
    const filter: FilterQuery<IReportDocument> = {
      reporterId: new Types.ObjectId(reporterId),
    };
    if (query.status) filter.status = query.status;
    if (query.targetType) filter.targetType = query.targetType;

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      ReportModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ReportLean[]>(),
      ReportModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  public async findReportsForAdmin(query: AdminReportsQueryInput): Promise<{
    items: ReportLean[];
    total: number;
  }> {
    const filter: FilterQuery<IReportDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.reason) filter.reason = query.reason;

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      ReportModel.find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean<ReportLean[]>(),
      ReportModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  public async findReportById(
    reportId: string,
    session?: ClientSession,
  ): Promise<ReportLean | null> {
    const q = ReportModel.findById(reportId);
    if (session) q.session(session);
    return q.lean<ReportLean | null>();
  }

  public async transitionReportStatusAtomic(params: {
    reportId: string;
    allowedFromStatuses: ReportStatus[];
    nextStatus: ReportStatus;
    reviewedBy: Types.ObjectId;
    reviewedAt: Date;
    moderatorNotes?: string | null;
    session?: ClientSession;
  }): Promise<ReportLean | null> {
    return ReportModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(params.reportId),
        status: { $in: params.allowedFromStatuses },
      },
      {
        $set: {
          status: params.nextStatus,
          reviewedBy: params.reviewedBy,
          reviewedAt: params.reviewedAt,
          ...(params.moderatorNotes !== undefined
            ? { moderatorNotes: params.moderatorNotes }
            : {}),
        },
      },
      {
        new: true,
        runValidators: true,
        ...(params.session ? { session: params.session } : {}),
      },
    ).lean<ReportLean | null>();
  }
}

export const moderationRepository = new ModerationRepository();
