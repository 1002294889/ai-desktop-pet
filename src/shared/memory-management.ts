export const MEMORY_CATEGORIES = [
  'profile',
  'preference',
  'person',
  'goal',
  'event',
  'habit',
  'relationship',
  'interest',
  'occupation',
  'location_general',
  'other'
] as const

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]
export type MemoryCategoryFilter = 'all' | MemoryCategory

export interface ManagedProfileEntry {
  key: string
  value: string
  createdAt: number
  updatedAt: number
}

export interface ManagedMemory {
  id: number
  category: MemoryCategory
  content: string
  importance: number
  createdAt: number
  updatedAt: number
}

export interface MemorySettings {
  longTermMemoryEnabled: boolean
}

export interface MemoryOverview {
  profile: ManagedProfileEntry[]
  memories: ManagedMemory[]
  profileEntryCount: number
  memoryCount: number
  conversationMessageCount: number
  hasMoreMemories: boolean
  settings: MemorySettings
}

export interface MemoryOverviewQuery {
  category: MemoryCategoryFilter
  search: string
}

export interface UpdateManagedProfileInput {
  key: string
  value: string
}

export interface UpdateManagedMemoryInput {
  id: number
  content: string
}

export interface DeleteMemoryItemResult {
  deleted: boolean
}

export interface ClearMemoryResult {
  profileEntriesDeleted: number
  memoriesDeleted: number
  conversationMessagesDeleted: number
}

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return MEMORY_CATEGORIES.includes(value as MemoryCategory)
}

export function isMemoryOverviewQuery(value: unknown): value is MemoryOverviewQuery {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.category === 'all' || isMemoryCategory(value.category)) &&
    typeof value.search === 'string'
  )
}

export function isUpdateManagedProfileInput(
  value: unknown
): value is UpdateManagedProfileInput {
  return isRecord(value) && typeof value.key === 'string' && typeof value.value === 'string'
}

export function isUpdateManagedMemoryInput(
  value: unknown
): value is UpdateManagedMemoryInput {
  return isRecord(value) && isPositiveInteger(value.id) && typeof value.content === 'string'
}

export function isManagedProfileEntry(value: unknown): value is ManagedProfileEntry {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.value === 'string' &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  )
}

export function isManagedMemory(value: unknown): value is ManagedMemory {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    isMemoryCategory(value.category) &&
    typeof value.content === 'string' &&
    typeof value.importance === 'number' &&
    Number.isFinite(value.importance) &&
    value.importance >= 0 &&
    value.importance <= 1 &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  )
}

export function isMemorySettings(value: unknown): value is MemorySettings {
  return isRecord(value) && typeof value.longTermMemoryEnabled === 'boolean'
}

export function isMemoryOverview(value: unknown): value is MemoryOverview {
  return (
    isRecord(value) &&
    Array.isArray(value.profile) &&
    value.profile.every(isManagedProfileEntry) &&
    Array.isArray(value.memories) &&
    value.memories.every(isManagedMemory) &&
    isNonNegativeInteger(value.profileEntryCount) &&
    isNonNegativeInteger(value.memoryCount) &&
    isNonNegativeInteger(value.conversationMessageCount) &&
    typeof value.hasMoreMemories === 'boolean' &&
    isMemorySettings(value.settings)
  )
}

export function isDeleteMemoryItemResult(value: unknown): value is DeleteMemoryItemResult {
  return isRecord(value) && typeof value.deleted === 'boolean'
}

export function isClearMemoryResult(value: unknown): value is ClearMemoryResult {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.profileEntriesDeleted) &&
    isNonNegativeInteger(value.memoriesDeleted) &&
    isNonNegativeInteger(value.conversationMessagesDeleted)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
