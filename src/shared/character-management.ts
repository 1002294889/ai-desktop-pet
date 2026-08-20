import {
  CHARACTER_RENDERER_TYPES,
  type CharacterRendererType
} from './character'

export const CHARACTER_PACK_ORIGINS = ['built-in', 'user'] as const
export type CharacterPackOrigin = (typeof CHARACTER_PACK_ORIGINS)[number]

export interface InstalledCharacterSummary {
  id: string
  name: string
  renderer: CharacterRendererType
  version: number
  previewUrl: string
  origin: CharacterPackOrigin
  isActive: boolean
  canActivate: boolean
  canRemove: boolean
}

export interface CharacterManagerOverview {
  activeCharacterId: string
  defaultCharacterId: string
  characters: InstalledCharacterSummary[]
}

export const CHARACTER_OPERATION_STATUSES = [
  'success',
  'cancelled',
  'error'
] as const
export type CharacterOperationStatus = (typeof CHARACTER_OPERATION_STATUSES)[number]

export const CHARACTER_OPERATION_ERROR_CODES = [
  'built-in-character',
  'duplicate-id',
  'invalid-pack',
  'not-found',
  'unsupported-renderer',
  'unexpected-error'
] as const
export type CharacterOperationErrorCode =
  (typeof CHARACTER_OPERATION_ERROR_CODES)[number]

export interface CharacterOperationResult {
  status: CharacterOperationStatus
  message: string
  overview: CharacterManagerOverview
  characterId?: string
  errorCode?: CharacterOperationErrorCode
}

export function isCharacterManagerOverview(
  value: unknown
): value is CharacterManagerOverview {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.activeCharacterId === 'string' &&
    typeof value.defaultCharacterId === 'string' &&
    Array.isArray(value.characters) &&
    value.characters.every(isInstalledCharacterSummary)
  )
}

export function isCharacterOperationResult(
  value: unknown
): value is CharacterOperationResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    CHARACTER_OPERATION_STATUSES.includes(value.status as CharacterOperationStatus) &&
    typeof value.message === 'string' &&
    isCharacterManagerOverview(value.overview) &&
    (value.characterId === undefined || typeof value.characterId === 'string') &&
    (value.errorCode === undefined ||
      CHARACTER_OPERATION_ERROR_CODES.includes(
        value.errorCode as CharacterOperationErrorCode
      ))
  )
}

function isInstalledCharacterSummary(
  value: unknown
): value is InstalledCharacterSummary {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    CHARACTER_RENDERER_TYPES.includes(value.renderer as CharacterRendererType) &&
    Number.isSafeInteger(value.version) &&
    typeof value.previewUrl === 'string' &&
    CHARACTER_PACK_ORIGINS.includes(value.origin as CharacterPackOrigin) &&
    typeof value.isActive === 'boolean' &&
    typeof value.canActivate === 'boolean' &&
    typeof value.canRemove === 'boolean'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
