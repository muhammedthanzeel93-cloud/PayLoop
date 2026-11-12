import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  BUSINESS_TYPES,
  VERIFICATION_STATUSES,
  BUSINESS_DOCUMENT_TYPES,
  ADMIN_LEVELS,
  ADMIN_PERMISSIONS,
  PREFERRED_LANGUAGES,
} from '@kerala-tourism/constants';
import {
  AccountModel,
  SessionModel,
  TouristProfileModel,
  BusinessProfileModel,
  AdminProfileModel,
} from '../shared/models';

test('1. Account Model - Successful Creation & Default Attributes', async () => {
  const account = new AccountModel({
    email: 'traveler@keralatourism.org',
    passwordHash: '$2b$12$e8Y6bFj8vQ2w3E4r5T6y7u8I9o0P1a2S3d4F5g6H7j8K9l0Z1x2C3v',
    accountType: ACCOUNT_TYPES.TOURIST,
  });

  const validationError = account.validateSync();
  assert.strictEqual(validationError, undefined, 'Valid account document must pass validation');

  assert.strictEqual(account.status, ACCOUNT_STATUSES.ACTIVE, 'Default account status must be ACTIVE');
  assert.strictEqual(account.emailVerifiedAt, null, 'Default emailVerifiedAt must be null');
  assert.strictEqual(account.lastLoginAt, null, 'Default lastLoginAt must be null');

  // Verify toJSON and toObject security transform strips passwordHash
  const json = account.toJSON();
  assert.strictEqual(json.passwordHash, undefined, 'passwordHash must never be exposed in toJSON()');
  const obj = account.toObject();
  assert.strictEqual(obj.passwordHash, undefined, 'passwordHash must never be exposed in toObject()');
});

test('2. Account Model - Duplicate Email Prevention (Index Definition)', () => {
  const indexes = AccountModel.schema.indexes();
  const emailIndex = indexes.find(
    ([fields]) => 'email' in fields && fields.email === 1,
  );

  assert.ok(emailIndex, 'Account schema must declare an index on email');
  const [fields, options] = emailIndex;
  assert.strictEqual(fields.email, 1, 'Email index must be ascending');
  assert.strictEqual(options?.unique, true, 'Email index must strictly enforce unique constraint');
});

test('3. Account Model - Email Normalization', async () => {
  const rawEmail = '   Traveler.ARJUN@Example.Com   ';
  const expectedEmail = 'traveler.arjun@example.com';

  const account = new AccountModel({
    email: rawEmail,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehashedsecretvaluehere1234',
    accountType: ACCOUNT_TYPES.TOURIST,
  });

  // Trigger schema pre-validate hook
  await account.validate();

  assert.strictEqual(
    account.email,
    expectedEmail,
    'Email must be normalized to lowercase and trimmed prior to persistence',
  );
});

test('4. Account Model - Invalid Account Type Rejection & Password Security', () => {
  // Test invalid account type
  const invalidAccount = new AccountModel({
    email: 'test@example.com',
    passwordHash: '$2b$12$e8Y6bFj8vQ2w3E4r5T6y7u8I9o0P1a2S3d4F5g6H7j8K9l0Z1x2C3v',
    accountType: 'SUPERUSER' as unknown as typeof ACCOUNT_TYPES.TOURIST,
  });

  const err = invalidAccount.validateSync();
  assert.ok(err, 'Validation must fail on unrecognized account type');
  assert.ok(
    err.errors.accountType?.message.includes('Invalid account type'),
    'Validation error must identify invalid account type',
  );

  // Test rejection of raw unhashed password
  const plaintextAccount = new AccountModel({
    email: 'unhashed@example.com',
    passwordHash: 'mypassword123',
    accountType: ACCOUNT_TYPES.TOURIST,
  });
  const plainErr = plaintextAccount.validateSync();
  assert.ok(plainErr, 'Validation must reject raw plaintext password');
  assert.ok(
    plainErr.errors.passwordHash?.message.includes('securely hashed'),
    'Validation must require secure password hash format',
  );
});

