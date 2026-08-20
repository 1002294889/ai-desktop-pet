import type { AIPetAction } from '../../shared/ai-pet-action'
import type { EmotionSnapshot, EmotionState } from '../../shared/companion-state'
import type {
  CompanionReplyPlan,
  CompanionReplySegment
} from '../ai/companion-reply-plan'

interface ReplyPacingInput {
  plan: CompanionReplyPlan
  actions: readonly AIPetAction[]
  emotion: EmotionSnapshot
}

interface DynamicDelayInput {
  previousText: string
  text: string
  segmentIndex: number
  emotion: Pick<EmotionSnapshot, 'state' | 'intensity'>
}

interface DelayRange {
  minimum: number
  maximum: number
}

const SHORT_REACTION_RANGE: DelayRange = { minimum: 400, maximum: 1_000 }
const NORMAL_PAUSE_RANGE: DelayRange = { minimum: 900, maximum: 2_200 }
const THOUGHTFUL_PAUSE_RANGE: DelayRange = { minimum: 1_500, maximum: 3_500 }

export function createPacedReplyPlan(input: ReplyPacingInput): CompanionReplyPlan {
  const segments = input.plan.segments.map((segment, index): CompanionReplySegment => ({
    text: segment.text,
    delayBeforeMs:
      index === 0
        ? 0
        : calculateDynamicReplyDelay({
            previousText: input.plan.segments[index - 1]?.text ?? '',
            text: segment.text,
            segmentIndex: index,
            emotion: input.emotion
          }),
    actions: index === 0 ? [...input.actions] : []
  }))

  return { segments }
}

export function calculateDynamicReplyDelay(input: DynamicDelayInput): number {
  const length = [...input.text].length
  const previousLength = [...input.previousText].length
  const punctuationCount = input.text.match(/[，,。.!！?？…]/g)?.length ?? 0
  const isFollowUpQuestion = /[?？]\s*$/u.test(input.text)
  const isThoughtful =
    /[…]|——|其实|想了想|说真的/u.test(input.text) || length >= 54
  const range = isThoughtful
    ? THOUGHTFUL_PAUSE_RANGE
    : isFollowUpQuestion
      ? NORMAL_PAUSE_RANGE
      : length <= 18
        ? SHORT_REACTION_RANGE
        : NORMAL_PAUSE_RANGE
  const base = isThoughtful
    ? 1_450 + length * 22 + previousLength * 7
    : isFollowUpQuestion
      ? 820 + length * 27 + previousLength * 8
      : length <= 18
        ? 360 + length * 25 + previousLength * 5
        : 780 + length * 23 + previousLength * 7
  const punctuationAdjustment = punctuationCount * (isThoughtful ? 110 : 70)
  const variation = deterministicVariation(
    `${input.segmentIndex}:${input.previousText}:${input.text}`
  )
  const emotionMultiplier = getEmotionPacingMultiplier(
    input.emotion.state,
    input.emotion.intensity
  )
  const delay = Math.round(
    (base + punctuationAdjustment + variation) * emotionMultiplier
  )

  return clamp(delay, range.minimum, range.maximum)
}

function getEmotionPacingMultiplier(state: EmotionState, intensity: number): number {
  const boundedIntensity = Math.min(1, Math.max(0, intensity))

  switch (state) {
    case 'excited':
      return 1 - 0.14 * boundedIntensity
    case 'happy':
      return 1 - 0.07 * boundedIntensity
    case 'calm':
      return 1 + 0.1 * boundedIntensity
    case 'sleepy':
      return 1 + 0.18 * boundedIntensity
    case 'annoyed':
      return 1 - 0.03 * boundedIntensity
    case 'neutral':
      return 1
  }
}

function deterministicVariation(value: string): number {
  let hash = 0

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return (hash % 301) - 100
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
