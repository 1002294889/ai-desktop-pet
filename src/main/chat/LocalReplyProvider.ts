import type { AIChatRequest, AIChatResponse, AIProvider } from '../ai/ai-provider'

const FAKE_REPLY_DELAY_MS = 480

export class LocalReplyProvider implements AIProvider {
  readonly id = 'local' as const

  async generateReply(request: AIChatRequest): Promise<AIChatResponse> {
    await delay(FAKE_REPLY_DELAY_MS)

    if (request.signal?.aborted) {
      throw new DOMException('The local reply was cancelled.', 'AbortError')
    }

    const message = [...request.messages].reverse().find(({ role }) => role === 'user')?.content ?? ''

    const normalizedMessage = message.toLowerCase()

    if (containsAny(normalizedMessage, ['hello', 'hi', 'hey'])) {
      return { text: 'Hi! Nice to see you.', action: 'wave' }
    }

    if (containsAny(normalizedMessage, ['how are you', 'how are things'])) {
      return {
        text: "I'm doing great! I've been wandering around your desktop.",
        action: 'happy'
      }
    }

    if (containsAny(normalizedMessage, ['tired', 'exhausted', 'sleepy'])) {
      return {
        text: 'You sound tired. Maybe stay here with me for a little while.',
        action: 'happy'
      }
    }

    if (containsAny(normalizedMessage, ['work', 'project', 'busy'])) {
      return {
        text: "That sounds like a lot. I'll keep you company while you work on it.",
        action: 'happy'
      }
    }

    if (containsAny(normalizedMessage, ['your name', 'who are you'])) {
      return {
        text: `I'm ${request.characterName}, your little desktop companion.`,
        action: 'wave'
      }
    }

    if (containsAny(normalizedMessage, ['thank', 'thanks'])) {
      return { text: "You're welcome! I'm happy to be here.", action: 'happy' }
    }

    const fallbackReplies: readonly AIChatResponse[] = [
      { text: "I'm listening. Tell me a little more!", action: 'talk' },
      { text: 'That sounds interesting. What happened next?', action: 'wave' },
      { text: "I'm right here with you.", action: 'happy' }
    ]
    const replyIndex = hashMessage(normalizedMessage) % fallbackReplies.length

    return fallbackReplies[replyIndex] ?? fallbackReplies[0]
  }
}

function containsAny(message: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => message.includes(phrase))
}

function hashMessage(message: string): number {
  let hash = 0

  for (const character of message) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
