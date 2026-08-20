import type { MemoryCategory } from '../../../shared/memory-management'

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  profile: 'Profile',
  preference: 'Preference',
  person: 'Person',
  goal: 'Goal',
  event: 'Event',
  habit: 'Habit',
  relationship: 'Relationship',
  interest: 'Interest',
  occupation: 'Occupation',
  location_general: 'General location',
  other: 'Other'
}

const PROFILE_LABELS: Readonly<Record<string, string>> = {
  preferred_name: 'Preferred name',
  age: 'Age',
  occupation: 'Occupation'
}

export function getProfileLabel(key: string): string {
  const knownLabel = PROFILE_LABELS[key]

  if (knownLabel) {
    return knownLabel
  }

  return key
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join(' ')
}

export function formatMemoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(timestamp)
}
