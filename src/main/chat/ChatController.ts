import { randomUUID } from 'node:crypto'

import type {
  ChatMessage,
  ChatPetReaction,
  ChatPlacement,
  ChatProviderInfo,
  ChatSendResult,
  ChatState
} from '../../shared/chat'
import type { AIProvider } from '../ai/ai-provider'
import { getSafeAIErrorMessage } from '../ai/ai-provider-error'
import { buildAIConversationContext } from '../ai/conversation-context'
import { inferPetReaction } from '../ai/infer-pet-reaction'

type ChatListener = (state: ChatState) => void
type PetReactionListener = (action: ChatPetReaction) => void

interface ChatControllerOptions {
  characterName: string
  provider: AIProvider
  providerInfo: ChatProviderInfo
  onProviderError?: (error: unknown) => void
}

const DEFAULT_SPEECH_DURATION_MS = 4_500
const MAX_MESSAGE_LENGTH = 2_000
const MAX_IN_MEMORY_MESSAGES = 40

export class ChatController {
  private readonly listeners = new Set<ChatListener>()
  private readonly petReactionListeners = new Set<PetReactionListener>()
  private speechTimer: NodeJS.Timeout | undefined
  private activeRequest: AbortController | undefined
  private replyGeneration = 0
  private state: ChatState

  constructor(private readonly options: ChatControllerOptions) {
    this.state = {
      mode: 'hidden',
      placement: 'right',
      messages: [],
      speechText: null,
      isProcessing: false,
      characterName: options.characterName,
      provider: options.providerInfo
    }
  }

  getSnapshot(): ChatState {
    return this.state
  }

  subscribe(listener: ChatListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  subscribeToPetReactions(listener: PetReactionListener): () => void {
    this.petReactionListeners.add(listener)

    return () => this.petReactionListeners.delete(listener)
  }

  openChat(): void {
    this.clearSpeechTimer()

    const messages =
      this.state.messages.length > 0
        ? this.state.messages
        : [
            this.createMessage(
              'assistant',
              `Hey! I'm ${this.state.characterName}. What would you like to talk about?`
            )
          ]

    this.setState({ mode: 'chat', messages, speechText: null })
  }

  closeChat(): void {
    this.replyGeneration += 1
    this.cancelActiveRequest()
    this.clearSpeechTimer()
    this.setState({ mode: 'hidden', speechText: null, isProcessing: false })
  }

  showSpeechBubble(
    text = `Hi! ${this.state.characterName} is happy to see you.`,
    durationMs = DEFAULT_SPEECH_DURATION_MS
  ): void {
    if (this.state.mode === 'chat') {
      return
    }

    const normalizedText = text.trim()

    if (!normalizedText) {
      return
    }

    this.clearSpeechTimer()
    this.setState({ mode: 'speech', speechText: normalizedText })
    this.speechTimer = setTimeout(() => this.dismissSpeechBubble(), durationMs)
  }

  dismissSpeechBubble(): void {
    if (this.state.mode !== 'speech') {
      return
    }

    this.clearSpeechTimer()
    this.setState({ mode: 'hidden', speechText: null })
  }

  setPlacement(placement: ChatPlacement): void {
    if (this.state.placement !== placement) {
      this.setState({ placement })
    }
  }

  async sendMessage(content: string): Promise<ChatSendResult> {
    const normalizedContent = content.trim().slice(0, MAX_MESSAGE_LENGTH)

    if (!normalizedContent) {
      return { accepted: false, reason: 'empty-message' }
    }

    if (this.state.mode !== 'chat') {
      return { accepted: false, reason: 'not-open' }
    }

    if (this.state.isProcessing) {
      return { accepted: false, reason: 'processing' }
    }

    const generation = ++this.replyGeneration
    const requestController = new AbortController()
    const userMessage = this.createMessage('user', normalizedContent)
    const messages = this.limitMessages([...this.state.messages, userMessage])

    this.activeRequest = requestController
    this.setState({ messages, isProcessing: true })
    this.notifyPetReaction('talk')

    try {
      const reply = await this.options.provider.generateReply({
        characterName: this.state.characterName,
        messages: buildAIConversationContext(this.state.characterName, messages),
        signal: requestController.signal
      })

      if (generation !== this.replyGeneration || this.state.mode !== 'chat') {
        return { accepted: true }
      }

      const assistantMessage = this.createMessage('assistant', reply.text)

      this.setState({
        messages: this.limitMessages([...this.state.messages, assistantMessage]),
        isProcessing: false
      })
      this.notifyPetReaction(reply.action ?? inferPetReaction(reply.text, normalizedContent))
    } catch (error: unknown) {
      if (generation === this.replyGeneration && this.state.mode === 'chat') {
        this.setState({
          messages: this.limitMessages([
            ...this.state.messages,
            this.createMessage('assistant', getSafeAIErrorMessage(error))
          ]),
          isProcessing: false
        })
        this.options.onProviderError?.(error)
      }
    } finally {
      if (this.activeRequest === requestController) {
        this.activeRequest = undefined
      }
    }

    return { accepted: true }
  }

  dispose(): void {
    this.replyGeneration += 1
    this.cancelActiveRequest()
    this.clearSpeechTimer()
    this.listeners.clear()
    this.petReactionListeners.clear()
  }

  private createMessage(role: ChatMessage['role'], content: string): ChatMessage {
    return {
      id: randomUUID(),
      role,
      content,
      createdAt: Date.now()
    }
  }

  private limitMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.slice(-MAX_IN_MEMORY_MESSAGES)
  }

  private notifyPetReaction(action: ChatPetReaction): void {
    for (const listener of this.petReactionListeners) {
      listener(action)
    }
  }

  private setState(update: Partial<ChatState>): void {
    this.state = { ...this.state, ...update }

    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private clearSpeechTimer(): void {
    if (this.speechTimer) {
      clearTimeout(this.speechTimer)
      this.speechTimer = undefined
    }
  }

  private cancelActiveRequest(): void {
    this.activeRequest?.abort()
    this.activeRequest = undefined
  }
}
