import { PaymentModel, IPaymentDocument } from './payments.model';
import { CreatePaymentDto } from './payments.types';

export class PaymentsRepository {
  public async findByTransactionId(transactionId: string): Promise<IPaymentDocument | null> {
    return PaymentModel.findOne({ transactionId });
  }

  public async create(data: CreatePaymentDto): Promise<IPaymentDocument> {
    const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    return PaymentModel.create({ ...data, transactionId });
  }

  public async findByBookingId(bookingId: string): Promise<IPaymentDocument | null> {
    return PaymentModel.findOne({ bookingId });
  }
}

export const paymentsRepository = new PaymentsRepository();
