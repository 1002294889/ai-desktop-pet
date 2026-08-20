export const TIME_OF_DAY_VALUES = [
  'early_morning',
  'morning',
  'noon',
  'afternoon',
  'evening',
  'late_night'
] as const

export type TimeOfDay = (typeof TIME_OF_DAY_VALUES)[number]

export interface LocalDesktopTimeContext {
  currentLocalDate: string
  currentLocalTime: string
  timeOfDay: TimeOfDay
}

export function getLocalDesktopTimeContext(now = new Date()): LocalDesktopTimeContext {
  const hour = now.getHours()

  return {
    currentLocalDate: [
      now.getFullYear(),
      padTwoDigits(now.getMonth() + 1),
      padTwoDigits(now.getDate())
    ].join('-'),
    currentLocalTime: `${padTwoDigits(hour)}:${padTwoDigits(now.getMinutes())}`,
    timeOfDay: getTimeOfDay(hour)
  }
}

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 4 && hour < 8) {
    return 'early_morning'
  }

  if (hour >= 8 && hour < 12) {
    return 'morning'
  }

  if (hour >= 12 && hour < 14) {
    return 'noon'
  }

  if (hour >= 14 && hour < 18) {
    return 'afternoon'
  }

  if (hour >= 18 && hour < 23) {
    return 'evening'
  }

  return 'late_night'
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}
