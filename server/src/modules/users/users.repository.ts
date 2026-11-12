import { UserModel, IUserDocument } from './users.model';
import { UserDto } from './users.types';

export class UsersRepository {
  public async findById(id: string): Promise<IUserDocument | null> {
    return UserModel.findById(id);
  }

  public async findByEmail(email: string): Promise<IUserDocument | null> {
    return UserModel.findOne({ email });
  }

  public async create(data: UserDto): Promise<IUserDocument> {
    return UserModel.create(data);
  }

  public async list(): Promise<IUserDocument[]> {
    return UserModel.find().limit(20);
  }
}

export const usersRepository = new UsersRepository();
