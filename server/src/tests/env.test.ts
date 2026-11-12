import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../config/env';

test('Environment Validation - Valid Configurations', () => {
  const valid = parseEnv({
    PORT: '8080',
    NODE_ENV: 'production',
    MONGO_URL: 'mongodb://127.0.0.1:27017/kerala_production',
    CLIENT_URL: 'https://keralatourism.gov.in',
    CORS_ORIGINS: 'https://keralatourism.gov.in,https://admin.keralatourism.gov.in',
  });

  assert.strictEqual(valid.PORT, 8080, 'Port should be coerced to number 8080');
  assert.strictEqual(valid.NODE_ENV, 'production', 'Node env should match production');
  assert.strictEqual(valid.MONGO_URL, 'mongodb://127.0.0.1:27017/kerala_production');
  assert.strictEqual(valid.CLIENT_URL, 'https://keralatourism.gov.in');
  assert.ok(valid.CORS_ORIGINS.includes('https://keralatourism.gov.in'));
});

test('Environment Validation - Backward-Compatible Aliases', () => {
  const withAliases = parseEnv({
    PORT: '5000',
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/kerala_alias',
    CORS_ORIGIN: 'http://localhost:3000',
  });

  assert.strictEqual(withAliases.MONGO_URL, 'mongodb://127.0.0.1:27017/kerala_alias');
  assert.strictEqual(withAliases.CORS_ORIGINS, 'http://localhost:3000');
});

test('Environment Validation - Fail Fast on Invalid PORT', () => {
  assert.throws(
    () => {
      parseEnv({
        PORT: 'invalid-port-string',
        NODE_ENV: 'development',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('[EnvConfig Fatal Error]'));
      assert.ok(err.message.includes('PORT'));
      return true;
    },
  );
});

test('Environment Validation - Fail Fast on Invalid NODE_ENV', () => {
  assert.throws(
    () => {
      parseEnv({
        PORT: '5000',
        NODE_ENV: 'unsupported_environment',
      });
    },
    (err: Error) => {
      assert.ok(err.message.includes('[EnvConfig Fatal Error]'));
      assert.ok(err.message.includes('NODE_ENV'));
      return true;
    },
  );
});
