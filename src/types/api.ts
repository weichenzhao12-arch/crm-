export interface ApiError {
  code: string | number
  message: string
  status?: number
}

export interface ApiResponse<T> {
  data: T
  message: string
}

export interface DemoStatusItem {
  title: string
  detail: string
}

export interface DemoStatusResponse {
  generatedAt: string
  message: string
  stack: DemoStatusItem[]
}
