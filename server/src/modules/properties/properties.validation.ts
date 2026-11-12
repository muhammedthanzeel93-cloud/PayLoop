import { z } from 'zod';

export const createPropertySchema = z.object({
  name: z.string().min(3).max(150),
  category: z.enum(['HOMESTAY', 'HOTEL', 'RESORT', 'HOUSEBOAT']),
  district: z.string().min(2),
  address: z.string().min(5),
  amenities: z.array(z.string()).min(1),
  supportsHourly: z.boolean().default(false),
  supportsDaily: z.boolean().default(true),
});

export const createRoomSchema = z.object({
  roomName: z.string().min(2).max(100),
  roomType: z.string().min(2),
  baseHourlyRate: z.number().positive().optional(),
  baseDailyRate: z.number().positive(),
  capacity: z.number().int().min(1).max(20),
  turnoverBufferMinutes: z.number().int().min(30).default(60),
});
