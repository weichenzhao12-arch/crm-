import { AUTH_STORAGE_KEY } from '~/constants/app'

function token() {
  return sessionStorage.getItem(AUTH_STORAGE_KEY) || ''
}

export class CloudApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok)
    throw new CloudApiError(response.status, await response.text())

  return response.json() as Promise<T>
}

export async function getCloudState<T>(key: string) {
  const data = await apiFetch<{ value: T | null }>(`/api/state/${key}`)
  return data.value
}

export function getCustomerCloudState<T>() {
  return apiFetch<{ value: T | null, revision: string | null }>('/api/state/customers', { cache: 'no-store' })
}

export async function putCloudState(key: string, value: unknown) {
  return apiFetch<{ ok: boolean }>(`/api/state/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export function putCustomerCloudState(value: unknown, revision: string | null) {
  return apiFetch<{ ok: boolean, revision: string }>('/api/state/customers', {
    method: 'PUT',
    body: JSON.stringify({ value, revision }),
  })
}

export async function uploadCloudImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<{ key: string, url: string }>('/api/images', {
    method: 'POST',
    body: form,
  })
}

export async function renderCloudPdf(html: string, fileName: string) {
  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: JSON.stringify({ html, fileName }),
  })

  if (!response.ok)
    throw new Error(await response.text())

  return response.blob()
}
