import { z } from 'zod';
import { USER_ROLES } from '@kerala-tourism/constants';

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
  role: z.nativeEnum(USER_ROLES).default(USER_ROLES.TOURIST),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
  avatarUrl: z.string().url().optional(),
});
