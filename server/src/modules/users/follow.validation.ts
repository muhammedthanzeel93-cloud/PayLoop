import { z } from 'zod';
import { FOLLOW_RULES } from '@kerala-tourism/constants';
import { objectIdSchema } from '../posts/post.validation';

export const userIdParamSchema = z
  .object({
    userId: objectIdSchema,
  })
  .strict({ message: 'Unrecognized route parameters' });

export type UserIdParamInput = z.infer<typeof userIdParamSchema>;

export const followActionBodySchema = z
  .object({})
  .strict({ message: 'Request body must not contain identity, counter, or unrecognized fields' })
  .optional()
  .default({});

export const followListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(
        FOLLOW_RULES.MAX_LIST_LIMIT,
        `Limit cannot exceed ${FOLLOW_RULES.MAX_LIST_LIMIT}`,
      )
      .optional()
      .default(FOLLOW_RULES.DEFAULT_LIST_LIMIT),
  })
  .strict({ message: 'Unrecognized query parameters' });

export type FollowListQuery = z.infer<typeof followListQuerySchema>;
