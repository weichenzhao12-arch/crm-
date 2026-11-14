import { expect, it } from 'vitest'
import { followDay, isTodayFollow } from '~/features/crm/today-follow'

it('filters by the Shanghai business day without changing records', () => {
  const today = followDay(new Date('2026-11-08T16:05:00Z'))
  expect(today).toBe('2026-11-09')
  const dateKey = (value: string) => value
  const reminder = Object.freeze({ date: '2026-11-06', reminderDate: today, reminderDone: false })
  expect(isTodayFollow(reminder, today, dateKey)).toBe(true)
  expect(isTodayFollow({ ...reminder, reminderDone: true }, today, dateKey)).toBe(false)
  expect(isTodayFollow({ date: today, reminderDate: '2026-11-08' }, today, dateKey)).toBe(false)
  expect(isTodayFollow({ date: today }, today, dateKey)).toBe(true)
  expect(isTodayFollow({ date: today, reminderDate: '2026-11-10' }, today, dateKey)).toBe(false)
})
