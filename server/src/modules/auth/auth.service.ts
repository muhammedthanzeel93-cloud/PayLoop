import crypto from 'node:crypto';
import { AuthRepository, authRepository } from './auth.repository';
import { PasswordService, passwordService } from '../../shared/security/password.service';
import { JwtService, jwtService } from '../../shared/security/jwt.service';
import {
  TouristRegistrationDto,
  BusinessRegistrationDto,
  RegistrationResult,
  SafeTouristProfileResponse,
  SafeBusinessProfileResponse,
  LoginDto,
  LoginResult,
  AuthTokens,
  CurrentAccountResult,
  SafeAccountResponse,
  SafeAdminProfileResponse,
} from './auth.types';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  VERIFICATION_STATUSES,
} from '@kerala-tourism/constants';
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError';
import { IDeviceInformation } from '@kerala-tourism/shared-types';
import { env } from '../../config/env';

// Dummy hash for constant-time verification when an email is not found (anti-enumeration)
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzdHJpbmc$5jE9H+K6YhFp3d4n9b5E1/4Xg9G4r7s2n3m5k6j8h7g';

export class AuthService {
  constructor(
    private repo: AuthRepository = authRepository,
    private readonly pwdService: PasswordService = passwordService,
    private jwt: JwtService = jwtService,
  ) {}

  public get repository(): AuthRepository {
    return this.repo;
  }

  public setRepository(repository: AuthRepository): void {
    this.repo = repository;
  }

  public get passwords(): PasswordService {
    return this.pwdService;
  }

  public get jwtService(): JwtService {
    return this.jwt;
  }

  public setJwtService(service: JwtService): void {
    this.jwt = service;
  }

  public async getStatus(): Promise<{ status: string; module: string }> {
    return {
      status: 'ready',
      module: 'auth',
    };
  }

  /**
   * Registers a new Tourist traveler account and initializes TouristProfile.
   * Atomically executed inside a MongoDB Transaction.
   */
  public async registerTourist(
    dto: TouristRegistrationDto,
  ): Promise<RegistrationResult<SafeTouristProfileResponse>> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Pre-check email uniqueness
    const existing = await this.repo.findAccountByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    // 2. Hash password securely with Argon2id
    const passwordHash = await this.pwdService.hash(dto.password);

