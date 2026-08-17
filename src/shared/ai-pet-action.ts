import type { PetAction } from './pet-action'

export const AI_PET_ACTIONS = [
  'happy',
  'angry',
  'jump',
  'wave',
  'talk',
  'sit',
  'sleep',
  'wake'
] as const satisfies readonly PetAction[]

export type AIPetAction = (typeof AI_PET_ACTIONS)[number]

export const MAX_AI_PET_ACTIONS = 3

export type AIPetActionRejectionReason =
  | 'disallowed-action'
  | 'invalid-action'
  | 'limit-exceeded'
  | 'terminal-action-must-be-last'

export interface AIPetActionValidationDecision {
  accepted: boolean
  action?: AIPetAction
  label: string
  reason?: AIPetActionRejectionReason
}

export interface AIPetActionValidationResult {
  actions: AIPetAction[]
  decisions: AIPetActionValidationDecision[]
  rejected: string[]
}

export function isAIPetAction(value: unknown): value is AIPetAction {
  return AI_PET_ACTIONS.includes(value as AIPetAction)
}

export function isAIPetActionSequence(value: unknown): value is AIPetAction[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_AI_PET_ACTIONS) {
    return false
  }

  const validation = validateAIPetActionSequence(value)

  return validation.actions.length === value.length && validation.rejected.length === 0
}

export function validateAIPetActionSequence(value: unknown): AIPetActionValidationResult {
  if (!Array.isArray(value)) {
    const decision = reject(value, 'invalid-action')

    return { actions: [], decisions: [decision], rejected: [decision.label] }
  }

  const actions: AIPetAction[] = []
  const decisions: AIPetActionValidationDecision[] = []
  const rejected: string[] = []
  let terminalActionSeen = false

  for (const candidate of value) {
    let decision: AIPetActionValidationDecision

    if (!isAIPetAction(candidate)) {
      decision = reject(
        candidate,
        typeof candidate === 'string' ? 'disallowed-action' : 'invalid-action'
      )
    } else if (actions.length >= MAX_AI_PET_ACTIONS) {
      decision = reject(candidate, 'limit-exceeded')
    } else if (terminalActionSeen) {
      decision = reject(candidate, 'terminal-action-must-be-last')
    } else {
      decision = { accepted: true, action: candidate, label: candidate }
      actions.push(candidate)
      terminalActionSeen = candidate === 'sit' || candidate === 'sleep'
    }

    decisions.push(decision)

    if (!decision.accepted) {
      rejected.push(decision.label)
    }
  }

  return { actions, decisions, rejected }
}

function reject(
  value: unknown,
  reason: AIPetActionRejectionReason
): AIPetActionValidationDecision {
  return {
    accepted: false,
    label: formatDiagnosticLabel(value, reason),
    reason
  }
}

function formatDiagnosticLabel(value: unknown, reason: AIPetActionRejectionReason): string {
  const valueLabel =
    typeof value === 'string'
      ? value.trim().slice(0, 48) || '[empty]'
      : `[${value === null ? 'null' : typeof value}]`

  return `${valueLabel} (${reason})`
}
