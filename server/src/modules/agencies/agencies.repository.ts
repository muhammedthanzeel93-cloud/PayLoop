import { TourPackageModel, ITourPackageDocument } from './agencies.model';
import { CreateTourPackageDto } from './agencies.types';

export class AgenciesRepository {
  public async findById(id: string): Promise<ITourPackageDocument | null> {
    return TourPackageModel.findById(id);
  }

  public async create(data: CreateTourPackageDto): Promise<ITourPackageDocument> {
    return TourPackageModel.create(data);
  }

  public async listByAgency(agencyId: string): Promise<ITourPackageDocument[]> {
    return TourPackageModel.find({ agencyId });
  }
}

export const agenciesRepository = new AgenciesRepository();
