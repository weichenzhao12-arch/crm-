import { apiFetch } from '~/api/cloud-storage'
import type { Movement, Sample } from './inventory'

export interface SharedSamples {
  revision: number
  samples: (Sample & { stock: number })[]
  entries: Movement[]
}

export function getSharedSamples() {
  return apiFetch<SharedSamples>('/api/sample-ledger', { cache: 'no-store' })
}

export function postSharedSample(revision: number, sample?: Sample, entry?: Movement) {
  return apiFetch<{ revision: number }>('/api/sample-ledger', {
    method: 'POST', body: JSON.stringify({ revision, sample, entry: entry && {
      ...entry, lines: entry.lines.map(line => ({ sampleId: line.sample.id, quantity: line.quantity })),
    } }),
  })
}
