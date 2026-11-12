import { MediaMimeType } from '@kerala-tourism/shared-types';

export interface StorageUploadInput {
  filename: string;
  buffer: Buffer;
  mimeType: MediaMimeType;
  destinationId?: string;
}

export interface StorageUploadResult {
  storageKey: string;
  url: string;
  fileSizeBytes: number;
  mimeType: MediaMimeType;
}

export interface IStorageProvider {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  delete(storageKey: string): Promise<void>;
  getUrl(storageKey: string): string;
}

/**
 * Mock / Test Adapter for provider-independent media storage
 */
export class MockStorageProvider implements IStorageProvider {
  private storage: Map<string, { buffer: Buffer; mimeType: string }> = new Map();
  private baseUrl = 'https://cdn.keralatourism.org/media';

  public async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const timestamp = Date.now();
    const sanitizedFilename = input.filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    const folder = input.destinationId ? `destinations/${input.destinationId}` : 'general';
    const storageKey = `${folder}/${timestamp}-${sanitizedFilename}`;

    this.storage.set(storageKey, {
      buffer: input.buffer,
      mimeType: input.mimeType,
    });

    return {
      storageKey,
      url: `${this.baseUrl}/${storageKey}`,
      fileSizeBytes: input.buffer.length,
      mimeType: input.mimeType,
    };
  }

  public async delete(storageKey: string): Promise<void> {
    this.storage.delete(storageKey);
  }

  public getUrl(storageKey: string): string {
    return `${this.baseUrl}/${storageKey}`;
  }

  public getStoredCount(): number {
    return this.storage.size;
  }

  public clear(): void {
    this.storage.clear();
  }
}
