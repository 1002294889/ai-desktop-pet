import type { AIPetAction } from '../../shared/ai-pet-action'
import type { AIChatMessage, AIChatRequest, AIChatResponse, AIProvider } from './ai-provider'
import { AIProviderError } from './ai-provider-error'
import {
  formatCompanionReplyPlanText,
  parseCompanionReplyPlan
} from './companion-reply-plan'
import {
  parsePetActionToolCalls,
  PLAY_PET_ACTION_TOOL,
  PLAY_PET_ACTION_TOOL_NAME,
  type DeepSeekFunctionToolCall,
  type DeepSeekToolResultMessage
} from './deepseek-pet-action-tool'

interface DeepSeekProviderOptions {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  fetchImplementation?: typeof fetch
}

interface DeepSeekCompletionMessage {
  content?: unknown
  tool_calls?: unknown
}

interface DeepSeekChatCompletion {
  choices?: Array<{ message?: DeepSeekCompletionMessage }>
}

interface DeepSeekAssistantToolCallMessage {
  role: 'assistant'
  content: string | null
  tool_calls: DeepSeekFunctionToolCall[]
}

type DeepSeekRequestMessage =
  | AIChatMessage
  | DeepSeekAssistantToolCallMessage
  | DeepSeekToolResultMessage

const COMPANION_RESPONSE_TEMPERATURE = 0.2

export class DeepSeekProvider implements AIProvider {
  readonly id = 'deepseek' as const

  private readonly apiKey: string
  private readonly endpoint: string
  private readonly fetchImplementation: typeof fetch
  private readonly model: string
  private readonly timeoutMs: number

  constructor(options: DeepSeekProviderOptions) {
    this.apiKey = options.apiKey
    this.endpoint = `${options.baseUrl}/chat/completions`
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.model = options.model
    this.timeoutMs = options.timeoutMs
  }

  async generateReply(request: AIChatRequest): Promise<AIChatResponse> {
    const requestController = new AbortController()
    let timedOut = false
    const handleCallerAbort = (): void => requestController.abort(request.signal?.reason)
    const timeout = setTimeout(() => {
      timedOut = true
      requestController.abort()
    }, this.timeoutMs)

    if (request.signal?.aborted) {
      clearTimeout(timeout)
      throw new AIProviderError('cancelled')
    }

    request.signal?.addEventListener('abort', handleCallerAbort, { once: true })

    try {
      const initialMessage = await this.createCompletion(
        request.messages.map(toDeepSeekMessage),
        request.petActionToolChoice === 'required' ? 'required' : 'auto',
        request.petActionToolChoice === 'required'
          ? undefined
          : request.responseFormat,
        requestController.signal
      )
      const parsedToolCalls = parsePetActionToolCalls(initialMessage.tool_calls)
      let response: AIChatResponse

      if (parsedToolCalls.toolCalls.length === 0) {
        response = hasTextContent(initialMessage)
          ? createChatResponse(initialMessage.content, [], parsedToolCalls.rejected)
          : { text: '' }

        if (
          request.responseFormat === 'companion-reply-plan' &&
          response.replyPlan === undefined
        ) {
          const formattedMessage = await this.createCompletion(
            request.messages.map(toDeepSeekMessage),
            'none',
            request.responseFormat,
            requestController.signal
          )

          response = createChatResponse(
            formattedMessage.content,
            [],
            parsedToolCalls.rejected
          )
        } else if (!response.text) {
          response = createChatResponse(
            initialMessage.content,
            [],
            parsedToolCalls.rejected
          )
        }
      } else {
        const finalMessage = await this.createCompletion(
          [
            ...request.messages.map(toDeepSeekMessage),
            {
              role: 'assistant',
              content:
                typeof initialMessage.content === 'string' ? initialMessage.content : null,
              tool_calls: parsedToolCalls.toolCalls
            },
            ...parsedToolCalls.toolResults
          ],
          'none',
          request.responseFormat,
          requestController.signal
        )

        response = createChatResponse(
          finalMessage.content,
          parsedToolCalls.actions,
          parsedToolCalls.rejected
        )
      }

      if (requiresTwoSegmentCorrection(request, response)) {
        const correctedMessage = await this.createCompletion(
          [
            ...request.messages.map(toDeepSeekMessage),
            createInvalidDraftMessage(response),
            createTwoSegmentCorrectionMessage()
          ],
          'none',
          request.responseFormat,
          requestController.signal
        )
        const correctedResponse = createChatResponse(
          correctedMessage.content,
          response.actions ?? [],
          response.rejectedActionRequests ?? []
        )

        if (correctedResponse.replyPlan?.segments.length === 2) {
          response = correctedResponse
        }
      }

      return response
    } catch (error: unknown) {
      if (error instanceof AIProviderError) {
        throw error
      }

      if (timedOut) {
        throw new AIProviderError('timeout', { cause: error })
      }

      if (request.signal?.aborted || isAbortError(error)) {
        throw new AIProviderError('cancelled', { cause: error })
      }

      throw new AIProviderError('network', { cause: error })
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', handleCallerAbort)
    }
  }

