import type { AIPetAction } from './ai-pet-action'

export const EMOTION_STATES = [
  'neutral',
  'happy',
  'excited',
  'calm',
  'sleepy',
  'annoyed'
] as const

export type EmotionState = (typeof EMOTION_STATES)[number]

export interface EmotionSnapshot {
  state: EmotionState
  intensity: number
  startedAt: number
  decaysToNeutralAt: number | null
}

export interface RelationshipState {
  familiarity: number
  trust: number
  interactionCount: number
  firstInteractionAt: number | null
  lastInteractionAt: number | null
}

export interface CompanionStateSnapshot {
  emotion: EmotionSnapshot
  relationship: RelationshipState
}

export const COMPANION_INTERACTIONS = [
  'single-click',
  'double-click',
  'hold'
] as const

export type CompanionInteraction = (typeof COMPANION_INTERACTIONS)[number]

export const COMPANION_AUTONOMOUS_ACTIONS = [
  'idle',
  'walk_left',
  'walk_right',
  'sit',
  'sleep'
] as const

export type CompanionAutonomousAction = (typeof COMPANION_AUTONOMOUS_ACTIONS)[number]

export function isEmotionState(value: unknown): value is EmotionState {
  return EMOTION_STATES.includes(value as EmotionState)
}

export function isEmotionSnapshot(value: unknown): value is EmotionSnapshot {
  if (!isRecord(value)) {
    return false
  }

  return (
    isEmotionState(value.state) &&
    isUnitInterval(value.intensity) &&
    isTimestamp(value.startedAt) &&
    (value.decaysToNeutralAt === null || isTimestamp(value.decaysToNeutralAt))
  )
}

export function isRelationshipState(value: unknown): value is RelationshipState {
  if (!isRecord(value)) {
    return false
  }

  return (
    isUnitInterval(value.familiarity) &&
    isUnitInterval(value.trust) &&
    Number.isSafeInteger(value.interactionCount) &&
    (value.interactionCount as number) >= 0 &&
    (value.firstInteractionAt === null || isTimestamp(value.firstInteractionAt)) &&
    (value.lastInteractionAt === null || isTimestamp(value.lastInteractionAt))
  )
}

export function isCompanionStateSnapshot(value: unknown): value is CompanionStateSnapshot {
  return (
    isRecord(value) &&
    isEmotionSnapshot(value.emotion) &&
    isRelationshipState(value.relationship)
  )
}

export function isCompanionInteraction(value: unknown): value is CompanionInteraction {
  return COMPANION_INTERACTIONS.includes(value as CompanionInteraction)
}

export function isCompanionAutonomousAction(
  value: unknown
): value is CompanionAutonomousAction {
  return COMPANION_AUTONOMOUS_ACTIONS.includes(value as CompanionAutonomousAction)
}

export function emotionForPetAction(action: AIPetAction): EmotionState | undefined {
  switch (action) {
    case 'happy':
      return 'happy'
    case 'jump':
      return 'excited'
    case 'sit':
      return 'calm'
    case 'sleep':
      return 'sleepy'
    case 'angry':
      return 'annoyed'
    default:
      return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnitInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}
