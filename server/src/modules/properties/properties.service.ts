import { PropertiesRepository, propertiesRepository } from './properties.repository';

export class PropertiesService {
  constructor(private readonly repo: PropertiesRepository = propertiesRepository) {}

  public get repository(): PropertiesRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'properties',
    };
  }
}

export const propertiesService = new PropertiesService();
