import mongoose from 'mongoose';
import { HealthDatabaseStatus } from '@kerala-tourism/shared-types';
import { env } from './env';

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

    mongoose.connection.on('error', (err) => {
      console.warn(`[MongoDB] Connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected.');
    });
  }

  public async connect(): Promise<void> {
    if (mongoose.connection.readyState === 1 || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      console.info('[MongoDB] Initiating connection...');
      await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 5000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown connection error';
      console.warn(`[MongoDB] Initial connection deferred (will retry in background): ${msg}`);
    } finally {
      this.isConnecting = false;
    }
  }

  public async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.info('[MongoDB] Connection closed.');
    }
  }

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
