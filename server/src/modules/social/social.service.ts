import { SocialRepository, socialRepository } from './social.repository';

export class SocialService {
  constructor(private readonly repo: SocialRepository = socialRepository) {}

  public get repository(): SocialRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'social',
    };
  }
}

export const socialService = new SocialService();
