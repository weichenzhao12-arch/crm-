import { afterEach, expect, it, vi } from 'vitest'
import { getCustomerCloudState } from '~/api/cloud-storage'

afterEach(() => vi.unstubAllGlobals())

it('does not expose the challenge HTML as an error message', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Challenge</html>', {
    status: 403,
    headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
  })))
  await expect(getCustomerCloudState()).rejects.toMatchObject({
    status: 403,
    message: '客资接口遇到安全验证，请完成验证后重试',
  })
})
