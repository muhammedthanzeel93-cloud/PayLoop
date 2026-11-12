import { BookingsRepository, bookingsRepository } from './bookings.repository';

export class BookingsService {
  constructor(private readonly repo: BookingsRepository = bookingsRepository) {}

  public get repository(): BookingsRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'bookings',
    };
  }
}

export const bookingsService = new BookingsService();
