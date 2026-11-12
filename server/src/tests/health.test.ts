import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../loaders/app';
import { dispatchRequest } from './testUtils';

test('Health Check API - GET /api/v1/health', async () => {
  const app = createApp();

  const res = await dispatchRequest<{
    success: boolean;
    data: {
      status: string;
      timestamp: string;
      environment: string;
      database: {
        status: string;
        readyState: number;
        name?: string;
        host?: string;
      };
      services: {
        api: string;
      };
    };
  }>(app, {
    method: 'GET',
    url: '/api/v1/health',
  });

  assert.strictEqual(res.status, 200, 'Health endpoint should return HTTP 200');
  assert.strictEqual(res.body.success, true, 'Response success should be true');
  assert.ok(
    ['healthy', 'degraded'].includes(res.body.data.status),
    `Expected status to be healthy or degraded, got: ${res.body.data.status}`,
  );
  assert.ok(res.body.data.timestamp, 'Timestamp must be present');
  assert.ok(!isNaN(Date.parse(res.body.data.timestamp)), 'Timestamp must be valid ISO date string');
  assert.ok(res.body.data.environment, 'Environment must be present');
  assert.ok(res.body.data.database, 'Database status object must be present');
  assert.ok(
    ['connected', 'connecting', 'disconnected'].includes(res.body.data.database.status),
    'Database status must be one of connected, connecting, disconnected',
  );
  assert.strictEqual(res.body.data.services.api, 'up', 'API service status should be up');

  // Security check: ensure no credentials appear anywhere in response text
  const responseText = res.rawBody;
  assert.ok(!responseText.includes('password'), 'Health response must never contain password');
  assert.ok(!responseText.includes('@'), 'Health response must not contain connection URI with auth credentials');
});
