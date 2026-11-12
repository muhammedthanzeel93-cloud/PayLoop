import { FollowUserSummaryDto } from '@kerala-tourism/shared-types';
import { FollowListQuery, UserIdParamInput } from './follow.validation';

export type { FollowListQuery, UserIdParamInput };

export interface FollowListQueryOptions {
  page: number;
  limit: number;
}

export interface FollowPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedFollowUsersResult {
  items: FollowUserSummaryDto[];
  pagination: FollowPaginationMeta;
}

export interface AdjustedFollowCounts {
  followerFollowingCount: number;
  followingFollowersCount: number;
}

export interface FollowEdgeRecord {
  id: string;
  accountId: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  bio?: string;
  followedAt: Date;
}
