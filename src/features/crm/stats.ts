export type LeadCreationMode = 'all' | 'assigned' | 'self'

export interface LeadCreationCustomer {
  date?: string
  createdByUserId?: string
  assignedToUserId?: string
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1)
  date.setDate(date.getDate() + days)
  const nextYear = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function matchesMode(customer: LeadCreationCustomer, mode: LeadCreationMode) {
  if (mode === 'all')
    return true

  const createdBy = customer.createdByUserId || 'owner'
  const assignedTo = customer.assignedToUserId || 'owner'
  const isAssigned = createdBy !== assignedTo

  return mode === 'assigned' ? isAssigned : !isAssigned
}

export function dailyLeadCreationSeries(customers: LeadCreationCustomer[], mode: LeadCreationMode, startDate: string, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startDate, index)
    return {
      date,
      label: date.slice(5).replace('-', '/'),
      count: customers.filter(customer => customer.date === date && matchesMode(customer, mode)).length,
    }
  })
}
