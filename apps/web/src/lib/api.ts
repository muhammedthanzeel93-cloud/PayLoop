import { createApiClient } from '@kerala-tourism/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api = createApiClient({
  baseUrl: API_BASE_URL,
});
