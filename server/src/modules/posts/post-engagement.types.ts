import { Types } from 'mongoose';
import {
  PostCommentDto,
  PostCommentStatus,
} from '@kerala-tourism/shared-types';
import {
  CommentIdParamInput,
  CreateCommentInput,
  PostCommentsQuery,
  UpdateCommentInput,
} from './post-engagement.validation';

export type {
  CommentIdParamInput,
  CreateCommentInput,
  PostCommentsQuery,
  UpdateCommentInput,
};

export interface CreateCommentPersistenceInput {
  postId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
}

export interface FindPostCommentsOptions {
  page: number;
  limit: number;
}

export interface CommentPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedCommentsResult {
  items: PostCommentDto[];
  pagination: CommentPaginationMeta;
}

export interface CreateCommentResult {
  comment: PostCommentDto;
  commentsCount: number;
}

export interface DeleteCommentResult {
  id: string;
  postId: string;
  status: PostCommentStatus;
  deletedAt: string;
  commentsCount: number;
}

export type PostCounterField = 'likesCount' | 'commentsCount' | 'repostsCount';
