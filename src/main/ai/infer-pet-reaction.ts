import type { ChatPetReaction } from '../../shared/chat'

export function inferPetReaction(text: string, userMessage: string): ChatPetReaction {
  const combinedText = `${userMessage} ${text}`.toLowerCase()

  if (containsAny(combinedText, ['hello', 'hi ', 'hey', 'goodbye', 'bye', 'see you'])) {
    return 'wave'
  }

  if (
    containsAny(combinedText, [
      'happy',
      'great',
      'glad',
      'wonderful',
      'congrat',
      'thank',
      'proud'
    ])
  ) {
    return 'happy'
  }

  return 'talk'
}

function containsAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase))
}
