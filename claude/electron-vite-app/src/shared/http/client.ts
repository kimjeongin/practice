import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import {
  ApiResponse,
  ApiError,
  HttpClientConfig,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor
} from './types';

class HttpClient {
  private instance: AxiosInstance;

  constructor(config: HttpClientConfig = {}) {
    this.instance = axios.create({
      baseURL: config.baseURL || '',
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    this.setupInterceptors(config.interceptors);
  }

  private setupInterceptors(interceptors?: HttpClientConfig['interceptors']) {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add common request configurations
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Log outbound requests in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`, {
            params: config.params,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        console.error('[HTTP] Request error:', error);
        return Promise.reject(this.handleError(error));
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log successful responses in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[HTTP] ${response.status} ${response.config.url}`, response.data);
        }

        // Transform response data to standardized format
        response.data = this.transformResponse(response);
        return response;
      },
      (error: AxiosError) => {
        console.error('[HTTP] Response error:', error);
        return Promise.reject(this.handleError(error));
      }
    );

    // Apply custom interceptors if provided
    if (interceptors?.request) {
      interceptors.request.forEach((interceptor: RequestInterceptor) => {
        this.instance.interceptors.request.use(interceptor);
      });
    }

    if (interceptors?.response) {
      interceptors.response.forEach((interceptor: ResponseInterceptor) => {
        this.instance.interceptors.response.use(
          interceptor.onFulfilled,
          interceptor.onRejected
        );
      });
    }
  }

  private getAuthToken(): string | null {
    // This can be customized based on your auth strategy
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  private transformResponse<T>(response: AxiosResponse): ApiResponse<T> {
    // If response already has our standard format, use it
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
      return response.data as ApiResponse<T>;
    }

    // Otherwise, wrap it in our standard format
    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  }

  private handleError(error: AxiosError): ApiError {
    const apiError: ApiError = {
      success: false,
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    };

    if (error.response) {
      // Server responded with error status
      apiError.code = error.response.status;
      apiError.message = this.getErrorMessage(error.response);
      apiError.details = error.response.data;
    } else if (error.request) {
      // Network error
      apiError.message = 'Network error - please check your connection';
      apiError.code = 'NETWORK_ERROR';
    } else {
      // Request configuration error
      apiError.message = error.message || 'Request configuration error';
      apiError.code = 'REQUEST_ERROR';
    }

    return apiError;
  }

  private getErrorMessage(response: AxiosResponse): string {
    if (response.data && typeof response.data === 'object') {
      if (response.data.message) return response.data.message;
      if (response.data.error) return response.data.error;
    }

    switch (response.status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized - Please check your credentials';
      case 403:
        return 'Forbidden - You do not have permission';
      case 404:
        return 'Resource not found';
      case 422:
        return 'Validation error';
      case 500:
        return 'Internal server error';
      case 502:
        return 'Bad Gateway';
      case 503:
        return 'Service unavailable';
      default:
        return `HTTP Error ${response.status}`;
    }
  }

  // GET request
  async get<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.get<T>(url, config);
    return response.data as ApiResponse<T>;
  }

  // POST request
  async post<T = any, D = any>(url: string, data?: D, config?: RequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data as ApiResponse<T>;
  }

  // PUT request
  async put<T = any, D = any>(url: string, data?: D, config?: RequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data as ApiResponse<T>;
  }

  // DELETE request
  async delete<T = any>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.delete<T>(url, config);
    return response.data as ApiResponse<T>;
  }

  // PATCH request
  async patch<T = any, D = any>(url: string, data?: D, config?: RequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.patch<T>(url, data, config);
    return response.data as ApiResponse<T>;
  }

  // Form data request (for file uploads)
  async postFormData<T = any>(url: string, formData: FormData, config?: RequestConfig): Promise<ApiResponse<T>> {
    const formConfig: AxiosRequestConfig = {
      ...config,
      headers: {
        'Content-Type': 'multipart/form-data',
        ...config?.headers,
      },
    };

    const response = await this.instance.post<T>(url, formData, formConfig);
    return response.data as ApiResponse<T>;
  }

  // PUT with form data
  async putFormData<T = any>(url: string, formData: FormData, config?: RequestConfig): Promise<ApiResponse<T>> {
    const formConfig: AxiosRequestConfig = {
      ...config,
      headers: {
        'Content-Type': 'multipart/form-data',
        ...config?.headers,
      },
    };

    const response = await this.instance.put<T>(url, formData, formConfig);
    return response.data as ApiResponse<T>;
  }

  // Set auth token
  setAuthToken(token: string | null): void {
    if (token) {
      this.instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token);
      }
    } else {
      delete this.instance.defaults.headers.common['Authorization'];
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
      }
    }
  }

  // Update base URL
  setBaseURL(baseURL: string): void {
    this.instance.defaults.baseURL = baseURL;
  }

  // Add request interceptor
  addRequestInterceptor(interceptor: RequestInterceptor): number {
    return this.instance.interceptors.request.use(interceptor);
  }

  // Add response interceptor
  addResponseInterceptor(interceptor: ResponseInterceptor): number {
    return this.instance.interceptors.response.use(
      interceptor.onFulfilled,
      interceptor.onRejected
    );
  }

  // Remove interceptor
  removeInterceptor(type: 'request' | 'response', id: number): void {
    if (type === 'request') {
      this.instance.interceptors.request.eject(id);
    } else {
      this.instance.interceptors.response.eject(id);
    }
  }
}

// Create and export default instance
const httpClient = new HttpClient();

export { HttpClient, httpClient };
export default httpClient;