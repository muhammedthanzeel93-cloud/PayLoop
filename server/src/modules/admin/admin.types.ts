import type { ClientSession, Types } from 'mongoose';
import { ADMIN_LEVELS } from '@kerala-tourism/constants';
import type {
  AccountStatus,
  AccountType,
  AdminLevel,
  AdminPermission,
  BusinessType,
  PreferredLanguage,
  VerificationStatus,
} from '@kerala-tourism/shared-types';

export const ADMIN_LEVEL_RANK: Record<AdminLevel, number> = {
  [ADMIN_LEVELS.SUPER_ADMIN]: 3,
  [ADMIN_LEVELS.DISTRICT_OFFICER]: 2,
  [ADMIN_LEVELS.MODERATOR]: 1,
};

export interface AdminRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SafeAccountLean {
  _id: Types.ObjectId;
  email: string;
  accountType: AccountType;
  status: AccountStatus;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeTouristProfileLean {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  firstName: string;
  lastName: string;
  preferredLanguage: PreferredLanguage;
  followersCount?: number;
  followingCount?: number;
}

export interface SafeBusinessProfileLean {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  businessName: string;
  businessType: BusinessType;
  contactNumber: string;
  verificationStatus: VerificationStatus;
  documents?: Array<{ mimeType?: string }>;
}

export interface SafeAdminProfileLean {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  displayName: string;
  adminLevel: AdminLevel;
  permissions: AdminPermission[];
  mfaEnabled: boolean;
}

export interface TransitionAccountStatusParams {
  targetId: Types.ObjectId | string;
  allowedCurrentStatuses: readonly AccountStatus[];
  nextStatus: AccountStatus;
  session?: ClientSession;
}