test('5. TouristProfile Model - Creation & References', () => {
  const accountId = new mongoose.Types.ObjectId();
  const touristProfile = new TouristProfileModel({
    accountId,
    firstName: 'Arjun',
    lastName: 'Nair',
    bio: 'Wayanad coffee estate traveler and trekker',
    phoneNumber: '+919847012345',
  });

  const err = touristProfile.validateSync();
  assert.strictEqual(err, undefined, 'Valid tourist profile must pass validation');
  assert.strictEqual(touristProfile.preferredLanguage, PREFERRED_LANGUAGES.EN, 'Default language must be EN');
  assert.strictEqual(touristProfile.accountId.toString(), accountId.toString());

  // Test missing required firstName
  const incomplete = new TouristProfileModel({
    accountId,
    lastName: 'Nair',
  });
  const incompleteErr = incomplete.validateSync();
  assert.ok(incompleteErr?.errors.firstName, 'firstName must be required');
});

test('6. TouristProfile Model - Duplicate Profile Prevention (Index Definition)', () => {
  const indexes = TouristProfileModel.schema.indexes();
  const accountIdIndex = indexes.find(
    ([fields]) => 'accountId' in fields && fields.accountId === 1,
  );

  assert.ok(accountIdIndex, 'TouristProfile schema must declare an index on accountId');
  const [fields, options] = accountIdIndex;
  assert.strictEqual(fields.accountId, 1);
  assert.strictEqual(options?.unique, true, 'TouristProfile accountId index must enforce 1:1 uniqueness');
});

