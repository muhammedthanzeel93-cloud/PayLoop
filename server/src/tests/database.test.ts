import test from 'node:test';
import assert from 'node:assert/strict';
import { db, sanitizeMongoUri } from '../config/database';

test('Database Utility - Sanitize MongoDB URI Credentials', () => {
  const rawWithAuth = 'mongodb://app_user:SuperSecretPassword123@cluster0.abc.mongodb.net:27017/kerala_tourism';
  const sanitized = sanitizeMongoUri(rawWithAuth);

  assert.ok(!sanitized.includes('SuperSecretPassword123'), 'Sanitized URI must never contain password');
  assert.ok(!sanitized.includes('app_user'), 'Sanitized URI must not contain username');
  assert.strictEqual(sanitized, 'mongodb://***:***@cluster0.abc.mongodb.net:27017/kerala_tourism');

  const rawLocal = 'mongodb://127.0.0.1:27017/kerala_tourism';
  assert.strictEqual(sanitizeMongoUri(rawLocal), rawLocal, 'Local URI without credentials remains unchanged');
});

test('Database Connection - Safe Status Structure', () => {
  const status = db.getSafeStatus();

  assert.ok(['connected', 'connecting', 'disconnected'].includes(status.status));
  assert.strictEqual(typeof status.readyState, 'number');
  assert.strictEqual(status.name, 'kerala_tourism');

  // Verify no credentials leaked
  const statusString = JSON.stringify(status);
  assert.ok(!statusString.includes('password'));
});

test('Database Connection - Failure Handling on Unreachable Host', async () => {
  // Attempting to connect to an unreachable host with low timeout should throw
  const unreachableUri = 'mongodb://127.0.0.1:1/invalid_db?connectTimeoutMS=1000&serverSelectionTimeoutMS=1000';

  await assert.rejects(
    async () => {
      await db.connect(unreachableUri);
    },
    (err: Error) => {
      assert.ok(err.message.includes('Database initial connection failed'));
      return true;
    },
  );
});
