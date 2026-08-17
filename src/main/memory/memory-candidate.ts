import type { MemoryType } from './memory-types'

export const MEMORY_SENSITIVITY_LEVELS = [
  'none',
  'personal',
  'sensitive',
  'highly_sensitive'
] as const

export type MemorySensitivity = (typeof MEMORY_SENSITIVITY_LEVELS)[number]
export type GeneralMemoryCategory = Exclude<MemoryType, 'profile'>

interface MemoryCandidateBase {
  shouldRemember: boolean
  confidence: number
  importance: number
  explicitRequest: boolean
  sensitivity: MemorySensitivity
  sourceQuote: string
}

export interface ProfileMemoryCandidate extends MemoryCandidateBase {
  category: 'profile'
  key: string
  value: string
}

export interface GeneralMemoryCandidate extends MemoryCandidateBase {
  category: GeneralMemoryCategory
  content: string
}

export type MemoryCandidate = ProfileMemoryCandidate | GeneralMemoryCandidate

export type MemoryCandidateRejectionReason =
  | 'invalid-structured-output'
  | 'invalid-candidate'
  | 'candidate-limit-exceeded'
  | 'not-recommended'
  | 'low-confidence'
  | 'low-importance'
  | 'unsupported-sensitive-data'
  | 'missing-source-evidence'
  | 'blocked-profile-key'
  | 'invalid-profile-value'
  | 'trivial-ephemeral-detail'
  | 'storage-error'

export interface MemoryExtractionResult {
  candidates: readonly MemoryCandidate[]
  rejectedReasons: readonly MemoryCandidateRejectionReason[]
  requestedPetActions: number
}

export interface MemoryStorageResult {
  acceptedCategories: readonly MemoryType[]
  rejectedReasons: readonly MemoryCandidateRejectionReason[]
  profileValuesWritten: number
  memoriesCreated: number
  memoriesDeduplicated: number
}
