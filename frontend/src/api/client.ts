import type { ApiResponse } from '../types';

const TOKEN_KEY = 'plantops_jwt_token';
const USER_KEY = 'plantops_jwt_user';

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  code?: string;
  details?: ApiErrorDetail[];
  fieldErrors?: Record<string, string>;

  constructor(message: string, code?: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;

    if (details && Array.isArray(details)) {
      this.fieldErrors = {};
      details.forEach((d) => {
        if (d.field) {
          this.fieldErrors![d.field] = d.message;
        }
      });
    }
  }
}

export const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
};

export const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  const apiBase = getApiBaseUrl().replace(/\/$/, '');

  if (url.startsWith('/')) {
    return `${apiBase}${url}`;
  }

  if (import.meta.env.VITE_API_BASE_URL && url.includes('/static/qr/')) {
    const filename = url.split('/static/qr/')[1];
    return `${apiBase}/static/qr/${filename}`;
  }

  return url;
};

export const getStoredToken = (): string => {
  return localStorage.getItem(TOKEN_KEY) || '';
};

export const getStoredUser = <T = unknown>(): T | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const setStoredAuth = (token: string, user: unknown): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearStoredAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  const token = getStoredToken();

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  try {
    const response = await fetch(url, { ...options, headers });

    let payload: ApiResponse<T>;
    try {
      payload = await response.json();
    } catch {
      payload = {
        success: false,
        data: null as unknown as T,
        error: { code: 'INVALID_JSON', message: 'Failed to parse server response.' },
      };
    }

    if (response.status === 401 && token) {
      clearStoredAuth();
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    if (!response.ok || !payload.success) {
      const details = payload.error?.details as ApiErrorDetail[] | undefined;
      const detailsMsg = details
        ?.map((item) => (item.field ? `${item.field}: ${item.message}` : item.message))
        .filter(Boolean)
        .join(' · ');

      const message = detailsMsg || payload.error?.message || `HTTP ${response.status} Request Failed`;
      throw new ApiError(message, payload.error?.code, details);
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new ApiError(error.message);
    }
    throw new ApiError('An unexpected network error occurred.');
  }
}
