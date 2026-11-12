import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../../config/env';
import { IAccessTokenClaims, AuthenticatedPrincipal } from '@kerala-tourism/shared-types';
import { UnauthorizedError } from '../errors/AppError';

export interface AccessTokenPayloadInput {
  id: string;
  email: string;
  accountType: AuthenticatedPrincipal['accountType'];
  status: AuthenticatedPrincipal['status'];
}

export class JwtService {
  constructor(
    private readonly secret: string = env.JWT_ACCESS_SECRET,
    private readonly issuer: string = env.JWT_ISSUER,
    private readonly audience: string = env.JWT_AUDIENCE,
    private readonly expiresIn: string = env.JWT_ACCESS_EXPIRES_IN,
  ) {}

  /**
   * Signs a short-lived, tamper-proof JSON Web Token (JWT) for authentication.
   * Explicitly sets algorithm, issuer, audience, subject, and unique jti.
   */
  public signAccessToken(principal: AccessTokenPayloadInput, customExpiresIn?: string): string {
    const jti = crypto.randomUUID();

    const signOptions: SignOptions = {
      algorithm: 'HS256',
      subject: principal.id,
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: (customExpiresIn || this.expiresIn) as SignOptions['expiresIn'],
      jwtid: jti,
    };

    const payload = {
      email: principal.email,
      accountType: principal.accountType,
      status: principal.status,
      tokenType: 'access',
    };

    return jwt.sign(payload, this.secret, signOptions);
  }

  /**
   * Cryptographically verifies signature, audience, issuer, expiration, and tokenType.
   * Throws UnauthorizedError on signature failure, expiration, or invalid claims.
   */
  public verifyAccessToken(token: string): IAccessTokenClaims {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedError('Authentication token is missing or invalid', 'AUTHENTICATION_REQUIRED');
    }

    try {
      const verifyOptions: VerifyOptions = {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      };

      const decoded = jwt.verify(token, this.secret, verifyOptions) as unknown as IAccessTokenClaims;

      // Enforce strict token type checking
      if (decoded.tokenType !== 'access') {
        throw new UnauthorizedError('Invalid token type for access authentication', 'INVALID_TOKEN_TYPE');
      }

      return decoded;
    } catch (err: unknown) {
      if ((err as Error).name === 'TokenExpiredError') {
        throw new UnauthorizedError('Access token has expired', 'TOKEN_EXPIRED');
      }
      if ((err as Error).name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Invalid access token signature', 'INVALID_TOKEN');
      }
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError('Failed to verify access token', 'INVALID_TOKEN');
    }
  }

  /**
   * Generates a cryptographically secure 256-bit random hexadecimal string for refresh tokens.
   */
  public generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Computes a deterministic SHA-256 hexadecimal hash of a refresh token.
   * Never store raw refresh tokens in the database.
   */
  public hashRefreshToken(token: string): string {
    if (!token || typeof token !== 'string') {
      throw new Error('Refresh token must be a non-empty string');
    }
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const jwtService = new JwtService();
