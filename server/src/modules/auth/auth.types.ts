import {
  TouristRegistrationInput,
  BusinessRegistrationInput,
  LoginInput,
  RefreshTokenInput,
} from '@kerala-tourism/validation';
import { AccountType, AccountStatus } from '@kerala-tourism/shared-types';

export type TouristRegistrationDto = TouristRegistrationInput;
export type BusinessRegistrationDto = BusinessRegistrationInput;
export type LoginDto = LoginInput;
export type RefreshTokenDto = RefreshTokenInput;

export interface SafeAccountResponse {
  id: string;
  email: string;
  accountType: AccountType | string;
  status: AccountStatus | string;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

export interface SafeTouristProfileResponse {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  bio?: string;
  phoneNumber?: string;
  preferredLanguage: string;
  followersCount?: number;
  followingCount?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SafeBusinessProfileResponse {
  id: string;
  accountId: string;
  businessName: string;
  businessType: string;
  contactNumber: string;
  verificationStatus: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SafeAdminProfileResponse {
  id: string;
  accountId: string;
  displayName: string;
  permissions: string[];
  adminLevel: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface RegistrationResult<TProfile> {
  account: SafeAccountResponse;
  profile: TProfile;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginResult {
  tokens: AuthTokens;
  account: SafeAccountResponse;
}

export interface CurrentAccountResult {
  account: SafeAccountResponse;
  profile: SafeTouristProfileResponse | SafeBusinessProfileResponse | SafeAdminProfileResponse | null;
}
