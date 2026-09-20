import {
  ApiCompressionRequest,
  ApiCompressionResponse,
  ApiPrivacyScanRequest,
  ApiPrivacyScanResponse,
  ApiHealthResponse,
  ApiError
} from '@tokentrim/shared';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/v1';

class ApiClientError extends Error {
  constructor(public error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let errorData: ApiError;
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        code: 'HTTP_ERROR',
        message: `HTTP Error ${response.status}: ${response.statusText}`
      };
    }
    throw new ApiClientError(errorData);
  }

  return response.json();
}

export const api = {
  compress: async (request: ApiCompressionRequest, options?: RequestInit): Promise<ApiCompressionResponse> => {
    return fetchApi<ApiCompressionResponse>('/compressions', {
      ...options,
      method: 'POST',
      body: JSON.stringify(request)
    });
  },

  scanPrivacy: async (request: ApiPrivacyScanRequest, options?: RequestInit): Promise<ApiPrivacyScanResponse> => {
    return fetchApi<ApiPrivacyScanResponse>('/privacy/scan', {
      ...options,
      method: 'POST',
      body: JSON.stringify(request)
    });
  },

  checkHealth: async (): Promise<ApiHealthResponse> => {
    return fetchApi<ApiHealthResponse>('/health');
  }
};
