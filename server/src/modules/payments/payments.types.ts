export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'HELD_IN_ESCROW';

export interface CreatePaymentDto {
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: 'UPI' | 'CARD' | 'NETBANKING' | 'PAY_AT_PROPERTY';
}

export interface PaymentWebhookDto {
  transactionId: string;
  status: PaymentStatus;
  providerReference?: string;
}
