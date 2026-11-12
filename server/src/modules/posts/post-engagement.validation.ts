import { z } from 'zod';
import { POST_ENGAGEMENT_RULES } from '@kerala-tourism/constants';
import { objectIdSchema } from './post.validation';

export const commentIdParamSchema = z
  .object({
    commentId: objectIdSchema,
  })
  .strict({ message: 'Unrecognized route parameters' });

export type CommentIdParamInput = z.infer<typeof commentIdParamSchema>;

const commentContentSchema = z
  .string({ required_error: 'Comment content is required' })
  .trim()
  .min(
    POST_ENGAGEMENT_RULES.MIN_COMMENT_LENGTH,
    `Comment content must be at least ${POST_ENGAGEMENT_RULES.MIN_COMMENT_LENGTH} character`,
  )
  .max(
    POST_ENGAGEMENT_RULES.MAX_COMMENT_LENGTH,
    `Comment content cannot exceed ${POST_ENGAGEMENT_RULES.MAX_COMMENT_LENGTH} characters`,
  );

export const createCommentSchema = z
  .object({
    content: commentContentSchema,
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z
  .object({
    content: commentContentSchema,
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const postCommentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(
        POST_ENGAGEMENT_RULES.MAX_COMMENTS_LIMIT,
        `Limit cannot exceed ${POST_ENGAGEMENT_RULES.MAX_COMMENTS_LIMIT}`,
      )
      .optional()
      .default(POST_ENGAGEMENT_RULES.DEFAULT_COMMENTS_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type PostCommentsQuery = z.infer<typeof postCommentsQuerySchema>;
