export type AIProviderErrorCode =
  | 'authentication'
  | 'cancelled'
  | 'insufficient-balance'
  | 'invalid-request'
  | 'malformed-response'
  | 'network'
  | 'provider-unavailable'
  | 'rate-limit'
  | 'server'
  | 'timeout'

interface AIProviderErrorOptions {
  status?: number
  cause?: unknown
  technicalMessage?: string
}

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode
  readonly status?: number
  readonly technicalMessage?: string

  constructor(code: AIProviderErrorCode, options: AIProviderErrorOptions = {}) {
    super(getAIProviderUserMessage(code), { cause: options.cause })
    this.name = 'AIProviderError'
    this.code = code
    this.status = options.status
    this.technicalMessage = options.technicalMessage
  }
}

export function getSafeAIErrorMessage(error: unknown): string {
  return error instanceof AIProviderError
    ? getAIProviderUserMessage(error.code)
    : "I couldn't reach the AI service just now. Please try again."
}

function getAIProviderUserMessage(code: AIProviderErrorCode): string {
  switch (code) {
    case 'authentication':
      return "I couldn't authenticate with DeepSeek. Check the configured API key."
    case 'insufficient-balance':
      return 'The DeepSeek account has insufficient balance for a reply.'
    case 'invalid-request':
      return "I couldn't send that request to the AI service. Please try again."
    case 'malformed-response':
      return 'The AI service returned an unreadable reply. Please try again.'
    case 'network':
      return "I couldn't reach the AI service. Check your connection and try again."
    case 'provider-unavailable':
    case 'server':
      return 'The AI service is unavailable right now. Please try again shortly.'
    case 'rate-limit':
      return 'The AI service is busy. Please wait a moment and try again.'
    case 'timeout':
      return 'The AI reply took too long. Please try again.'
    case 'cancelled':
      return 'The AI reply was cancelled.'
  }
}
