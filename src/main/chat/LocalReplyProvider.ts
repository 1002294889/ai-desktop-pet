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

    if (containsAny(normalizedMessage, ['amazing news', 'incredible news', 'so excited'])) {
      return {
        text: "That's amazing! I'm excited with you!",
        actions: ['happy', 'jump']
      }
    }

    if (containsAny(normalizedMessage, ['good news', 'great news', 'i did it', 'i won'])) {
      return { text: "That's wonderful news! I'm really happy for you.", actions: ['happy'] }
    }

    if (containsAny(normalizedMessage, ['goodbye', 'bye', 'see you'])) {
      return { text: "See you soon! I'll be right here.", actions: ['wave'] }
    }

    if (containsAny(normalizedMessage, ['going to sleep', 'bedtime', 'good night'])) {
      return { text: 'Good night! Rest well.', actions: ['wave', 'sleep'] }
    }

    if (containsAny(normalizedMessage, ['wake up', 'good morning'])) {
      return { text: "I'm awake! Good morning!", actions: ['wake', 'wave'] }
    }

    if (containsAny(normalizedMessage, ['annoying', 'frustrating', 'so unfair'])) {
      return { text: "Hmph! That's frustrating—but I'm on your side.", actions: ['angry'] }
    }

    if (containsAnyWord(normalizedMessage, ['hello', 'hi', 'hey'])) {
      return { text: 'Hi! Nice to see you.', actions: ['wave'] }
    }

    if (containsAny(normalizedMessage, ['how are you', 'how are things'])) {
      return {
        text: "I'm doing great! I've been wandering around your desktop.",
        actions: ['happy']
      }
    }

    if (containsAny(normalizedMessage, ['tired', 'exhausted', 'sleepy'])) {
      return {
        text: 'You sound tired. Maybe stay here with me for a little while.',
        actions: ['sit']
      }
    }

    if (containsAny(normalizedMessage, ['work', 'project', 'busy'])) {
      return {
        text: "That sounds like a lot. I'll keep you company while you work on it.",
        actions: ['talk']
      }
    }

    if (containsAny(normalizedMessage, ['your name', 'who are you'])) {
      return {
        text: `I'm ${request.characterName}, your little desktop companion.`,
        actions: ['wave']
      }
    }

    if (containsAny(normalizedMessage, ['thank', 'thanks'])) {
      return { text: "You're welcome! I'm happy to be here.", actions: ['happy'] }
    }

    const fallbackReplies: readonly AIChatResponse[] = [
      { text: "I'm listening. Tell me a little more!", actions: ['talk'] },
      { text: 'That sounds interesting. What happened next?' },
      { text: "I'm right here with you.", actions: ['talk'] }
    ]
    const replyIndex = hashMessage(normalizedMessage) % fallbackReplies.length

    return fallbackReplies[replyIndex] ?? fallbackReplies[0]
  }
}

function containsAny(message: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => message.includes(phrase))
}

function containsAnyWord(message: string, words: readonly string[]): boolean {
  const messageWords = message.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

  return words.some((word) => messageWords.includes(word))
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
