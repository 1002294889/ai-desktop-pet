import type { ChatMessage } from '../../shared/chat'
import type { AIChatMessage } from './ai-provider'
import { createDesktopPetSystemPrompt } from './system-prompt'

const MAX_RECENT_CONVERSATION_MESSAGES = 12

export function buildAIConversationContext(
  characterName: string,
  messages: readonly ChatMessage[]
): AIChatMessage[] {
  const recentMessages = messages.slice(-MAX_RECENT_CONVERSATION_MESSAGES)

  return [
    { role: 'system', content: createDesktopPetSystemPrompt(characterName) },
    ...recentMessages.map(({ role, content }) => ({ role, content }))
  ]
}
