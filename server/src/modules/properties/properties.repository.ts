import { PropertyModel, IPropertyDocument } from './properties.model';
import { CreatePropertyDto } from './properties.types';

export class PropertiesRepository {
  public async findById(id: string): Promise<IPropertyDocument | null> {
    return PropertyModel.findById(id);
  }

  public async create(data: CreatePropertyDto): Promise<IPropertyDocument> {
    return PropertyModel.create(data);
  }

  public async list(filter: Record<string, unknown> = {}): Promise<IPropertyDocument[]> {
    return PropertyModel.find(filter).limit(20);
  }
}

export const propertiesRepository = new PropertiesRepository();
