import type { ChatMessage, ChatPetReaction } from '../../shared/chat'

export interface ChatReply {
  text: string
  action: ChatPetReaction
}

export interface ChatReplyContext {
  characterName: string
  messages: readonly ChatMessage[]
}

export interface ChatReplyProvider {
  generateReply: (message: string, context: ChatReplyContext) => Promise<ChatReply>
}
