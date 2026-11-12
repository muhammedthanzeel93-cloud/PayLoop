import { PaymentsRepository, paymentsRepository } from './payments.repository';

export class PaymentsService {
  constructor(private readonly repo: PaymentsRepository = paymentsRepository) {}

  public get repository(): PaymentsRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'payments',
    };
  }
}

export const paymentsService = new PaymentsService();
