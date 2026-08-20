import type { ChatMessage } from '../../shared/chat'
import type { CompanionStateSnapshot } from '../../shared/companion-state'
import type { LocalDesktopTimeContext } from '../chat/local-time-context'
import { createCompanionStateContextMessage } from '../companion/companion-context'
import {
  createPersistedMemoryContextMessage,
  type RetrievedMemoryContext
} from '../memory/MemoryContextBuilder'
import type { AIChatMessage } from './ai-provider'
import { createDesktopPetSystemPrompt } from './system-prompt'
import { createReplyPlanInstructionMessage } from './reply-plan-instruction'

const MAX_RECENT_CONVERSATION_MESSAGES = 12

export function buildAIConversationContext(
  characterName: string,
  messages: readonly ChatMessage[],
  persistedMemory?: RetrievedMemoryContext,
  companionState?: CompanionStateSnapshot,
  localTime?: LocalDesktopTimeContext
): AIChatMessage[] {
  const recentMessages = messages.slice(-MAX_RECENT_CONVERSATION_MESSAGES)
  const latestMessage = recentMessages.at(-1)
  const currentUserMessage = latestMessage?.role === 'user' ? latestMessage.content : ''
  const conversationHistory = currentUserMessage
    ? recentMessages.slice(0, -1)
    : recentMessages
  const persistedMemoryMessage = persistedMemory
    ? createPersistedMemoryContextMessage(persistedMemory)
    : undefined

  return [
    { role: 'system', content: createDesktopPetSystemPrompt(characterName) },
    ...(companionState ? [createCompanionStateContextMessage(companionState)] : []),
    ...(localTime ? [createLocalTimeContextMessage(localTime)] : []),
    ...(persistedMemoryMessage ? [persistedMemoryMessage] : []),
    ...conversationHistory.map(toProviderConversationMessage),
    createReplyPlanInstructionMessage(currentUserMessage),
    ...(latestMessage && currentUserMessage
      ? [toProviderConversationMessage(latestMessage)]
      : [])
  ]
}

function toProviderConversationMessage({
  role,
  content
}: ChatMessage): AIChatMessage {
  return {
    role,
    content: role === 'assistant' ? serializeAssistantHistory(content) : content
  }
}

function serializeAssistantHistory(content: string): string {
  return JSON.stringify({ segments: [{ text: content }] })
}

function createLocalTimeContextMessage(
  context: LocalDesktopTimeContext
): AIChatMessage {
  return {
    role: 'system',
    content: [
      '## Local desktop time',
      'This is structured context from the user\'s operating system. Use it subtly only when the current message makes time relevant.',
      'Do not recite the exact clock time unless the user asks. Do not infer location, work status, bedtime, habits, or plans from time alone. Use uncertainty naturally.',
      JSON.stringify(context)
    ].join('\n')
  }
}
