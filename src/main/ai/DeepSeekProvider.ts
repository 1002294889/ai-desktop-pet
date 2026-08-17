import type { AIChatMessage, AIChatRequest, AIChatResponse, AIProvider } from './ai-provider'
import { AIProviderError } from './ai-provider-error'
import {
  parsePetActionToolCalls,
  PLAY_PET_ACTION_TOOL,
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
        'auto',
        requestController.signal
      )
      const parsedToolCalls = parsePetActionToolCalls(initialMessage.tool_calls)

      if (parsedToolCalls.toolCalls.length === 0) {
        return {
          text: getRequiredTextContent(initialMessage.content),
          ...(parsedToolCalls.rejected.length > 0
            ? { rejectedActionRequests: parsedToolCalls.rejected }
            : {})
        }
      }

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
        requestController.signal
      )

      return {
        text: getRequiredTextContent(finalMessage.content),
        ...(parsedToolCalls.actions.length > 0
          ? { actions: parsedToolCalls.actions }
          : {}),
        ...(parsedToolCalls.rejected.length > 0
          ? { rejectedActionRequests: parsedToolCalls.rejected }
          : {})
      }
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
    toolChoice: 'auto' | 'none',
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
        max_tokens: 350,
        tools: [PLAY_PET_ACTION_TOOL],
        tool_choice: toolChoice,
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
