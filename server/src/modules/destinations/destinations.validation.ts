import { z } from 'zod';
import { coordinatesSchema } from '@kerala-tourism/validation';

export const createDestinationSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(2000),
  district: z.string().min(2),
  category: z.enum(['BACKWATERS', 'HILL_STATION', 'BEACH', 'HERITAGE', 'FOREST', 'CULTURE']),
  coordinates: coordinatesSchema,
  address: z.string().min(5),
  images: z.array(z.string().url()).min(1),
});
