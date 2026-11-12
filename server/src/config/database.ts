import mongoose from 'mongoose';
import { HealthDatabaseStatus } from '../shared/types';
import { env } from './env';

/**
 * Sanitizes MongoDB connection string by removing credentials for safe logging.
 */
export const sanitizeMongoUri = (uri: string): string => {
  try {
    return uri.replace(/\/\/[^@]+@/, '//***:***@');
  } catch {
    return 'mongodb://***';
  }
};

export class Database {
  private static instance: Database;
  private isConnecting = false;

  private constructor() {
    this.registerEventListeners();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private registerEventListeners(): void {
    mongoose.connection.on('connected', () => {
      console.info('[MongoDB] Connection successfully established.');
    });

    mongoose.connection.on('error', (err: Error) => {
      console.error(`[MongoDB] Runtime connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Connection disconnected.');
    });

    mongoose.connection.on('reconnected', () => {
      console.info('[MongoDB] Reconnected to cluster.');
    });
  }

  /**
   * Connect to MongoDB.
   * Throws an error on initial failure so the application fails fast
   * and prevents accepting incoming requests without a healthy database.
   */
  public async connect(customUri?: string): Promise<void> {
    // Prevent duplicate connection attempts
    if (mongoose.connection.readyState === 1 || this.isConnecting) {
      return;
    }

    const uri = customUri || env.MONGO_URL || env.MONGODB_URI;
    this.isConnecting = true;

    try {
      console.info(`[MongoDB] Initiating connection to ${sanitizeMongoUri(uri)}...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown connection error';
      console.error(`[MongoDB] Connection failure: ${msg}`);
      throw new Error(`Database initial connection failed: ${msg}`);
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Graceful disconnection for server shutdown or test teardown.
   */
  public async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.info('[MongoDB] Connection closed cleanly.');
    }
  }

  /**
   * Safe status reporting for the health endpoint.
   * Never exposes credentials or internal connection strings.
   */
  public getSafeStatus(): HealthDatabaseStatus {
    const readyState = mongoose.connection.readyState;

    // ReadyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    let statusString: HealthDatabaseStatus['status'] = 'disconnected';
    if (readyState === 1) statusString = 'connected';
    else if (readyState === 2) statusString = 'connecting';
    else if (readyState === 3) statusString = 'disconnected';

    return {
      status: statusString,
      readyState,
      name: mongoose.connection.name || 'kerala_tourism',
      host: mongoose.connection.host ? `${mongoose.connection.host}:${mongoose.connection.port}` : undefined,
    };
  }
}

export const db = Database.getInstance();
