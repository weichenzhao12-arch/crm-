import type { Router } from 'vue-router'
import type { ApiError } from '~/types/api'
import { useAuthStore } from '~/stores/auth'

interface RequestOptions {
  headers?: Record<string, string>
}

export function createRequestConfig(options: RequestOptions = {}): RequestOptions {
  const auth = useAuthStore()

  return {
    ...options,
    headers: {
      ...options.headers,
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
  }
}

export function createApiError(error: unknown): ApiError {
  if (typeof error === 'string')
    return { code: 'UNKNOWN_ERROR', message: error }

  if (error && typeof error === 'object' && 'message' in error)
    return { code: 'UNKNOWN_ERROR', message: String(error.message) }

  return { code: 'UNKNOWN_ERROR', message: 'Unexpected request error' }
}

export async function handleUnauthorized(router: Router) {
  const auth = useAuthStore()
  auth.clearAuth()
  await router.push('/login')
}
