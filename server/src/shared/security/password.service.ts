import argon2 from 'argon2';

export interface Argon2Options {
  type: 0 | 1 | 2;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/**
 * OWASP Recommended Argon2id Configuration for high-security environments
 * - Memory Cost: 64 MB (65,536 KiB)
 * - Time Cost: 3 iterations
 * - Parallelism: 4 threads
 */
export const DEFAULT_ARGON2_OPTIONS: Argon2Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export class PasswordService {
  constructor(private readonly options: Argon2Options = DEFAULT_ARGON2_OPTIONS) {}

  /**
   * Hashes a plaintext password using Argon2id.
   * Throws if password is empty or invalid.
   */
  public async hash(password: string): Promise<string> {
    if (!password || typeof password !== 'string' || password.length === 0) {
      throw new Error('Password must be a non-empty string');
    }

    return argon2.hash(password, {
      type: this.options.type,
      memoryCost: this.options.memoryCost,
      timeCost: this.options.timeCost,
      parallelism: this.options.parallelism,
    });
  }

  /**
   * Verifies a plaintext password against an Argon2 hash in constant time.
   */
  public async verify(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}

export const passwordService = new PasswordService();
