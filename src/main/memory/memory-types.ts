import type { ChatRole } from '../../shared/chat'

export const MEMORY_TYPES = [
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

export type MemoryType = (typeof MEMORY_TYPES)[number]

export interface UserProfileEntry {
  id: number
  key: string
  value: string
  createdAt: number
  updatedAt: number
}

export interface MemoryRecord {
  id: number
  type: MemoryType
  content: string
  importance: number
  createdAt: number
  updatedAt: number
  lastAccessedAt: number
}

export interface AddMemoryInput {
  type: MemoryType
  content: string
  importance?: number
}

export interface UpdateMemoryInput {
  type?: MemoryType
  content?: string
  importance?: number
}

export interface ListMemoriesOptions {
  type?: MemoryType
  limit?: number
}

export interface ConversationRecord {
  id: number
  role: ChatRole
  content: string
  createdAt: number
}

export interface AddConversationMessageInput {
  role: ChatRole
  content: string
  createdAt?: number
}
