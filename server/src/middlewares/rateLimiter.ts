import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { env } from '../config/env';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: string;
}

const ipStore = new Map<string, RateLimitRecord>();

/**
 * Clean up expired IP entries every 5 minutes to prevent memory leaks
 */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipStore.entries()) {
    if (record.resetTime <= now) {
      ipStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Prevent cleanup timer from blocking process exit
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * In-Memory Sliding Window Rate Limiter Middleware
 */
export const createRateLimiter = (options: RateLimiterOptions = {}) => {
  const windowMs = options.windowMs ?? (15 * 60 * 1000); // 15 minutes default
  const max = options.max ?? (env.NODE_ENV === 'test' ? 1000 : 100); // 100 requests default
  const message = options.message ?? 'Too many requests from this IP, please try again later';

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, allow bypassing if requested via header
    if (env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    let record = ipStore.get(ip);
    if (!record || record.resetTime <= now) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      ipStore.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil(record.resetTime / 1000);

    // Set standard rate limit headers
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return next(new AppError(message, 429, 'TOO_MANY_REQUESTS', { retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) }));
    }

    next();
  };
};

export const rateLimiter = createRateLimiter();

/**
 * Dedicated registration rate limiter:
 * Restricts rapid user and merchant registrations to prevent abuse and credential stuffing.
 * 10 requests per 15 minutes (5 in test environment to test threshold).
 */
export const registrationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 5 : 10,
  message: 'Too many registration attempts from this IP, please try again later',
});

/**
 * Dedicated login rate limiter:
 * Limits rapid authentication attempts to prevent brute force and credential stuffing attacks.
 * 5 requests per 15 minutes per IP.
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts from this IP, please try again later',
});

/**
 * Dedicated refresh rate limiter:
 * Restricts rapid token refresh attempts.
 * 20 requests per 15 minutes per IP.
 */
export const refreshRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many token refresh requests from this IP, please try again later',
});

/**
 * Dedicated post creation rate limiter:
 * Prevents rapid spam posting and abuse on tourist post endpoints.
 * 20 requests per 15 minutes per IP.
 */
export const postCreationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many post creation attempts from this IP, please try again later',
});

/**
 * Dedicated social engagement rate limiter:
 * Prevents rapid spam liking, commenting, or reposting.
 * 60 requests per 15 minutes per IP.
 */
export const engagementRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many social engagement attempts from this IP, please try again later',
});

/**
 * Dedicated follow/unfollow rate limiter:
 * Prevents rapid spam follow/unfollow toggling and scraping abuse.
 * 60 requests per 15 minutes per IP.
 */
export const followRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many follow requests from this IP, please try again later',
});

export const resetRateLimiter = (): void => {
  ipStore.clear();
};