  private async createCompletion(
    messages: readonly DeepSeekRequestMessage[],
    toolChoice: 'auto' | 'none' | 'required',
    responseFormat: AIChatRequest['responseFormat'],
    signal: AbortSignal
  ): Promise<DeepSeekCompletionMessage> {
    const message = await this.requestCompletion(
      messages,
      toolChoice,
      responseFormat,
      signal
    )

    if (
      responseFormat === 'companion-reply-plan' &&
      !hasTextContent(message) &&
      !hasToolCalls(message)
    ) {
      return this.requestCompletion(messages, toolChoice, responseFormat, signal)
    }

    return message
  }

  private async requestCompletion(
    messages: readonly DeepSeekRequestMessage[],
    toolChoice: 'auto' | 'none' | 'required',
    responseFormat: AIChatRequest['responseFormat'],
    signal: AbortSignal
  ): Promise<DeepSeekCompletionMessage> {
    const response = await this.fetchImplementation(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        thinking: { type: 'disabled' },
        temperature: COMPANION_RESPONSE_TEMPERATURE,
        max_tokens: 350,
        tools: [PLAY_PET_ACTION_TOOL],
        tool_choice:
          toolChoice === 'required'
            ? {
                type: 'function',
                function: { name: PLAY_PET_ACTION_TOOL_NAME }
              }
            : toolChoice,
        ...(responseFormat === 'companion-reply-plan'
          ? { response_format: { type: 'json_object' } }
          : {}),
        stream: false
      }),
      signal
    })

    if (!response.ok) {
      throw createHttpError(response.status)
    }

    let completion: DeepSeekChatCompletion

    try {
      completion = (await response.json()) as DeepSeekChatCompletion
    } catch (error: unknown) {
      throw new AIProviderError('malformed-response', {
        cause: error,
        technicalMessage: 'DeepSeek returned a non-JSON success response.'
      })
    }

    const message = completion.choices?.[0]?.message

    if (typeof message !== 'object' || message === null) {
      throw new AIProviderError('malformed-response', {
        technicalMessage: 'DeepSeek response did not contain choices[0].message.'
      })
    }

    return message
  }
}

function requiresTwoSegmentCorrection(
  request: AIChatRequest,
  response: AIChatResponse
): boolean {
  return (
    request.responseFormat === 'companion-reply-plan' &&
    request.messages.some(
      ({ role, content }) =>
        role === 'system' && content.includes('Planning mode: reaction_follow_up')
    ) &&
    response.replyPlan?.segments.length !== 2
  )
}

function createTwoSegmentCorrectionMessage(): AIChatMessage {
  return {
    role: 'user',
    content: [
      'Rewrite that draft to correct the JSON shape. Do not discuss the correction.',
      'The segments array MUST contain exactly two objects, with no exceptions.',
      'Segment 1 is a brief reaction with no information request.',
      'Segment 2 asks exactly one specific follow-up question.',
      'Return JSON only: {"segments":[{"text":"brief reaction"},{"text":"one specific follow-up question"}]}'
    ].join('\n')
  }
}

function createInvalidDraftMessage(response: AIChatResponse): AIChatMessage {
  return {
    role: 'assistant',
    content: response.replyPlan
      ? JSON.stringify({
          segments: response.replyPlan.segments.map(({ text }) => ({ text }))
        })
      : response.text
  }
}

function hasTextContent(message: DeepSeekCompletionMessage): boolean {
  return typeof message.content === 'string' && message.content.trim().length > 0
}

function hasToolCalls(message: DeepSeekCompletionMessage): boolean {
  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0
}

function createChatResponse(
  content: unknown,
  actions: readonly AIPetAction[],
  rejectedActionRequests: readonly string[]
): AIChatResponse {
  const rawText = getRequiredTextContent(content)
  const replyPlan = parseCompanionReplyPlan(rawText)

  return {
    text: replyPlan ? formatCompanionReplyPlanText(replyPlan) : rawText,
    ...(replyPlan ? { replyPlan } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(rejectedActionRequests.length > 0 ? { rejectedActionRequests } : {})
  }
}

function toDeepSeekMessage(message: AIChatMessage): AIChatMessage {
  return { role: message.role, content: message.content }
}

function getRequiredTextContent(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AIProviderError('malformed-response', {
      technicalMessage: 'DeepSeek response did not contain a non-empty text reply.'
    })
  }

  return value.trim()
}

function createHttpError(status: number): AIProviderError {
  const errorOptions = { status, technicalMessage: `DeepSeek returned HTTP ${status}.` }

  switch (status) {
    case 400:
    case 422:
      return new AIProviderError('invalid-request', errorOptions)
    case 401:
      return new AIProviderError('authentication', errorOptions)
    case 402:
      return new AIProviderError('insufficient-balance', errorOptions)
    case 429:
      return new AIProviderError('rate-limit', errorOptions)
    case 503:
      return new AIProviderError('provider-unavailable', errorOptions)
    default:
      return new AIProviderError('server', errorOptions)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
