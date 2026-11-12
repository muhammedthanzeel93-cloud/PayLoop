import mongoose, { ClientSession, Types } from 'mongoose';
import {
  AccountModel,
  IAccountDocument,
  TouristProfileModel,
  ITouristProfileDocument,
  BusinessProfileModel,
  IBusinessProfileDocument,
  AdminProfileModel,
  IAdminProfileDocument,
  SessionModel,
  ISessionDocument,
  PropertyModel,
  IPropertyDocument,
  TourPackageModel,
  ITourPackageDocument,
  PostModel,
  IPostDocument,
  BookingModel,
  IBookingDocument,
} from '../../shared/models';
import {
  AccountType,
  AccountStatus,
  BusinessType,
  VerificationStatus,
  IDeviceInformation,
  SessionRevocationReason,
} from '@kerala-tourism/shared-types';
import { ACCOUNT_TYPES } from '@kerala-tourism/constants';

export interface CreateAccountInput {
  email: string;
  passwordHash: string;
  accountType: AccountType;
  status?: AccountStatus;
}

export interface CreateTouristProfileInput {
  accountId: Types.ObjectId | string;
  firstName: string;
  lastName: string;
}

export interface CreateBusinessProfileInput {
  accountId: Types.ObjectId | string;
  businessName: string;
  businessType: BusinessType;
  contactNumber: string;
  verificationStatus?: VerificationStatus;
}

export interface CreateSessionInput {
  accountId: Types.ObjectId | string;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  deviceInformation?: IDeviceInformation;
}

export class AuthRepository {
  /**
   * Executes a callback within a MongoDB multi-document ACID transaction.
   * If a transaction error occurs due to non-replica-set standalone MongoDB (e.g. in basic test runs),
   * provides a graceful fallback while strictly maintaining transaction semantics on replica sets.
   */
  public async withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await mongoose.startSession();
    try {
      let result: T;
      try {
        session.startTransaction();
        result = await fn(session);
        await session.commitTransaction();
      } catch (txError: unknown) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }

