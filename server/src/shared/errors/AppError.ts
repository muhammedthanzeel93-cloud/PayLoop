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
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details, true);
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = 'Authentication required',
    codeOrDetails: string | unknown = 'UNAUTHORIZED',
    details?: unknown,
  ) {
    const code = typeof codeOrDetails === 'string' ? codeOrDetails : 'UNAUTHORIZED';
    const finalDetails = typeof codeOrDetails === 'string' ? details : codeOrDetails;
    super(message, 401, code, finalDetails, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'Access forbidden: Insufficient permissions',
    codeOrDetails: string | unknown = 'FORBIDDEN',
    details?: unknown,
  ) {
    const code = typeof codeOrDetails === 'string' ? codeOrDetails : 'FORBIDDEN';
    const finalDetails = typeof codeOrDetails === 'string' ? details : codeOrDetails;
    super(message, 403, code, finalDetails, true);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = 'Resource not found',
    codeOrDetails: string | unknown = 'NOT_FOUND',
    details?: unknown,
  ) {
    const code = typeof codeOrDetails === 'string' ? codeOrDetails : 'NOT_FOUND';
    const finalDetails = typeof codeOrDetails === 'string' ? details : codeOrDetails;
    super(message, 404, code, finalDetails, true);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details, true);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details, false);
  }
}
