import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../shared/errors/AppError';

export interface FieldValidationError {
  field: string;
  message: string;
}

const formatZodIssues = (error: ZodError, fallbackField: string): FieldValidationError[] => {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : fallbackField,
    message: issue.message,
  }));
};

const createValidator = <T>(target: 'body' | 'params' | 'query', schema: ZodSchema<T>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      return next(
        new ValidationError(
          'Validation failed',
          formatZodIssues(result.error as ZodError, target),
        ),
      );
    }

    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
};

/**
 * Express middleware that validates req.body against a Zod schema.
 * Replaces req.body with the sanitized/transformed data on success.
 * Forwards a standardized ValidationError (HTTP 400) on failure.
 */
export const validateBody = <T>(schema: ZodSchema<T>) => createValidator('body', schema);

/**
 * Express middleware that validates req.params against a Zod schema.
 */
export const validateParams = <T>(schema: ZodSchema<T>) => createValidator('params', schema);

/**
 * Express middleware that validates req.query against a Zod schema.
 */
export const validateQuery = <T>(schema: ZodSchema<T>) => createValidator('query', schema);
