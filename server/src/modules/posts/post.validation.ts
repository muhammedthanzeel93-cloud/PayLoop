import { Types } from 'mongoose';
import { z } from 'zod';
import {
  POST_VISIBILITIES,
  POST_STATUSES,
  POST_RULES,
} from '@kerala-tourism/constants';
import { ValidationError } from '../../shared/errors/AppError';

export const objectIdSchema = z
  .string({ required_error: 'ID is required' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const postIdParamSchema = z
  .object({
    postId: objectIdSchema,
  })
  .strict({ message: 'Unrecognized route parameters' });

export type PostIdParamInput = z.infer<typeof postIdParamSchema>;

export const createPostSchema = z
  .object({
    content: z
      .string({ required_error: 'Post content is required' })
      .trim()
      .min(
        POST_RULES.MIN_CONTENT_LENGTH,
        `Post content must be at least ${POST_RULES.MIN_CONTENT_LENGTH} character`,
      )
      .max(
        POST_RULES.MAX_CONTENT_LENGTH,
        `Post content cannot exceed ${POST_RULES.MAX_CONTENT_LENGTH} characters`,
      ),
    mediaIds: z
      .array(objectIdSchema)
      .max(
        POST_RULES.MAX_MEDIA_PER_POST,
        `A post cannot contain more than ${POST_RULES.MAX_MEDIA_PER_POST} media items`,
      )
      .optional()
      .default([]),
    destinationId: objectIdSchema.optional(),
    visibility: z
      .nativeEnum(POST_VISIBILITIES, {
        errorMap: () => ({ message: 'Invalid visibility value. Allowed values: PUBLIC, FOLLOWERS, PRIVATE' }),
      })
      .optional()
      .default(POST_VISIBILITIES.PUBLIC),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(
        POST_RULES.MIN_CONTENT_LENGTH,
        `Post content must be at least ${POST_RULES.MIN_CONTENT_LENGTH} character`,
      )
      .max(
        POST_RULES.MAX_CONTENT_LENGTH,
        `Post content cannot exceed ${POST_RULES.MAX_CONTENT_LENGTH} characters`,
      )
      .optional(),
    mediaIds: z
      .array(objectIdSchema)
      .max(
        POST_RULES.MAX_MEDIA_PER_POST,
        `A post cannot contain more than ${POST_RULES.MAX_MEDIA_PER_POST} media items`,
      )
      .optional(),
    destinationId: objectIdSchema.nullable().optional(),
    visibility: z
      .nativeEnum(POST_VISIBILITIES, {
        errorMap: () => ({ message: 'Invalid visibility value. Allowed values: PUBLIC, FOLLOWERS, PRIVATE' }),
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .refine(
    (data) =>
      data.content !== undefined ||
      data.mediaIds !== undefined ||
      data.destinationId !== undefined ||
      data.visibility !== undefined,
    {
      message: 'At least one updatable field (content, mediaIds, destinationId, visibility) must be provided',
    },
  );

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const publicPostsFeedQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(POST_RULES.MAX_FEED_LIMIT, `Limit cannot exceed ${POST_RULES.MAX_FEED_LIMIT}`)
      .optional()
      .default(POST_RULES.DEFAULT_FEED_LIMIT),
    destinationId: objectIdSchema.optional(),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type PublicPostsFeedQuery = z.infer<typeof publicPostsFeedQuerySchema>;

export const touristOwnPostsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(POST_RULES.MAX_FEED_LIMIT, `Limit cannot exceed ${POST_RULES.MAX_FEED_LIMIT}`)
      .optional()
      .default(POST_RULES.DEFAULT_FEED_LIMIT),
    visibility: z
      .nativeEnum(POST_VISIBILITIES, {
        errorMap: () => ({ message: 'Invalid visibility filter value' }),
      })
      .optional(),
    status: z
      .enum([POST_STATUSES.PENDING, POST_STATUSES.PUBLISHED, POST_STATUSES.REJECTED], {
        errorMap: () => ({ message: 'Invalid status filter value' }),
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type TouristOwnPostsQuery = z.infer<typeof touristOwnPostsQuerySchema>;

export interface DecodedFollowingFeedCursor {
  publishedAt: Date;
  id: Types.ObjectId;
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const encodeFollowingFeedCursor = (
  publishedAt: Date,
  id: string | Types.ObjectId,
): string => {
  const payload = JSON.stringify({
    p: publishedAt.toISOString(),
    id: id.toString(),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
};

export const decodeFollowingFeedCursor = (rawCursor: string): DecodedFollowingFeedCursor => {
  const invalidCursor = (reason: string): ValidationError =>
    new ValidationError('Invalid pagination cursor', [{ field: 'cursor', message: reason }]);

  if (
    typeof rawCursor !== 'string' ||
    rawCursor.length === 0 ||
    rawCursor.length > POST_RULES.MAX_CURSOR_LENGTH ||
    !BASE64URL_PATTERN.test(rawCursor)
  ) {
    throw invalidCursor('Cursor must be a valid base64url string');
  }

  let decodedJson: string;
  try {
    decodedJson = Buffer.from(rawCursor, 'base64url').toString('utf8');
  } catch {
    throw invalidCursor('Malformed cursor encoding');
  }

  // Reject non-canonical base64url trailing bits
  if (Buffer.from(decodedJson, 'utf8').toString('base64url') !== rawCursor) {
    throw invalidCursor('Non-canonical cursor encoding');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedJson);
  } catch {
    throw invalidCursor('Malformed cursor payload');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidCursor('Cursor payload must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !Object.hasOwn(record, 'p') || !Object.hasOwn(record, 'id')) {
    throw invalidCursor('Cursor payload contains invalid fields');
  }

  const rawPublishedAt = record.p;
  const rawId = record.id;

  if (typeof rawPublishedAt !== 'string' || typeof rawId !== 'string') {
    throw invalidCursor('Cursor fields must be strings');
  }

  if (!OBJECT_ID_PATTERN.test(rawId)) {
    throw invalidCursor('Cursor id must be a valid ObjectId');
  }

  const parsedMs = Date.parse(rawPublishedAt);
  if (Number.isNaN(parsedMs)) {
    throw invalidCursor('Cursor timestamp is invalid');
  }

  const publishedAt = new Date(parsedMs);
  if (Number.isNaN(publishedAt.getTime()) || publishedAt.toISOString() !== rawPublishedAt) {
    throw invalidCursor('Cursor timestamp must be a valid ISO-8601 UTC date');
  }

  return {
    publishedAt,
    id: new Types.ObjectId(rawId),
  };
};

export const followingFeedQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(POST_RULES.MAX_FEED_LIMIT, `Limit cannot exceed ${POST_RULES.MAX_FEED_LIMIT}`)
      .optional()
      .default(POST_RULES.DEFAULT_FOLLOWING_FEED_LIMIT),
    cursor: z
      .string({ invalid_type_error: 'Cursor must be a string' })
      .min(1, 'Cursor cannot be empty')
      .max(POST_RULES.MAX_CURSOR_LENGTH, 'Cursor exceeds maximum allowed length')
      .refine(
        (val) => {
          try {
            decodeFollowingFeedCursor(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: 'Invalid pagination cursor' },
      )
      .optional(),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type FollowingFeedQuery = z.infer<typeof followingFeedQuerySchema>;
