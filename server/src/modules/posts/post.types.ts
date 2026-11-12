import { Types } from 'mongoose';
import {
  PostVisibility,
  PostStatus,
  PostDto,
  CursorPaginationMeta,
} from '@kerala-tourism/shared-types';
import {
  CreatePostInput,
  UpdatePostInput,
  PublicPostsFeedQuery,
  TouristOwnPostsQuery,
  FollowingFeedQuery,
  DecodedFollowingFeedCursor,
} from './post.validation';

export type {
  CreatePostInput,
  UpdatePostInput,
  PublicPostsFeedQuery,
  TouristOwnPostsQuery,
  FollowingFeedQuery,
  DecodedFollowingFeedCursor,
};

export interface CreatePostPersistenceInput {
  authorId: Types.ObjectId;
  content: string;
  mediaIds: Types.ObjectId[];
  destinationId?: Types.ObjectId | null;
  visibility: PostVisibility;
  status: PostStatus;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

export interface UpdatePostPersistenceInput {
  content?: string;
  mediaIds?: Types.ObjectId[];
  destinationId?: Types.ObjectId | null;
  visibility?: PostVisibility;
}

export interface FindPublicFeedOptions {
  page: number;
  limit: number;
  destinationId?: string;
}

export interface FindAuthorPostsOptions {
  page: number;
  limit: number;
  visibility?: PostVisibility;
  status?: Exclude<PostStatus, 'REMOVED'>;
}

export interface PostPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedPostsResult {
  items: PostDto[];
  pagination: PostPaginationMeta;
}

export interface DeletePostResult {
  id: string;
  status: PostStatus;
  deletedAt: string;
}

export interface FindFollowingFeedOptions {
  limit: number;
  cursor?: DecodedFollowingFeedCursor;
}

export interface CursorPaginatedPostsResult {
  items: PostDto[];
  pagination: CursorPaginationMeta;
}
