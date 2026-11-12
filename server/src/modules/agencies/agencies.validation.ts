import { z } from 'zod';

export const createPackageSchema = z.object({
  title: z.string().min(5).max(150),
  durationDays: z.number().int().min(1).max(30),
  durationNights: z.number().int().min(0).max(30),
  pricePerPerson: z.number().positive(),
  inclusions: z.array(z.string()).min(1),
  maxGroupSize: z.number().int().min(1).max(100),
});
