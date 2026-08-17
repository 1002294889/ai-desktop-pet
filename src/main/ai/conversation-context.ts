import type { ChatMessage } from '../../shared/chat'
import {
  createPersistedMemoryContextMessage,
  type RetrievedMemoryContext
} from '../memory/MemoryContextBuilder'
import type { AIChatMessage } from './ai-provider'
import { createDesktopPetSystemPrompt } from './system-prompt'

const MAX_RECENT_CONVERSATION_MESSAGES = 12

export function buildAIConversationContext(
  characterName: string,
  messages: readonly ChatMessage[],
  persistedMemory?: RetrievedMemoryContext
): AIChatMessage[] {
  const recentMessages = messages.slice(-MAX_RECENT_CONVERSATION_MESSAGES)
  const persistedMemoryMessage = persistedMemory
    ? createPersistedMemoryContextMessage(persistedMemory)
    : undefined

  return [
    { role: 'system', content: createDesktopPetSystemPrompt(characterName) },
    ...(persistedMemoryMessage ? [persistedMemoryMessage] : []),
    ...recentMessages.map(({ role, content }) => ({ role, content }))
  ]
}
