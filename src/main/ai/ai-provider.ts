import type { AIPetAction } from '../../shared/ai-pet-action'
import type { CompanionReplyPlan } from './companion-reply-plan'

export type AIChatRole = 'system' | 'user' | 'assistant'

export interface AIChatMessage {
  role: AIChatRole
  content: string
}

export interface AIChatRequest {
  characterName: string
  messages: readonly AIChatMessage[]
  responseFormat?: 'text' | 'companion-reply-plan'
  petActionToolChoice?: 'auto' | 'required'
  signal?: AbortSignal
}

export interface AIChatResponse {
  text: string
  replyPlan?: CompanionReplyPlan
  actions?: readonly AIPetAction[]
  rejectedActionRequests?: readonly string[]
}

export interface AIProvider {
  readonly id: 'deepseek' | 'local'
  generateReply: (request: AIChatRequest) => Promise<AIChatResponse>
}
