import { z } from 'zod';

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1),
  propertyId: z.string().optional(),
  content: z.string().min(1).max(2000),
  attachments: z.array(z.string().url()).optional(),
});
