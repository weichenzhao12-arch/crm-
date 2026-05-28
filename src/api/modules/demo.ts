import type { DemoStatusResponse } from '~/types/api'
import { alovaClient } from '~/api/client'
import { createRequestConfig } from '~/api/interceptors'

export function getDemoStatus() {
  return alovaClient.Get<DemoStatusResponse>('/demo/status', {
    ...createRequestConfig(),
    transform: async () => ({
      generatedAt: new Date().toISOString(),
      message: 'Demo request resolved. Replace this with your real backend.',
      stack: [
        {
          title: 'auth headers',
          detail: 'Authorization header is injected when token exists.',
        },
        {
          title: 'typed payload',
          detail: 'Methods return typed data through alova client hooks.',
        },
        {
          title: 'replace me',
          detail: 'Swap this method module with domain-specific endpoints.',
        },
      ],
    }),
  })
}
