import type { AIPetAction } from '../../shared/ai-pet-action'
import type { AIChatRequest, AIChatResponse, AIProvider } from '../ai/ai-provider'
import {
  createUnpacedReplyPlan,
  formatCompanionReplyPlanText
} from '../ai/companion-reply-plan'

const FAKE_REPLY_DELAY_MS = 480

export class LocalReplyProvider implements AIProvider {
  readonly id = 'local' as const

  async generateReply(request: AIChatRequest): Promise<AIChatResponse> {
    await delay(FAKE_REPLY_DELAY_MS)

    if (request.signal?.aborted) {
      throw new DOMException('The local reply was cancelled.', 'AbortError')
    }

    const userMessages = request.messages
      .filter(({ role }) => role === 'user')
      .map(({ content }) => content)
    const message = userMessages.at(-1) ?? ''

    const normalizedMessage = message.toLowerCase()
    const earlierUserContext = userMessages.slice(0, -1).join(' ').toLowerCase()
    const timeOfDay = readTimeOfDay(request)

    if (containsAny(normalizedMessage, ['2+2等于多少', '2 + 2等于多少', '2+2是多少'])) {
      return createPlannedResponse(['4。'])
    }

    if (containsAny(normalizedMessage, ['跳一下', '跳一个', '跳起来'])) {
      return createPlannedResponse(['行，看好了。'], ['jump'])
    }

    if (normalizedMessage.includes('我还在工作')) {
      return createPlannedResponse([
        timeOfDay === 'late_night' ? '这个点还在忙？' : '还在忙啊？'
      ])
    }

    if (
      containsAny(normalizedMessage, ['我拿奖了', '我获奖了']) &&
      containsAny(earlierUserContext, ['明天有比赛', '明天比赛', '有点紧张'])
    ) {
      return {
        ...createPlannedResponse(
          ['等等，你刚才还在紧张，结果真拿奖了？', '最后第几名？'],
          ['happy']
        )
      }
    }

    if (containsAny(normalizedMessage, ['比赛获奖', '比赛拿奖', '我拿奖了', '我获奖了'])) {
      return createPlannedResponse(
        ['真的假的？你还真拿下了 😂', '最后第几名？'],
        ['happy']
      )
    }

    if (containsAny(normalizedMessage, ['上班累死了', '工作累死了', '今天好累'])) {
      return { text: '今天怎么累成这样？是事情特别多，还是碰上糟心事了？', actions: ['sit'] }
    }

    if (containsAny(normalizedMessage, ['认识了一个挺有意思的人', '认识了个有意思的人'])) {
      return createPlannedResponse(
        ['听着就有故事。', '这人有意思在哪儿？'],
        ['talk']
      )
    }

    if (containsAny(normalizedMessage, ['老板今天居然夸我了', '老板夸我了'])) {
      return { text: '老板居然开口夸你了？夸你哪件事？', actions: ['happy'] }
    }

    if (containsAny(normalizedMessage, ['明天有比赛', '明天比赛']) && normalizedMessage.includes('紧张')) {
      return { text: '明天就上场了？你现在最担心哪一段？', actions: ['sit'] }
    }

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
        text: 'Long day? What wore you out the most?',
        actions: ['sit']
      }
    }

    if (containsAny(normalizedMessage, ['work', 'project', 'busy'])) {
      return {
        text: 'What part of it has you busiest today?',
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
      { text: 'I’m listening—what happened next?', actions: ['talk'] },
      { text: 'Okay, that caught my attention. What was the interesting part?' },
      { text: 'Got it. I’m here.' }
    ]
    const replyIndex = hashMessage(normalizedMessage) % fallbackReplies.length

    return fallbackReplies[replyIndex] ?? fallbackReplies[0]
  }
}

function createPlannedResponse(
  segments: readonly string[],
  actions: readonly AIPetAction[] = []
): AIChatResponse {
  const replyPlan = createUnpacedReplyPlan(segments)

  return {
    text: formatCompanionReplyPlanText(replyPlan),
    replyPlan,
    ...(actions.length > 0 ? { actions } : {})
  }
}

function readTimeOfDay(request: AIChatRequest): string | undefined {
  for (const message of request.messages) {
    if (message.role !== 'system' || !message.content.includes('## Local desktop time')) {
      continue
    }

    const match = message.content.match(/"timeOfDay":"([a-z_]+)"/)

    return match?.[1]
  }

  return undefined
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