test('7. BusinessProfile Model - Verification Status & Vault Document Storage', () => {
  const accountId = new mongoose.Types.ObjectId();
  const business = new BusinessProfileModel({
    accountId,
    businessName: 'Vembanad Backwaters Luxury Houseboats',
    businessType: BUSINESS_TYPES.HOMESTAY,
    businessAddress: {
      street: 'Finishing Point Jetty Road',
      city: 'Alappuzha',
      district: 'Alappuzha',
      postalCode: '688013',
      state: 'Kerala',
    },
    contactNumber: '+914772245678',
    documents: [
      {
        documentType: BUSINESS_DOCUMENT_TYPES.TOURISM_LICENSE,
        storageKey: 'vault/kyc/2026/ktd-hb-license-8821.pdf',
        originalFileName: 'ktd_official_license.pdf',
        fileSize: 2048576,
        mimeType: 'application/pdf',
      },
    ],
  });

  const err = business.validateSync();
  assert.strictEqual(err, undefined, 'Valid business profile must pass validation');
  assert.strictEqual(
    business.verificationStatus,
    VERIFICATION_STATUSES.PENDING,
    'Default verification status must be PENDING',
  );

  // Verify rejection of public URLs in storageKey (Zero Public URL Rule)
  const insecureDocBusiness = new BusinessProfileModel({
    accountId,
    businessName: 'Insecure Stay',
    businessType: BUSINESS_TYPES.HOTEL,
    businessAddress: {
      street: 'Beach Road',
      city: 'Kovalam',
      district: 'Thiruvananthapuram',
      postalCode: '695527',
      state: 'Kerala',
    },
    contactNumber: '+914712345678',
    documents: [
      {
        documentType: BUSINESS_DOCUMENT_TYPES.GST_CERTIFICATE,
        storageKey: 'https://public-cdn.example.com/unprotected/gst.pdf',
        originalFileName: 'gst.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      },
    ],
  });

  const insecureErr = insecureDocBusiness.validateSync();
  assert.ok(insecureErr, 'Documents must reject public HTTP/HTTPS URLs');
  assert.ok(
    insecureErr.errors['documents.0.storageKey']?.message.includes('secure vault storage keys'),
    'Error message must enforce vault storage keys',
  );
});

test('8. AdminProfile Model - Permission Validation & Admin Level', () => {
  const accountId = new mongoose.Types.ObjectId();
  const validAdmin = new AdminProfileModel({
    accountId,
    displayName: 'District Officer Idukki',
    permissions: [
      ADMIN_PERMISSIONS.VERIFY_DESTINATIONS,
      ADMIN_PERMISSIONS.APPROVE_BUSINESSES,
    ],
    adminLevel: ADMIN_LEVELS.DISTRICT_OFFICER,
  });

  const err = validAdmin.validateSync();
  assert.strictEqual(err, undefined, 'Valid admin profile must pass validation');
  assert.strictEqual(validAdmin.mfaEnabled, false, 'Default mfaEnabled must be false');

  // Verify rejection of empty permissions
  const emptyPerms = new AdminProfileModel({
    accountId,
    displayName: 'Unauthorized Officer',
    permissions: [],
    adminLevel: ADMIN_LEVELS.MODERATOR,
  });
  const emptyErr = emptyPerms.validateSync();
  assert.ok(emptyErr?.errors.permissions, 'Empty permissions array must be rejected');

  // Verify rejection of fraudulent permission strings
  const fakePerms = new AdminProfileModel({
    accountId,
    displayName: 'Rogue Officer',
    permissions: ['GRANT_SUPER_POWERS' as unknown as typeof ADMIN_PERMISSIONS.MANAGE_USERS],
    adminLevel: ADMIN_LEVELS.MODERATOR,
  });
  const fakeErr = fakePerms.validateSync();
  assert.ok(fakeErr?.errors.permissions, 'Unrecognized permissions must be rejected');
});

test('9. Session Model - Expiration, TTL Index & Lifecycle State Helpers', () => {
  const accountId = new mongoose.Types.ObjectId();
  const validSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  // Active future session
  const activeSession = new SessionModel({
    accountId,
    refreshTokenHash: validSha256,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours in future
    deviceInformation: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      ipAddress: '103.24.12.55',
    },
  });

  assert.strictEqual(activeSession.isExpired(), false, 'Future session must not be expired');
  assert.strictEqual(activeSession.isRevoked(), false, 'New session must not be revoked');
  assert.strictEqual(activeSession.isValid(), true, 'Active session must be valid');

  // Revoke session
  activeSession.revoke();
  assert.strictEqual(activeSession.isRevoked(), true, 'Revoked session must report isRevoked true');
  assert.strictEqual(activeSession.isValid(), false, 'Revoked session must report isValid false');
  assert.ok(activeSession.revokedAt instanceof Date);

  // Expired session
  const expiredSession = new SessionModel({
    accountId,
    refreshTokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() - 1000), // 1 second in past
  });
  assert.strictEqual(expiredSession.isExpired(), true, 'Past session must report isExpired true');
  assert.strictEqual(expiredSession.isValid(), false, 'Expired session must report isValid false');

  // Verify TTL index configuration
  const indexes = SessionModel.schema.indexes();
  const ttlIndex = indexes.find(
    ([fields]) => 'expiresAt' in fields && fields.expiresAt === 1,
  );
  assert.ok(ttlIndex, 'Session schema must declare an index on expiresAt');
  const [, options] = ttlIndex;
  assert.strictEqual(options?.expireAfterSeconds, 0, 'TTL index must have expireAfterSeconds: 0');
});

test('10. Session Model - Cryptographic Token Hash Validation', () => {
  const accountId = new mongoose.Types.ObjectId();

  // Valid 64-char SHA-256 hash passes
  const valid = new SessionModel({
    accountId,
    refreshTokenHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    expiresAt: new Date(Date.now() + 60000),
  });
  assert.strictEqual(valid.validateSync(), undefined, 'Valid 64-character hex hash must pass');

  // Plaintext token rejected
  const plainSession = new SessionModel({
    accountId,
    refreshTokenHash: 'my-plaintext-refresh-token-xyz-12345',
    expiresAt: new Date(Date.now() + 60000),
  });
  const plainErr = plainSession.validateSync();
  assert.ok(plainErr?.errors.refreshTokenHash, 'Plaintext token must be rejected');

  // Truncated hash rejected
  const shortHash = new SessionModel({
    accountId,
    refreshTokenHash: 'abcdef123456',
    expiresAt: new Date(Date.now() + 60000),
  });
  const shortErr = shortHash.validateSync();
  assert.ok(shortErr?.errors.refreshTokenHash, 'Short hash must be rejected');
});
