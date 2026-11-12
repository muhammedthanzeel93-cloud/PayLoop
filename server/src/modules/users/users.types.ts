import { UserRole } from '../../shared/types';

export interface UserDto {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isVerified?: boolean;
}

export interface UpdateUserDto {
  name?: string;
  phone?: string;
  avatarUrl?: string;
}