        const errMessage = (txError as Error)?.message || '';
        if (
          errMessage.includes('replica set member') ||
          errMessage.includes('Transaction numbers are only allowed')
        ) {
          // Fallback for standalone test/dev instances without replica set
          result = await fn(session);
        } else {
          throw txError;
        }
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  public async findAccountByEmail(
    email: string,
    session?: ClientSession,
  ): Promise<IAccountDocument | null> {
    const query = AccountModel.findOne({ email: email.trim().toLowerCase() });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  /**
   * Finds an account by email explicitly selecting the passwordHash path for verification.
   */
  public async findAccountWithPassword(
    email: string,
    session?: ClientSession,
  ): Promise<IAccountDocument | null> {
    const query = AccountModel.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findAccountById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<IAccountDocument | null> {
    const query = AccountModel.findById(id);
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async updateLastLogin(
    accountId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    const query = AccountModel.updateOne(
      { _id: accountId },
      { $set: { lastLoginAt: new Date() } },
    );
    if (session) {
      query.session(session);
    }
    await query.exec();
  }

  public async createAccount(
    data: CreateAccountInput,
    session?: ClientSession,
  ): Promise<IAccountDocument> {
    const account = new AccountModel({
      email: data.email,
      passwordHash: data.passwordHash,
      accountType: data.accountType,
      status: data.status,
    });
    return account.save({ session });
  }

  public async createTouristProfile(
    data: CreateTouristProfileInput,
    session?: ClientSession,
  ): Promise<ITouristProfileDocument> {
    const profile = new TouristProfileModel({
      accountId: data.accountId,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    return profile.save({ session });
  }

  public async createBusinessProfile(
    data: CreateBusinessProfileInput,
    session?: ClientSession,
  ): Promise<IBusinessProfileDocument> {
    const profile = new BusinessProfileModel({
      accountId: data.accountId,
      businessName: data.businessName,
      businessType: data.businessType,
      contactNumber: data.contactNumber,
      verificationStatus: data.verificationStatus,
    });
    return profile.save({ session });
  }

  public async createSession(
    data: CreateSessionInput,
    session?: ClientSession,
  ): Promise<ISessionDocument> {
    const newSession = new SessionModel({
      accountId: data.accountId,
      refreshTokenHash: data.refreshTokenHash,
      familyId: data.familyId,
      expiresAt: data.expiresAt,
      deviceInformation: data.deviceInformation,
    });
    return newSession.save({ session });
  }

  public async findSessionByHash(
    refreshTokenHash: string,
    session?: ClientSession,
  ): Promise<ISessionDocument | null> {
    const query = SessionModel.findOne({ refreshTokenHash });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  /**
   * Atomically rotates a refresh session under concurrency guards.
   * Marks old session rotated and links the descendant token hash.
   * Returns null if old session is not active/valid, preventing concurrent duplicate descent.
   */
  public async rotateSessionAtomic(
    oldHash: string,
    newHash: string,
    familyId: string,
    expiresAt: Date,
    deviceInformation?: IDeviceInformation,
  ): Promise<ISessionDocument | null> {
    return this.withTransaction(async (session) => {
      const now = new Date();
      // Atomic condition: must match hash, must NOT be revoked, and must not be expired
      const oldSession = await SessionModel.findOneAndUpdate(
        {
          refreshTokenHash: oldHash,
          revokedAt: null,
          expiresAt: { $gt: now },
        },
        {
          $set: {
            revokedAt: now,
            revocationReason: 'ROTATED',
            replacedByTokenHash: newHash,
            lastUsedAt: now,
          },
        },
        { new: false, session },
      );

      if (!oldSession) {
        return null;
      }

      const newSession = new SessionModel({
        accountId: oldSession.accountId,
        refreshTokenHash: newHash,
        familyId,
        expiresAt,
        deviceInformation: deviceInformation || oldSession.deviceInformation,
      });

      return newSession.save({ session });
    });
  }

  /**
   * Revokes all active sessions in a session family (e.g. when reuse of an old token is detected).
   */
  public async revokeFamilySessions(
    familyId: string,
    reason: SessionRevocationReason | string = 'REUSE_DETECTED',
  ): Promise<number> {
    const result = await SessionModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revocationReason: reason } },
    );
    return result.modifiedCount;
  }

  /**
   * Revokes a specific session by refresh token hash (e.g. single-device logout).
   */
  public async revokeSessionByHash(
    refreshTokenHash: string,
    reason: SessionRevocationReason | string = 'LOGOUT',
  ): Promise<boolean> {
    const result = await SessionModel.updateOne(
      { refreshTokenHash, revokedAt: null },
      { $set: { revokedAt: new Date(), revocationReason: reason } },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Revokes all active sessions for an authenticated account (e.g. logout from all devices).
   */
  public async revokeAllAccountSessions(
    accountId: Types.ObjectId | string,
    reason: SessionRevocationReason | string = 'LOGOUT_ALL',
  ): Promise<number> {
    const result = await SessionModel.updateMany(
      { accountId, revokedAt: null },
      { $set: { revokedAt: new Date(), revocationReason: reason } },
    );
    return result.modifiedCount;
  }

  /**
   * Loads the polymorphic profile belonging to an account.
   */
  public async findProfileByAccountId(
    accountId: Types.ObjectId | string,
    accountType: AccountType | string,
    session?: ClientSession,
  ): Promise<ITouristProfileDocument | IBusinessProfileDocument | IAdminProfileDocument | null> {
    if (accountType === ACCOUNT_TYPES.TOURIST) {
      const q = TouristProfileModel.findOne({ accountId });
      if (session) q.session(session);
      return q.exec();
    }

    if (accountType === ACCOUNT_TYPES.BUSINESS) {
      const q = BusinessProfileModel.findOne({ accountId });
      if (session) q.session(session);
      return q.exec();
    }

    if (accountType === ACCOUNT_TYPES.ADMIN) {
      const q = AdminProfileModel.findOne({ accountId });
      if (session) q.session(session);
      return q.exec();
    }

    return null;
  }

  public async findAdminProfile(
    accountId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<IAdminProfileDocument | null> {
    const q = AdminProfileModel.findOne({ accountId });
    if (session) q.session(session);
    return q.exec();
  }

  public async findBusinessProfile(
    accountId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<IBusinessProfileDocument | null> {
    const q = BusinessProfileModel.findOne({ accountId });
    if (session) q.session(session);
    return q.exec();
  }

  public async findTouristProfile(
    accountId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ITouristProfileDocument | null> {
    const q = TouristProfileModel.findOne({ accountId });
    if (session) q.session(session);
    return q.exec();
  }

  public async updateTouristProfile(
    accountId: Types.ObjectId | string,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ITouristProfileDocument | null> {
    return TouristProfileModel.findOneAndUpdate(
      { accountId },
      { $set: data },
      { new: true, session },
    );
  }

  public async updateBusinessProfile(
    accountId: Types.ObjectId | string,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IBusinessProfileDocument | null> {
    return BusinessProfileModel.findOneAndUpdate(
      { accountId },
      { $set: data },
      { new: true, session },
    );
  }

  public async updateBusinessVerificationStatus(
    businessId: Types.ObjectId | string,
    status: VerificationStatus,
    session?: ClientSession,
  ): Promise<IBusinessProfileDocument | null> {
    return BusinessProfileModel.findByIdAndUpdate(
      businessId,
      { $set: { verificationStatus: status } },
      { new: true, session },
    );
  }

  // ============================================================================
  // Resource Access & Ownership Methods (Day 10)
  // ============================================================================

  public async createProperty(
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPropertyDocument> {
    const property = new PropertyModel(data);
    return property.save({ session });
  }

  public async findPropertyById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<IPropertyDocument | null> {
    const q = PropertyModel.findById(id);
    if (session) q.session(session);
    return q.exec();
  }

  public async updateProperty(
    id: Types.ObjectId | string,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPropertyDocument | null> {
    return PropertyModel.findByIdAndUpdate(id, { $set: data }, { new: true, session });
  }

  public async createTourPackage(
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ITourPackageDocument> {
    const pkg = new TourPackageModel(data);
    return pkg.save({ session });
  }

  public async findTourPackageById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ITourPackageDocument | null> {
    const q = TourPackageModel.findById(id);
    if (session) q.session(session);
    return q.exec();
  }

  public async updateTourPackage(
    id: Types.ObjectId | string,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ITourPackageDocument | null> {
    return TourPackageModel.findByIdAndUpdate(id, { $set: data }, { new: true, session });
  }

  public async createPost(
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPostDocument> {
    const post = new PostModel(data);
    return post.save({ session });
  }

  public async findPostById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<IPostDocument | null> {
    const q = PostModel.findById(id);
    if (session) q.session(session);
    return q.exec();
  }

  public async updatePost(
    id: Types.ObjectId | string,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPostDocument | null> {
    return PostModel.findByIdAndUpdate(id, { $set: data }, { new: true, session });
  }

  public async createBooking(
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IBookingDocument> {
    const booking = new BookingModel(data);
    return booking.save({ session });
  }

  public async findBookingById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<IBookingDocument | null> {
    const q = BookingModel.findById(id);
    if (session) q.session(session);
    return q.exec();
  }
}

export const authRepository = new AuthRepository();
