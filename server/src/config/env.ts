import dotenv from 'dotenv';
import path from 'path';
import { envSchema, EnvConfig } from '@kerala-tourism/validation';

// Load .env from workspace root first, then local fallback
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const parseEnv = (): EnvConfig => {
  const result = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kerala_tourism',
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  });

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`[EnvConfig Error] Invalid environment configuration:\n${errorDetails}`);
    // In development, fall back gracefully to defaults instead of unhandled crash
    return {
      NODE_ENV: 'development',
      PORT: 5000,
      HOST: '0.0.0.0',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/kerala_tourism',
      CORS_ORIGIN: 'http://localhost:3000,http://localhost:3001,http://localhost:3002',
    };
  }

  return result.data;
};

export const env = parseEnv();
