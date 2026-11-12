import { BookingModel, IBookingDocument } from './bookings.model';
import { CreateBookingDto, BookingQueryFilter } from './bookings.types';

export class BookingsRepository {
  public async findById(id: string): Promise<IBookingDocument | null> {
    return BookingModel.findById(id);
  }

  public async findByBookingNumber(bookingNumber: string): Promise<IBookingDocument | null> {
    return BookingModel.findOne({ bookingNumber });
  }

  public async create(data: CreateBookingDto): Promise<IBookingDocument> {
    const bookingNumber = `KL-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    return BookingModel.create({ ...data, bookingNumber });
  }

  public async list(filter: BookingQueryFilter = {}): Promise<IBookingDocument[]> {
    const query: Record<string, unknown> = {};
    if (filter.touristId) query.touristId = filter.touristId;
    if (filter.propertyId) query.propertyId = filter.propertyId;
    if (filter.status) query.status = filter.status;
    return BookingModel.find(query).limit(filter.limit || 20);
  }
}

export const bookingsRepository = new BookingsRepository();
