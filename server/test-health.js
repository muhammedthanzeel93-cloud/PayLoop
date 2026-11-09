const http = require('http');
const { createApp } = require('./dist/server/src/loaders/app');

const app = createApp();
const PORT = 5000;
const server = http.createServer(app);

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[Verification] Server running at http://127.0.0.1:${PORT}`);
  
  try {
    // 1. Health Probe
    console.log('[Verification] Testing GET /api/v1/health ...');
    const healthRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/health`);
    const healthJson = await healthRes.json();
    console.log(`[Verification] Health status HTTP ${healthRes.status}:`, JSON.stringify(healthJson, null, 2));

    // 2. 404 Probe
    console.log('[Verification] Testing GET /api/v1/invalid-route-test ...');
    const notFoundRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/invalid-route-test`);
    const notFoundJson = await notFoundRes.json();
    console.log(`[Verification] 404 handler HTTP ${notFoundRes.status}:`, JSON.stringify(notFoundJson, null, 2));

    if (healthRes.status === 200 && notFoundRes.status === 404) {
      console.log('✅ ALL SERVER VERIFICATION CHECKS PASSED');
    } else {
      console.error('❌ VERIFICATION CHECKS FAILED');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[Verification Error]:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
