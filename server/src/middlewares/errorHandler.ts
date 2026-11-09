import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '@kerala-tourism/shared-types';
import { env } from '../config/env';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
): void => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message = isAppError || env.NODE_ENV !== 'production' ? err.message : 'Internal Server Error';

  if (!isAppError) {
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
