import { API_ENDPOINTS } from '@kerala-tourism/constants';
import { ApiResponse, HealthResponse } from '@kerala-tourism/shared-types';

export interface ApiClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') || 'http://localhost:5000';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    };
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  private async request<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...this.defaultHeaders,
          ...init?.headers,
        },
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorData = data?.error;
        throw new ApiError(
          errorData?.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData?.code || 'HTTP_ERROR',
          errorData?.details,
        );
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(`Request timeout after ${this.timeoutMs}ms`, 408, 'TIMEOUT');
      }
      throw new ApiError(
        err instanceof Error ? err.message : 'Unknown network error',
        0,
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  // Health endpoint module
  public readonly health = {
    check: async (): Promise<ApiResponse<HealthResponse>> => {
      return this.request<ApiResponse<HealthResponse>>(API_ENDPOINTS.HEALTH, {
        method: 'GET',
      });
    },
  };

  // Generic HTTP helpers
  public async get<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  public async post<T>(
    endpoint: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    });
  }
}

// Default singleton instance
export const createApiClient = (options?: ApiClientOptions): ApiClient => new ApiClient(options);
