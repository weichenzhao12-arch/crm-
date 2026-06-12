const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface RecycleLike {
  id: string
  deletedAt?: string
  createdAt?: string
  item?: unknown
}

function timeValue(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function pruneSevenDayRecords<T extends RecycleLike>(records: T[], now = new Date().toISOString()) {
  const nowTime = timeValue(now)
  return records.filter(record => nowTime - timeValue(record.deletedAt || record.createdAt || '') <= RETENTION_MS)
}

export function restoreRecycleRecord<T extends RecycleLike>(records: T[], id: string) {
  const record = records.find(item => item.id === id)
  return {
    item: record?.item,
    record,
    records: records.filter(item => item.id !== id),
  }
}
