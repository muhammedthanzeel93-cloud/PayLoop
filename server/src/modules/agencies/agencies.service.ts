import { AgenciesRepository, agenciesRepository } from './agencies.repository';

export class AgenciesService {
  constructor(private readonly repo: AgenciesRepository = agenciesRepository) {}

  public get repository(): AgenciesRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'agencies',
    };
  }
}

export const agenciesService = new AgenciesService();
