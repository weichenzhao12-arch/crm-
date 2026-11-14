const businessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })

export function followDay(date = new Date()) {
  return businessDay.format(date)
}

export function isTodayFollow(
  follow: { date: string, reminderDate?: string, reminderDone?: boolean },
  today: string,
  dateKey: (value: string) => string,
) {
  return follow.reminderDate
    ? !follow.reminderDone && dateKey(follow.reminderDate) === today
    : dateKey(follow.date) === today
}
