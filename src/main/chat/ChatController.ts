import { randomUUID } from 'node:crypto'

import {
  validateAIPetActionSequence,
  type AIPetAction
} from '../../shared/ai-pet-action'
import type {
  ChatMessage,
  ChatPlacement,
  ChatProviderInfo,
  ChatSendResult,
  ChatState
} from '../../shared/chat'
import type { AIProvider } from '../ai/ai-provider'
import { getSafeAIErrorMessage } from '../ai/ai-provider-error'
import {
  createSingleSegmentReplyPlan,
  normalizeReplyPlanForTurn
} from '../ai/companion-reply-plan'
import { buildAIConversationContext } from '../ai/conversation-context'
import { isDirectPetActionCommand } from '../ai/reply-plan-instruction'
import type { CompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import type {
  LongTermMemoryCoordinator,
  LongTermMemoryDiagnostics
} from '../memory/LongTermMemoryCoordinator'
import type { MemoryManager } from '../memory/MemoryManager'
import {
  getLocalDesktopTimeContext,
  type LocalDesktopTimeContext
} from './local-time-context'
import { ReplyPlanScheduler } from './ReplyPlanScheduler'
import { createPacedReplyPlan } from './reply-pacing'

type ChatListener = (state: ChatState) => void
type PetActionsListener = (actions: readonly AIPetAction[]) => void

export interface ChatProviderReplyDiagnostics {
  provider: AIProvider['id']
  textReturned: boolean
  textLength: number
  segmentCount: number
  segmentDelaysMs: readonly number[]
  usedStructuredReplyPlan: boolean
  validatedActions: readonly AIPetAction[]
  rejectedActionRequests: readonly string[]
}

export interface ReplyPlanCancellationDiagnostics {
  reason: 'new-user-turn' | 'chat-closed' | 'disposed'
  turnId: number
  cancelledSegments: number
}

export interface ChatPersistenceErrorDiagnostics {
  operation: 'persist-conversation-message'
  error: unknown
}

interface ChatControllerOptions {
  characterName: string
  provider: AIProvider
  providerInfo: ChatProviderInfo
  memoryManager: MemoryManager
  longTermMemory: Pick<LongTermMemoryCoordinator, 'prepare'>
  companionState: CompanionStateCoordinator
  getLocalTimeContext?: () => LocalDesktopTimeContext
  onProviderError?: (error: unknown) => void
  onProviderReply?: (diagnostics: ChatProviderReplyDiagnostics) => void
  onReplyPlanCancelled?: (diagnostics: ReplyPlanCancellationDiagnostics) => void
  onMemoryDiagnostics?: (diagnostics: LongTermMemoryDiagnostics) => void
  onPersistenceError?: (diagnostics: ChatPersistenceErrorDiagnostics) => void
}

const DEFAULT_SPEECH_DURATION_MS = 4_500
const MAX_MESSAGE_LENGTH = 2_000
const MAX_IN_MEMORY_MESSAGES = 40

export class ChatController {
  private readonly listeners = new Set<ChatListener>()
  private readonly petActionsListeners = new Set<PetActionsListener>()
  private speechTimer: NodeJS.Timeout | undefined
  private activeRequest: AbortController | undefined
  private readonly replyPlanScheduler = new ReplyPlanScheduler()
  private replyGeneration = 0
  private state: ChatState

  constructor(private readonly options: ChatControllerOptions) {
    this.state = {
      mode: 'hidden',
      placement: 'right',
      messages: [],
      speechText: null,
      isProcessing: false,
      isWaitingForSegment: false,
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

  subscribeToPetActions(listener: PetActionsListener): () => void {
    this.petActionsListeners.add(listener)

    return () => this.petActionsListeners.delete(listener)
  }

  openChat(): void {
    this.clearSpeechTimer()

    let messages = this.state.messages

    if (messages.length === 0) {
      const greeting = this.createMessage(
        'assistant',
        `Hey! I'm ${this.state.characterName}. What would you like to talk about?`
      )

      messages = [greeting]
      this.persistConversationMessage(greeting)
    }

    this.setState({ mode: 'chat', messages, speechText: null })
  }

  closeChat(): void {
    this.replyGeneration += 1
    this.cancelActiveRequest()
    this.cancelPendingReply('chat-closed', false)
    this.clearSpeechTimer()
    this.setState({
      mode: 'hidden',
      speechText: null,
      isProcessing: false,
      isWaitingForSegment: false
    })
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

  setCharacterName(characterName: string): void {
    const normalizedName = characterName.trim()

    if (normalizedName && this.state.characterName !== normalizedName) {
      this.setState({ characterName: normalizedName })
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
      if (this.state.isWaitingForSegment && this.replyPlanScheduler.hasPendingTurn()) {
        this.cancelPendingReply('new-user-turn')
      } else {
        return { accepted: false, reason: 'processing' }
      }
    }

    const generation = ++this.replyGeneration
    const requestController = new AbortController()
    const userMessage = this.createMessage('user', normalizedContent)
    const messages = this.limitMessages([...this.state.messages, userMessage])

    this.activeRequest = requestController
    this.setState({ messages, isProcessing: true, isWaitingForSegment: false })
    this.persistConversationMessage(userMessage)
    this.notifyPetActions(['talk'])

    try {
      const localTime =
        this.options.getLocalTimeContext?.() ?? getLocalDesktopTimeContext()
      const preparedMemory = await this.options.longTermMemory.prepare({
        currentMessage: normalizedContent,
        recentMessages: messages.slice(0, -1),
        signal: requestController.signal
      })

      this.options.onMemoryDiagnostics?.(preparedMemory.diagnostics)

      const companionState = this.options.companionState.recordConversation(
        normalizedContent,
        preparedMemory.diagnostics
      )

      if (generation !== this.replyGeneration || this.state.mode !== 'chat') {
        return { accepted: true }
      }

      const reply = await this.options.provider.generateReply({
        characterName: this.state.characterName,
        responseFormat: 'companion-reply-plan',
        petActionToolChoice: isDirectPetActionCommand(normalizedContent)
          ? 'required'
          : 'auto',
        messages: buildAIConversationContext(
          this.state.characterName,
          messages,
          preparedMemory.context,
          companionState,
          localTime
        ),
        signal: requestController.signal
      })

      if (generation !== this.replyGeneration || this.state.mode !== 'chat') {
        return { accepted: true }
      }

      const actionValidation = validateAIPetActionSequence(reply.actions ?? [])
      const rejectedActionRequests = [
        ...(reply.rejectedActionRequests ?? []),
        ...actionValidation.rejected
      ]

      const replyPlan = createPacedReplyPlan({
        plan: normalizeReplyPlanForTurn(
          reply.replyPlan ?? createSingleSegmentReplyPlan(reply.text),
          normalizedContent
        ),
        actions: actionValidation.actions,
        emotion: companionState.emotion
      })

      this.options.onProviderReply?.({
        provider: this.options.provider.id,
        textReturned: reply.text.trim().length > 0,
        textLength: reply.text.length,
        segmentCount: replyPlan.segments.length,
        segmentDelaysMs: replyPlan.segments.map(({ delayBeforeMs }) => delayBeforeMs),
        usedStructuredReplyPlan: reply.replyPlan !== undefined,
        validatedActions: actionValidation.actions,
        rejectedActionRequests
      })

      const firstSegment = replyPlan.segments[0]

      if (!firstSegment) {
        throw new Error('Reply plan did not contain a visible segment')
      }

      this.speakSegment(firstSegment)

      const remainingSegments = replyPlan.segments.slice(1)

      if (remainingSegments.length === 0) {
        this.setState({ isProcessing: false, isWaitingForSegment: false })
      } else {
        this.setState({ isProcessing: true, isWaitingForSegment: true })
        this.replyPlanScheduler.start(generation, remainingSegments, {
          onSegment: (segment) => {
            if (generation === this.replyGeneration && this.state.mode === 'chat') {
              this.speakSegment(segment)
            }
          },
          onComplete: () => {
            if (generation === this.replyGeneration && this.state.mode === 'chat') {
              this.setState({ isProcessing: false, isWaitingForSegment: false })
            }
          }
        })
      }
    } catch (error: unknown) {
      if (generation === this.replyGeneration && this.state.mode === 'chat') {
        const errorMessage = this.createMessage('assistant', getSafeAIErrorMessage(error))

        this.setState({
          messages: this.limitMessages([...this.state.messages, errorMessage]),
          isProcessing: false,
          isWaitingForSegment: false
        })
        this.persistConversationMessage(errorMessage)
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
    this.cancelPendingReply('disposed', false)
    this.replyPlanScheduler.dispose()
    this.clearSpeechTimer()
    this.listeners.clear()
    this.petActionsListeners.clear()
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

  private persistConversationMessage(message: ChatMessage): void {
    try {
      this.options.memoryManager.addConversationMessage({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt
      })
    } catch (error: unknown) {
      this.options.onPersistenceError?.({
        operation: 'persist-conversation-message',
        error
      })
    }
  }

  private speakSegment(segment: {
    text: string
    actions: readonly AIPetAction[]
  }): void {
    const assistantMessage = this.createMessage('assistant', segment.text)

    this.setState({
      messages: this.limitMessages([...this.state.messages, assistantMessage])
    })
    this.persistConversationMessage(assistantMessage)

    if (segment.actions.length > 0) {
      this.options.companionState.handleAIResponse(segment.actions)
      this.notifyPetActions(segment.actions)
    }
  }

  private cancelPendingReply(
    reason: ReplyPlanCancellationDiagnostics['reason'],
    updateState = true
  ): void {
    const cancelled = this.replyPlanScheduler.cancel()

    if (!cancelled) {
      return
    }

    this.options.onReplyPlanCancelled?.({ reason, ...cancelled })

    if (updateState) {
      this.setState({ isProcessing: false, isWaitingForSegment: false })
    }
  }

  private notifyPetActions(actions: readonly AIPetAction[]): void {
    if (actions.length === 0) {
      return
    }

    for (const listener of this.petActionsListeners) {
      listener(actions)
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
