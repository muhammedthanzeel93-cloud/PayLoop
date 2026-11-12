import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';

test('Unknown API Route - 404 Handler', async () => {
  const app = createApp();

  const res = await dispatchRequest<{
    success: boolean;
    error: {
      code: string;
      message: string;
    };
  }>(app, {
    method: 'GET',
    url: '/api/v1/non-existent-resource-endpoint',
  });

  assert.strictEqual(res.status, 404, 'Unknown endpoint should return HTTP 404');
  assert.strictEqual(res.body.success, false, 'Response success should be false');
  assert.strictEqual(res.body.error.code, 'NOT_FOUND', 'Error code should be NOT_FOUND');
  assert.ok(
    res.body.error.message.includes('Route not found'),
    `Error message should indicate missing route, got: ${res.body.error.message}`,
  );
});
