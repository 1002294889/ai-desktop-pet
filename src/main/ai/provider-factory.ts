import type { ChatProviderInfo } from '../../shared/chat'
import { LocalReplyProvider } from '../chat/LocalReplyProvider'
import type { AIProvider } from './ai-provider'
import type { AIConfiguration } from './config'
import { DeepSeekProvider } from './DeepSeekProvider'

export interface AIProviderSelection {
  provider: AIProvider
  info: ChatProviderInfo
  fallbackReason?: 'missing-api-key'
}

export function createAIProvider(configuration: AIConfiguration): AIProviderSelection {
  if (configuration.requestedProvider === 'local') {
    return {
      provider: new LocalReplyProvider(),
      info: {
        requestedProvider: 'local',
        activeProvider: 'local',
        model: null,
        usingFallback: false
      }
    }
  }

  const { apiKey, baseUrl, model, timeoutMs } = configuration.deepSeek

  if (!apiKey) {
    return {
      provider: new LocalReplyProvider(),
      info: {
        requestedProvider: 'deepseek',
        activeProvider: 'local',
        model: null,
        usingFallback: true
      },
      fallbackReason: 'missing-api-key'
    }
  }

  return {
    provider: new DeepSeekProvider({ apiKey, baseUrl, model, timeoutMs }),
    info: {
      requestedProvider: 'deepseek',
      activeProvider: 'deepseek',
      model,
      usingFallback: false
    }
  }
}
