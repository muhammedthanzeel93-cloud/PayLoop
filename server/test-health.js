const { createApp } = require('./dist/server/src/loaders/app');
const { IncomingMessage, ServerResponse } = require('http');
const { Socket } = require('net');

const app = createApp();

function dispatch(method, url) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost' };

    const res = new ServerResponse(req);
    let rawBody = '';

    res.write = (chunk) => {
      if (chunk) rawBody += chunk.toString();
      return true;
    };

    res.end = (chunk) => {
      if (chunk) rawBody += chunk.toString();
      let parsed = rawBody;
      try {
        parsed = JSON.parse(rawBody);
      } catch {}
      resolve({ status: res.statusCode, body: parsed });
      return res;
    };

    app.handle(req, res);
    req.emit('end');
  });
}

async function runVerification() {
  console.log('[Verification] Initializing in-memory application verification...');

  try {
    // 1. Health Probe
    console.log('[Verification] Testing GET /api/v1/health ...');
    const healthRes = await dispatch('GET', '/api/v1/health');
    console.log(`[Verification] Health status HTTP ${healthRes.status}:`, JSON.stringify(healthRes.body, null, 2));

    // 2. 404 Probe
    console.log('[Verification] Testing GET /api/v1/invalid-route-test ...');
    const notFoundRes = await dispatch('GET', '/api/v1/invalid-route-test');
    console.log(`[Verification] 404 handler HTTP ${notFoundRes.status}:`, JSON.stringify(notFoundRes.body, null, 2));

    // 3. Module Placeholder Probe
    console.log('[Verification] Testing GET /api/v1/destinations ...');
    const destRes = await dispatch('GET', '/api/v1/destinations');
    console.log(`[Verification] Destinations module HTTP ${destRes.status}:`, JSON.stringify(destRes.body, null, 2));

    if (healthRes.status === 200 && notFoundRes.status === 404 && destRes.status === 200) {
      console.log('✅ ALL SERVER VERIFICATION CHECKS PASSED');
      process.exitCode = 0;
    } else {
      console.error('❌ VERIFICATION CHECKS FAILED');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[Verification Fatal Error]:', err);
    process.exitCode = 1;
  }
}

runVerification();
