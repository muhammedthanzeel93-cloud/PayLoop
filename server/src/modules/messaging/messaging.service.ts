import { MessagingRepository, messagingRepository } from './messaging.repository';

export class MessagingService {
  constructor(private readonly repo: MessagingRepository = messagingRepository) {}

  public get repository(): MessagingRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'messaging',
    };
  }
}

export const messagingService = new MessagingService();
