import {
  AI_PET_ACTIONS,
  validateAIPetActionSequence,
  type AIPetAction
} from '../../shared/ai-pet-action'

export const PLAY_PET_ACTION_TOOL_NAME = 'play_pet_action'

export const PLAY_PET_ACTION_TOOL = {
  type: 'function',
  function: {
    name: PLAY_PET_ACTION_TOOL_NAME,
    description:
      'Request one optional visual action for the desktop pet. Call more than once only when a short sequence is emotionally appropriate.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: AI_PET_ACTIONS,
          description: 'The approved semantic pet action to play.'
        }
      },
      required: ['action'],
      additionalProperties: false
    }
  }
} as const

export interface DeepSeekFunctionToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface DeepSeekToolResultMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

export interface ParsedPetActionToolCalls {
  actions: AIPetAction[]
  rejected: string[]
  toolCalls: DeepSeekFunctionToolCall[]
  toolResults: DeepSeekToolResultMessage[]
}

const MAX_TOOL_CALLS_TO_PROCESS = 8

export function parsePetActionToolCalls(value: unknown): ParsedPetActionToolCalls {
  if (value === undefined) {
    return { actions: [], rejected: [], toolCalls: [], toolResults: [] }
  }

  if (!Array.isArray(value)) {
    return {
      actions: [],
      rejected: ['tool_calls (invalid-action)'],
      toolCalls: [],
      toolResults: []
    }
  }

  const entries: Array<{
    call: DeepSeekFunctionToolCall
    candidate: unknown
    preliminaryRejection?: string
  }> = []
  const rejected: string[] = []

  for (const rawCall of value.slice(0, MAX_TOOL_CALLS_TO_PROCESS)) {
    const call = parseFunctionToolCall(rawCall)

    if (!call) {
      rejected.push('tool_call (invalid-action)')
      continue
    }

    if (call.function.name !== PLAY_PET_ACTION_TOOL_NAME) {
      entries.push({
        call,
        candidate: undefined,
        preliminaryRejection: `${sanitizeLabel(call.function.name)} (disallowed-tool)`
      })
      continue
    }

    const argumentsResult = parseToolArguments(call.function.arguments)

    entries.push({
      call,
      candidate: argumentsResult.action,
      ...(argumentsResult.rejection
        ? { preliminaryRejection: argumentsResult.rejection }
        : {})
    })
  }

  if (value.length > MAX_TOOL_CALLS_TO_PROCESS) {
    rejected.push('tool_call (limit-exceeded)')
  }

  const validation = validateAIPetActionSequence(entries.map(({ candidate }) => candidate))
  const actions: AIPetAction[] = []
  const toolResults: DeepSeekToolResultMessage[] = []

  entries.forEach((entry, index) => {
    const decision = validation.decisions[index]
    const accepted = !entry.preliminaryRejection && decision?.accepted === true

    if (accepted && decision?.action) {
      actions.push(decision.action)
    } else {
      rejected.push(
        entry.preliminaryRejection ?? decision?.label ?? 'action (invalid-action)'
      )
    }

    toolResults.push({
      role: 'tool',
      tool_call_id: entry.call.id,
      content: JSON.stringify(
        accepted
          ? { accepted: true, action: decision?.action }
          : { accepted: false, reason: 'invalid_or_disallowed_action' }
      )
    })
  })

  return {
    actions,
    rejected,
    toolCalls: entries.map(({ call }) => call),
    toolResults
  }
}

function parseFunctionToolCall(value: unknown): DeepSeekFunctionToolCall | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const call = value as {
    id?: unknown
    type?: unknown
    function?: { name?: unknown; arguments?: unknown }
  }

  if (
    typeof call.id !== 'string' ||
    !call.id ||
    call.type !== 'function' ||
    typeof call.function !== 'object' ||
    call.function === null ||
    typeof call.function.name !== 'string' ||
    typeof call.function.arguments !== 'string'
  ) {
    return undefined
  }

  return {
    id: call.id,
    type: 'function',
    function: {
      name: call.function.name,
      arguments: call.function.arguments
    }
  }
}

function parseToolArguments(value: string): {
  action?: unknown
  rejection?: string
} {
  try {
    const parsed: unknown = JSON.parse(value)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { rejection: 'arguments (invalid-action)' }
    }

    const record = parsed as Record<string, unknown>

    if (Object.keys(record).some((key) => key !== 'action') || !('action' in record)) {
      return { rejection: 'arguments (invalid-action)' }
    }

    return { action: record.action }
  } catch {
    return { rejection: 'arguments (invalid-json)' }
  }
}

function sanitizeLabel(value: string): string {
  return value.trim().slice(0, 48) || '[empty]'
}
