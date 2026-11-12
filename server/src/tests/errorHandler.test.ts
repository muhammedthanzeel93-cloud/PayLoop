import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
} from '../shared/errors/AppError';
import { errorHandler } from '../middlewares/errorHandler';
import { Request, Response } from 'express';

test('Error Hierarchy - Status Codes and Codes', () => {
  const valErr = new ValidationError('Bad request payload', { field: 'email' });
  assert.strictEqual(valErr.statusCode, 400);
  assert.strictEqual(valErr.code, 'VALIDATION_ERROR');
  assert.strictEqual(valErr.isOperational, true);

  const authErr = new UnauthorizedError('Token missing');
  assert.strictEqual(authErr.statusCode, 401);
  assert.strictEqual(authErr.code, 'UNAUTHORIZED');

  const forbErr = new ForbiddenError('Not an admin');
  assert.strictEqual(forbErr.statusCode, 403);
  assert.strictEqual(forbErr.code, 'FORBIDDEN');

  const notFoundErr = new NotFoundError('Destination not found');
  assert.strictEqual(notFoundErr.statusCode, 404);
  assert.strictEqual(notFoundErr.code, 'NOT_FOUND');

  const confErr = new ConflictError('Room already booked');
  assert.strictEqual(confErr.statusCode, 409);
  assert.strictEqual(confErr.code, 'CONFLICT');

  const internalErr = new InternalServerError('Database crash');
  assert.strictEqual(internalErr.statusCode, 500);
  assert.strictEqual(internalErr.code, 'INTERNAL_SERVER_ERROR');
  assert.strictEqual(internalErr.isOperational, false);
});

test('Centralized Error Handler - Formats AppError Response', () => {
  let capturedStatus = 0;
  let capturedJson: unknown = null;

  const mockReq = {} as Request;
  const mockRes = {
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(body: unknown) {
      capturedJson = body;
      return this;
    },
  } as unknown as Response;

  const customError = new AppError('Payment processing failed', 402, 'PAYMENT_REQUIRED', { gateway: 'Razorpay' });

  errorHandler(customError, mockReq, mockRes, () => {});

  assert.strictEqual(capturedStatus, 402);
  assert.deepStrictEqual(capturedJson, {
    success: false,
    error: {
      message: 'Payment processing failed',
      code: 'PAYMENT_REQUIRED',
      details: { gateway: 'Razorpay' },
    },
  });
});
