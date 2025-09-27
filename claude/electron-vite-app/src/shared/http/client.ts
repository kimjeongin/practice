// client.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

import { ApiResponse } from './types'
import { TokenManager } from './token-manager'

export abstract class BaseApiClient {
  protected client: AxiosInstance
  protected tokenManager: TokenManager
  protected baseURL: string

  constructor(baseURL: string, tokenManager: TokenManager) {
    this.baseURL = baseURL
    this.tokenManager = tokenManager

    this.client = axios.create({ baseURL })

    // --- Request interceptor ---
    this.client.interceptors.request.use((config) => {
      const token = this.tokenManager.getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // --- Response interceptor ---
    this.client.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err.response?.status === 401) {
          try {
            await this.tokenManager.refreshTokens(this.baseURL)
            const newToken = this.tokenManager.getAccessToken()
            if (newToken) {
              err.config.headers.Authorization = `Bearer ${newToken}`
              return this.client.request(err.config)
            }
          } catch {
            this.tokenManager.clearTokens()
          }
        }
        return Promise.reject(err)
      }
    )
  }

  /**
   * 공통 request wrapper (JSON, 일반 요청)
   */
  protected async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const res: AxiosResponse<T> = await this.client.request<T>(config)
      return this.wrapSuccess(res.data)
    } catch (err: unknown) {
      const status = (err as any).response?.status?.toString() ?? 'UNKNOWN'
      const message =
        (err as any).response?.data?.message ?? (err as any).message ?? 'Unknown error'
      return this.wrapError(status, message)
    }
  }

  /**
   * FormData 요청 wrapper (파일 업로드 등)
   */
  protected async formRequest<T>(
    url: string,
    formData: FormData,
    method: 'POST' | 'PUT' = 'POST'
  ): Promise<ApiResponse<T>> {
    try {
      const res = await this.client.request<T>({
        url,
        method,
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return this.wrapSuccess(res.data)
    } catch (err: unknown) {
      const status = (err as any).response?.status?.toString() ?? 'UNKNOWN'
      const message =
        (err as any).response?.data?.message ?? (err as any).message ?? 'Unknown error'
      return this.wrapError(status, message)
    }
  }

  // --- 공통 response wrapper ---
  protected wrapSuccess<T>(data: T): ApiResponse<T> {
    return { success: true, data }
  }

  protected wrapError(errorCode: string, message: string): ApiResponse<never> {
    return { success: false, errorCode, message }
  }
}
