import { createApiClient } from '@kerala-tourism/api-client';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000'; // 10.0.2.2 for Android emulator loopback

export const api = createApiClient({
  baseUrl: API_BASE_URL,
});
