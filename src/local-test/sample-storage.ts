import { releaseOldReservations } from './inventory'
import type { Movement, Sample } from './inventory'

export interface SampleData {
  samples: Sample[]
  entries: Movement[]
}

const key = 'crm-isolated-sample-lab-v1'
const seed: Sample[] = [
  { id: 'demo-s', product: '测试草坪 A', spec: '20 × 30 cm', location: 'A-01', minimum: 2 },
  { id: 'demo-l', product: '测试草坪 A', spec: '50 × 50 cm', location: 'A-02', minimum: 1 },
]

export function readSampleData(fallback: SampleData = { samples: seed, entries: [] }): SampleData {
  const saved: SampleData = JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  return { ...saved, entries: releaseOldReservations(saved.entries) }
}

export function writeSampleData(data: SampleData) {
  localStorage.setItem(key, JSON.stringify(data))
}
