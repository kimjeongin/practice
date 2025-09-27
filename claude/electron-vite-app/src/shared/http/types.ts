// types.ts
export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  errorCode: string
  message: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