    // 3. Provision Account + TouristProfile inside a transaction
    try {
      return await this.repo.withTransaction(async (session) => {
        const account = await this.repo.createAccount(
          {
            email: normalizedEmail,
            passwordHash,
            accountType: ACCOUNT_TYPES.TOURIST,
            status: ACCOUNT_STATUSES.ACTIVE,
          },
          session,
        );

        const profile = await this.repo.createTouristProfile(
          {
            accountId: account._id,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
          },
          session,
        );

        return {
          account: {
            id: account._id.toString(),
            email: account.email,
            accountType: account.accountType,
            status: account.status,
            createdAt: account.createdAt,
          },
          profile: {
            id: profile._id.toString(),
            accountId: profile.accountId.toString(),
            firstName: profile.firstName,
            lastName: profile.lastName,
            preferredLanguage: profile.preferredLanguage,
            createdAt: profile.createdAt,
          },
        };
      });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictError('An account with this email already exists');
      }
      throw err;
    }
  }

  /**
   * Registers a new Business merchant account and initializes BusinessProfile.
   * Verification status defaults strictly to PENDING.
   * Atomically executed inside a MongoDB Transaction.
   */
  public async registerBusiness(
    dto: BusinessRegistrationDto,
  ): Promise<RegistrationResult<SafeBusinessProfileResponse>> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Pre-check email uniqueness
    const existing = await this.repo.findAccountByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    // 2. Hash password securely with Argon2id
    const passwordHash = await this.pwdService.hash(dto.password);

    // 3. Provision Account + BusinessProfile inside a transaction
    try {
      return await this.repo.withTransaction(async (session) => {
        const account = await this.repo.createAccount(
          {
            email: normalizedEmail,
            passwordHash,
            accountType: ACCOUNT_TYPES.BUSINESS,
            status: ACCOUNT_STATUSES.ACTIVE,
          },
          session,
        );

        const profile = await this.repo.createBusinessProfile(
          {
            accountId: account._id,
            businessName: dto.businessName.trim(),
            businessType: dto.businessType,
            contactNumber: dto.contactNumber.trim(),
            verificationStatus: VERIFICATION_STATUSES.PENDING,
          },
          session,
        );

        return {
          account: {
            id: account._id.toString(),
            email: account.email,
            accountType: account.accountType,
            status: account.status,
            createdAt: account.createdAt,
          },
          profile: {
            id: profile._id.toString(),
            accountId: profile.accountId.toString(),
            businessName: profile.businessName,
            businessType: profile.businessType,
            contactNumber: profile.contactNumber,
            verificationStatus: profile.verificationStatus,
            createdAt: profile.createdAt,
          },
        };
      });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictError('An account with this email already exists');
      }
      throw err;
    }
  }

  /**
   * Authenticates user credentials, validates account status, and issues access & refresh tokens.
   * Employs constant-time password verification to prevent timing attack enumeration.
   */
  public async login(
    dto: LoginDto,
    deviceInfo?: IDeviceInformation,
  ): Promise<LoginResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Fetch account with passwordHash explicitly selected
    const account = await this.repo.findAccountWithPassword(normalizedEmail);

    if (!account) {
      // Execute dummy verify to normalize response timing against user enumeration
      await this.pwdService.verify(dto.password || '', DUMMY_ARGON2_HASH);
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // 2. Verify password securely with Argon2id
    const isPasswordValid = await this.pwdService.verify(
      dto.password || '',
      account.passwordHash || '',
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // 3. Verify Account Status
    if (account.status === ACCOUNT_STATUSES.SUSPENDED) {
      throw new ForbiddenError('Account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
    }

    if (account.status === ACCOUNT_STATUSES.DEACTIVATED) {
      throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }

    // 4. Generate Access Token (15 min)
    const accessToken = this.jwt.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });

    // 5. Generate Refresh Token & Persist Session Family
    const rawRefreshToken = this.jwt.generateRefreshToken();
    const refreshTokenHash = this.jwt.hashRefreshToken(rawRefreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await this.repo.createSession({
      accountId: account._id,
      refreshTokenHash,
      familyId,
      expiresAt,
      deviceInformation: deviceInfo,
    });

    // 6. Record last login timestamp
    await this.repo.updateLastLogin(account._id);

    return {
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
      },
      account: {
        id: account._id.toString(),
        email: account.email,
        accountType: account.accountType,
        status: account.status,
        emailVerifiedAt: account.emailVerifiedAt,
        lastLoginAt: new Date(),
        createdAt: account.createdAt,
      },
    };
  }

  /**
   * Refreshes access token and rotates refresh token.
   * If a previously rotated token is reused, automatically revokes the entire session family!
   */
  public async refreshToken(
    rawToken: string,
    deviceInfo?: IDeviceInformation,
  ): Promise<AuthTokens> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedError('Refresh token required', 'REFRESH_TOKEN_REQUIRED');
    }

    const tokenHash = this.jwt.hashRefreshToken(rawToken);
    const session = await this.repo.findSessionByHash(tokenHash);

    if (!session) {
      throw new UnauthorizedError('Session has expired or does not exist', 'SESSION_EXPIRED');
    }

    // Check if session is expired
    if (session.isExpired()) {
      throw new UnauthorizedError('Session has expired', 'SESSION_EXPIRED');
    }

    // Check if session has been revoked
    if (session.isRevoked()) {
      // Replay Detection: if revoked with 'ROTATED' or already replaced, this is token theft/replay!
      if (session.revocationReason === 'ROTATED' || session.replacedByTokenHash) {
        await this.repo.revokeFamilySessions(session.familyId, 'REUSE_DETECTED');
        throw new UnauthorizedError(
          'Token reuse detected. All active sessions in this family have been revoked.',
          'REVOKED_TOKEN_REUSE',
        );
      }

      throw new UnauthorizedError('Session has been revoked', 'SESSION_REVOKED');
    }

    // Verify associated account is active
    const account = await this.repo.findAccountById(session.accountId);
    if (!account) {
      throw new UnauthorizedError('Account associated with this session no longer exists', 'ACCOUNT_NOT_FOUND');
    }

    if (account.status !== ACCOUNT_STATUSES.ACTIVE) {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    // Generate new refresh token
    const newRawRefreshToken = this.jwt.generateRefreshToken();
    const newRefreshTokenHash = this.jwt.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    // Atomically rotate session
    const rotatedSession = await this.repo.rotateSessionAtomic(
      tokenHash,
      newRefreshTokenHash,
      session.familyId,
      newExpiresAt,
      deviceInfo,
    );

    if (!rotatedSession) {
      // Concurrent race: another request rotated this token simultaneously
      throw new UnauthorizedError('Concurrent refresh race detected or token already rotated', 'CONCURRENT_ROTATION_RACE');
    }

    // Issue new access token
    const newAccessToken = this.jwt.signAccessToken({
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Retrieves current account and dynamically resolves profile based on trusted accountType.
   */
  public async getMe(accountId: string): Promise<CurrentAccountResult> {
    const account = await this.repo.findAccountById(accountId);
    if (!account) {
      throw new NotFoundError('Account not found', 'ACCOUNT_NOT_FOUND');
    }

    const rawProfile = await this.repo.findProfileByAccountId(account._id, account.accountType);

    const safeAccount: SafeAccountResponse = {
      id: account._id.toString(),
      email: account.email,
      accountType: account.accountType,
      status: account.status,
      emailVerifiedAt: account.emailVerifiedAt,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
    };

    let safeProfile: SafeTouristProfileResponse | SafeBusinessProfileResponse | SafeAdminProfileResponse | null = null;

    if (rawProfile) {
      if (account.accountType === ACCOUNT_TYPES.TOURIST) {
        const tp = rawProfile as unknown as {
          _id: { toString(): string };
          accountId: { toString(): string };
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
        };
        safeProfile = {
          id: tp._id.toString(),
          accountId: tp.accountId.toString(),
          firstName: tp.firstName,
          lastName: tp.lastName,
          profileImage: tp.profileImage,
          bio: tp.bio,
          phoneNumber: tp.phoneNumber,
          preferredLanguage: tp.preferredLanguage,
          followersCount: typeof tp.followersCount === 'number' ? tp.followersCount : 0,
          followingCount: typeof tp.followingCount === 'number' ? tp.followingCount : 0,
          createdAt: tp.createdAt,
          updatedAt: tp.updatedAt,
        };
      } else if (account.accountType === ACCOUNT_TYPES.BUSINESS) {
        const bp = rawProfile as unknown as {
          _id: { toString(): string };
          accountId: { toString(): string };
          businessName: string;
          businessType: string;
          contactNumber: string;
          verificationStatus: string;
          createdAt: Date;
          updatedAt?: Date;
        };
        safeProfile = {
          id: bp._id.toString(),
          accountId: bp.accountId.toString(),
          businessName: bp.businessName,
          businessType: bp.businessType,
          contactNumber: bp.contactNumber,
          verificationStatus: bp.verificationStatus,
          createdAt: bp.createdAt,
          updatedAt: bp.updatedAt,
        };
      } else if (account.accountType === ACCOUNT_TYPES.ADMIN) {
        const ap = rawProfile as unknown as {
          _id: { toString(): string };
          accountId: { toString(): string };
          displayName: string;
          permissions: string[];
          adminLevel: string;
          createdAt: Date;
          updatedAt?: Date;
        };
        safeProfile = {
          id: ap._id.toString(),
          accountId: ap.accountId.toString(),
          displayName: ap.displayName,
          permissions: ap.permissions,
          adminLevel: ap.adminLevel,
          createdAt: ap.createdAt,
          updatedAt: ap.updatedAt,
        };
      }
    }

    return {
      account: safeAccount,
      profile: safeProfile,
    };
  }

  /**
   * Revokes the refresh session belonging to a refresh token (single device logout).
   */
  public async logout(rawToken?: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') {
      return;
    }
    const tokenHash = this.jwt.hashRefreshToken(rawToken);
    await this.repo.revokeSessionByHash(tokenHash, 'LOGOUT');
  }

  /**
   * Revokes all active refresh sessions for an authenticated account (logout from all devices).
   */
  public async logoutAll(accountId: string): Promise<{ revokedCount: number }> {
    const revokedCount = await this.repo.revokeAllAccountSessions(accountId, 'LOGOUT_ALL');
    return { revokedCount };
  }
}

export const authService = new AuthService();
