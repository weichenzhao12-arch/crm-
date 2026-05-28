import type { LoginResponse, MinimalUser } from '~/types/auth'
import { alovaClient } from '~/api/client'
import { createRequestConfig } from '~/api/interceptors'

export function postDemoLogin() {
  return alovaClient.Post<LoginResponse>('/auth/login', { username: 'demo' }, createRequestConfig())
}

export function getCurrentUser() {
  return alovaClient.Get<MinimalUser>('/auth/me', createRequestConfig())
}
