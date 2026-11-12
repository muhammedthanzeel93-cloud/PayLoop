import { z } from 'zod';

export const createPaymentSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3).default('INR'),
  paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'PAY_AT_PROPERTY']),
});
