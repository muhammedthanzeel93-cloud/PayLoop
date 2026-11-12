import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '../shared/types';
import { env } from '../config/env';
import { AppError } from '../shared/errors/AppError';
import { ZodError } from 'zod';

export { AppError };

export const errorHandler = (
  err: Error | AppError | ZodError,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_SERVER_ERROR';

  // Production responses must NEVER expose internal stack traces or internal raw messages for non-operational errors
  const message =
    isAppError && err.isOperational
      ? err.message
      : env.NODE_ENV !== 'production'
        ? err.message
        : 'Internal Server Error';

  if (!isAppError || !err.isOperational) {
    console.error('[Unhandled Server Error]:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      details: isAppError ? err.details : undefined,
    },
  });
};
