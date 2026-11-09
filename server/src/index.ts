import { createApp } from './loaders/app';
import { startServer } from './loaders/server';

const main = async () => {
  try {
    const app = createApp();
    await startServer(app);
  } catch (err) {
    console.error('[Server Fatal Startup Error]:', err);
    process.exit(1);
  }
};

main();
