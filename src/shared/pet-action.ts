export const PET_ACTIONS = [
  'idle',
  'walk_left',
  'walk_right',
  'sit',
  'sleep',
  'wake',
  'happy',
  'angry',
  'jump',
  'wave',
  'talk',
  'dragged'
] as const

export type PetAction = (typeof PET_ACTIONS)[number]

export type PetActionLifecycle = 'requested' | 'started' | 'active' | 'completed' | 'cancelled'

export interface PetActionState {
  currentAction: PetAction
  previousAction: PetAction | null
  currentActionPriority: number
  isInterruptible: boolean
  lifecycle: PetActionLifecycle
  startedAt: number
  durationMs?: number
}

export interface PetActionRequestOptions {
  force?: boolean
  durationMs?: number
  returnTo?: PetAction
}

export type PetActionRejectionReason = 'lower-priority' | 'current-action-not-interruptible'

export interface PetActionRequestResult {
  accepted: boolean
  reason?: PetActionRejectionReason
}
