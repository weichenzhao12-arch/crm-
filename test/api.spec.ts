import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createApiError, createRequestConfig, handleUnauthorized } from '~/api/interceptors'
import { useAuthStore } from '~/stores/auth'

describe('api helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('injects bearer token into headers', () => {
    const auth = useAuthStore()
    auth.setToken('secret')

    const config = createRequestConfig({
      headers: {
        Accept: 'application/json',
      },
    })

    expect(config.headers?.Authorization).toBe('Bearer secret')
    expect(config.headers?.Accept).toBe('application/json')
  })

  it('maps unknown errors into ApiError shape', () => {
    expect(createApiError('boom')).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'boom',
    })
  })

  it('clears auth and redirects on unauthorized', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/login', component: { template: '<div />' } },
      ],
    })
    const auth = useAuthStore()
    auth.setToken('secret')
    await router.push('/')
    await router.isReady()

    await handleUnauthorized(router)

    expect(auth.token).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
