import dotenv from 'dotenv';
import path from 'path';
import { envSchema, EnvConfig } from '@kerala-tourism/validation';

// Load .env from workspace root first, then local fallback
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const parseEnv = (overrideEnv?: Record<string, string | undefined>): EnvConfig => {
  const source = overrideEnv || process.env;
  const result = envSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    PORT: source.PORT,
    HOST: source.HOST,
    MONGO_URL: source.MONGO_URL,
    MONGODB_URI: source.MONGODB_URI,
    CLIENT_URL: source.CLIENT_URL,
    CORS_ORIGINS: source.CORS_ORIGINS,
    CORS_ORIGIN: source.CORS_ORIGIN,
    JWT_ACCESS_SECRET: source.JWT_ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: source.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN_DAYS: source.JWT_REFRESH_EXPIRES_IN_DAYS,
    JWT_ISSUER: source.JWT_ISSUER,
    JWT_AUDIENCE: source.JWT_AUDIENCE,
  });

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`[EnvConfig Fatal Error] Invalid environment configuration:\n${errorDetails}`);
  }

  return result.data;
};

export const env = parseEnv();
