import type { AIPetAction } from '../../shared/ai-pet-action'

export type AIChatRole = 'system' | 'user' | 'assistant'

export interface AIChatMessage {
  role: AIChatRole
  content: string
}

export interface AIChatRequest {
  characterName: string
  messages: readonly AIChatMessage[]
  signal?: AbortSignal
}

export interface AIChatResponse {
  text: string
  actions?: readonly AIPetAction[]
  rejectedActionRequests?: readonly string[]
}

export interface AIProvider {
  readonly id: 'deepseek' | 'local'
  generateReply: (request: AIChatRequest) => Promise<AIChatResponse>
}
