import { z } from 'zod';

export const createPostSchema = z.object({
  caption: z.string().min(1).max(1000),
  images: z.array(z.string().url()).min(1).max(10),
  locationTag: z.string().max(100).optional(),
  destinationId: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export const addCommentSchema = z.object({
  text: z.string().min(1).max(500),
});
