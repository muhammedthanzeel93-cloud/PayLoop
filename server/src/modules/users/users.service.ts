import { UsersRepository, usersRepository } from './users.repository';

export class UsersService {
  constructor(private readonly repo: UsersRepository = usersRepository) {}

  public get repository(): UsersRepository {
    return this.repo;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'users',
    };
  }
}

export const usersService = new UsersService();
