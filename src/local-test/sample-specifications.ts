import { computed } from 'vue'
import type { Sample } from './inventory'

const filterFields = [['height', '草高'], ['needleCount', '针数'], ['needleRow', '针排'], ['backing', '背胶'], ['density', '密度'], ['poundWeight', '磅重'], ['spec', '裁样规格'], ['location', '库位']] as const
export type SpecificationFilters = Partial<Record<typeof filterFields[number][0], string>>
export const sampleFilterOptions = (rows: () => Sample[]) => computed(() => filterFields.map(([field, label]) => ({
  field, label, values: [...new Set(rows().map(row => row[field]?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })),
})))
export const matchesSpecifications = (row: Sample, values: SpecificationFilters) =>
  filterFields.every(([field]) => !values[field] || row[field]?.trim() === values[field])
