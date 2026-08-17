import { isPetAction, type PetAction } from './pet-action'

export const CHAT_ROLES = ['user', 'assistant'] as const
export type ChatRole = (typeof CHAT_ROLES)[number]

export const CHAT_MODES = ['hidden', 'speech', 'chat'] as const
export type ChatMode = (typeof CHAT_MODES)[number]

export const CHAT_PLACEMENTS = ['left', 'right', 'above', 'below'] as const
export type ChatPlacement = (typeof CHAT_PLACEMENTS)[number]

export type ChatPetReaction = Extract<PetAction, 'talk' | 'happy' | 'wave'>

export const CHAT_PROVIDER_IDS = ['deepseek', 'local'] as const
export type ChatProviderId = (typeof CHAT_PROVIDER_IDS)[number]

export interface ChatProviderInfo {
  requestedProvider: ChatProviderId
  activeProvider: ChatProviderId
  model: string | null
  usingFallback: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export interface ChatState {
  mode: ChatMode
  placement: ChatPlacement
  messages: ChatMessage[]
  speechText: string | null
  isProcessing: boolean
  characterName: string
  provider: ChatProviderInfo
}

export type ChatSendRejectionReason = 'empty-message' | 'not-open' | 'processing'

export interface ChatSendResult {
  accepted: boolean
  reason?: ChatSendRejectionReason
}

export function isChatState(value: unknown): value is ChatState {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const state = value as Partial<ChatState>

  return (
    isChatMode(state.mode) &&
    isChatPlacement(state.placement) &&
    Array.isArray(state.messages) &&
    state.messages.every(isChatMessage) &&
    (typeof state.speechText === 'string' || state.speechText === null) &&
    typeof state.isProcessing === 'boolean' &&
    typeof state.characterName === 'string' &&
    isChatProviderInfo(state.provider)
  )
}

export function isChatSendResult(value: unknown): value is ChatSendResult {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const result = value as Partial<ChatSendResult>

  return (
    typeof result.accepted === 'boolean' &&
    (result.reason === undefined ||
      result.reason === 'empty-message' ||
      result.reason === 'not-open' ||
      result.reason === 'processing')
  )
}

export function isChatPetReaction(value: unknown): value is ChatPetReaction {
  return isPetAction(value) && (value === 'talk' || value === 'happy' || value === 'wave')
}

function isChatRole(value: unknown): value is ChatRole {
  return CHAT_ROLES.includes(value as ChatRole)
}

function isChatMode(value: unknown): value is ChatMode {
  return CHAT_MODES.includes(value as ChatMode)
}

function isChatPlacement(value: unknown): value is ChatPlacement {
  return CHAT_PLACEMENTS.includes(value as ChatPlacement)
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const message = value as Partial<ChatMessage>

  return (
    typeof message.id === 'string' &&
    isChatRole(message.role) &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'number' &&
    Number.isFinite(message.createdAt)
  )
}

function isChatProviderInfo(value: unknown): value is ChatProviderInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const provider = value as Partial<ChatProviderInfo>

  return (
    isChatProviderId(provider.requestedProvider) &&
    isChatProviderId(provider.activeProvider) &&
    (typeof provider.model === 'string' || provider.model === null) &&
    typeof provider.usingFallback === 'boolean'
  )
}

function isChatProviderId(value: unknown): value is ChatProviderId {
  return CHAT_PROVIDER_IDS.includes(value as ChatProviderId)
}
