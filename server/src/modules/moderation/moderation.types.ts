import type { ClientSession, Types } from 'mongoose';
import type {
  AccountStatus,
  AccountType,
  DestinationPublicationStatus,
  DestinationSubmissionStatus,
  DestinationVerificationStatus,
  GeoPoint,
  KeralaDistrict,
  PostCommentStatus,
  PostStatus,
  PostVisibility,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '@kerala-tourism/shared-types';

export interface ModerationRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ModerationSubmissionLean {
  _id: Types.ObjectId;
  submittedBy: Types.ObjectId;
  name: string;
  description: string;
  categoryIds: Types.ObjectId[];
  district?: KeralaDistrict;
  submittedLocation: GeoPoint;
  submittedAddress: string;
  imageMediaIds: string[];
  submissionStatus: DestinationSubmissionStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  destinationId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationDestinationLean {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  district: KeralaDistrict;
  location: GeoPoint;
  address: string;
  verificationStatus: DestinationVerificationStatus;
  publicationStatus: DestinationPublicationStatus;
  verifiedBy?: Types.ObjectId;
}

export interface ModerationPostLean {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  mediaIds: Types.ObjectId[];
  destinationId?: Types.ObjectId | null;
  visibility: PostVisibility;
  status: PostStatus;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  moderatedBy?: Types.ObjectId | null;
  moderatedAt?: Date | null;
  moderationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationCommentLean {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  status: PostCommentStatus;
  deletedAt?: Date | null;
  moderatedBy?: Types.ObjectId | null;
  moderatedAt?: Date | null;
  moderationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportLean {
  _id: Types.ObjectId;
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reason: ReportReason;
  description?: string | null;
  status: ReportStatus;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  moderatorNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeCreatorAccountLean {
  _id: Types.ObjectId;
  accountType: AccountType;
  status: AccountStatus;
}

export interface VerifiedReportTargetResult {
  exists: boolean;
  ownerAccountId: string | null;
}

export interface CreateReportPersistenceInput {
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: Types.ObjectId;
  reason: ReportReason;
  description: string | null;
}

export interface DestinationTransitionParams {
  submissionId: string;
  nextStatus: DestinationSubmissionStatus;
  reviewedBy: Types.ObjectId;
  reviewedAt: Date;
  reviewNotes?: string;
  destinationId?: Types.ObjectId;
  session?: ClientSession;
}
