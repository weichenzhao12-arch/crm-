export interface CustomerRecentFields {
  id?: string
  date?: string
  createdAt?: string
  updatedAt?: string
}

function timeValue(value?: string) {
  if (!value)
    return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function customerRecentActivityTime(customer: CustomerRecentFields) {
  return Math.max(
    timeValue(customer.updatedAt),
    timeValue(customer.createdAt),
    timeValue(customer.date),
  )
}

export function sortCustomersByRecentActivity<T extends CustomerRecentFields>(customers: T[]) {
  return [...customers].sort((left, right) => {
    const diff = customerRecentActivityTime(right) - customerRecentActivityTime(left)
    if (diff)
      return diff
    return String(right.id || '').localeCompare(String(left.id || ''))
  })
}
