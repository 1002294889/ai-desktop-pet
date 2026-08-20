import type { AIPetAction } from '../../shared/ai-pet-action'
import { getReplySegmentationMode } from './reply-plan-instruction'

export interface CompanionReplySegment {
  text: string
  delayBeforeMs: number
  actions: readonly AIPetAction[]
}

export interface CompanionReplyPlan {
  segments: readonly CompanionReplySegment[]
}

const MAX_REPLY_SEGMENTS = 3
const MAX_SEGMENT_LENGTH = 500
const MAX_TOTAL_REPLY_LENGTH = 1_200

export function parseCompanionReplyPlan(text: string): CompanionReplyPlan | undefined {
  let parsed: unknown

  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.segments)) {
    return undefined
  }

  if (parsed.segments.length === 0 || parsed.segments.length > MAX_REPLY_SEGMENTS) {
    return undefined
  }

  const segments: CompanionReplySegment[] = []
  let totalLength = 0

  for (const value of parsed.segments) {
    if (!isRecord(value) || typeof value.text !== 'string') {
      return undefined
    }

    const segmentText = value.text.trim()

    if (!segmentText || segmentText.length > MAX_SEGMENT_LENGTH) {
      return undefined
    }

    totalLength += segmentText.length

    if (totalLength > MAX_TOTAL_REPLY_LENGTH) {
      return undefined
    }

    segments.push({ text: segmentText, delayBeforeMs: 0, actions: [] })
  }

  return { segments }
}

export function createSingleSegmentReplyPlan(text: string): CompanionReplyPlan {
  return {
    segments: [{ text: getSafeFallbackText(text), delayBeforeMs: 0, actions: [] }]
  }
}

export function normalizeReplyPlanForTurn(
  plan: CompanionReplyPlan,
  userMessage: string
): CompanionReplyPlan {
  const mode = getReplySegmentationMode(userMessage)

  if (mode === 'single') {
    return createSingleSegmentReplyPlan(plan.segments[0]?.text ?? '')
  }

  if (plan.segments.length <= 1) {
    return mode === 'reaction_follow_up'
      ? splitCombinedReactionAndFollowUp(plan.segments[0]) ?? plan
      : plan
  }

  let finalQuestionIndex = -1

  for (let index = plan.segments.length - 1; index >= 0; index -= 1) {
    if (/[?？]\s*$/u.test(plan.segments[index]?.text ?? '')) {
      finalQuestionIndex = index
      break
    }
  }

  if (finalQuestionIndex <= 0) {
    return plan
  }

  return {
    segments: plan.segments.map((segment, index) =>
      index < finalQuestionIndex
        ? { ...segment, text: removeInformationSeekingQuestions(segment.text) }
        : segment
    )
  }
}

export function createUnpacedReplyPlan(
  segmentTexts: readonly string[]
): CompanionReplyPlan {
  return {
    segments: segmentTexts.map((text) => ({
      text: text.trim(),
      delayBeforeMs: 0,
      actions: []
    }))
  }
}

export function formatCompanionReplyPlanText(plan: CompanionReplyPlan): string {
  return plan.segments.map(({ text }) => text).join('\n')
}

function stripOptionalCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)

  return fenced?.[1]?.trim() ?? trimmed
}

function extractJsonObject(text: string): string {
  const candidate = stripOptionalCodeFence(text)
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return candidate
  }

  return candidate.slice(firstBrace, lastBrace + 1)
}

function getSafeFallbackText(text: string): string {
  const trimmed = stripOptionalCodeFence(text)

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown

    if (isRecord(parsed) && typeof parsed.text === 'string' && parsed.text.trim()) {
      return parsed.text.trim()
    }

    if (isRecord(parsed) && Array.isArray(parsed.segments)) {
      const segmentTexts = parsed.segments
        .filter(isRecord)
        .map(({ text: segmentText }) =>
          typeof segmentText === 'string' ? segmentText.trim() : ''
        )
        .filter(Boolean)

      if (segmentTexts.length > 0) {
        return segmentTexts.join(' ').slice(0, MAX_TOTAL_REPLY_LENGTH)
      }
    }
  } catch {
    const extractedTexts = [...trimmed.matchAll(/"text"\s*:\s*("(?:\\.|[^"\\])*")/g)]
      .map((match) => {
        try {
          return JSON.parse(match[1] ?? '') as unknown
        } catch {
          return undefined
        }
      })
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    if (extractedTexts.length > 0) {
      return extractedTexts.join(' ').slice(0, MAX_TOTAL_REPLY_LENGTH)
    }
  }

  return /[\u3400-\u9fff]/u.test(trimmed)
    ? '刚才那句没组织好，你再说一次？'
    : 'I lost the thread for a moment—could you say that again?'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function removeInformationSeekingQuestions(text: string): string {
  const parts = text.match(/[^。.!！?？]+[。.!！?？]?/gu) ?? [text]
  const retained = parts.filter((part) => {
    return !isInformationSeekingQuestion(part)
  })
  const normalized = retained.join('').trim()

  return normalized || text.replace(/[?？]/gu, '！')
}

function splitCombinedReactionAndFollowUp(
  segment: CompanionReplySegment | undefined
): CompanionReplyPlan | undefined {
  if (!segment) {
    return undefined
  }

  const parts = segment.text.match(/[^。.!！?？]+[。.!！?？]?/gu) ?? []
  const followUpIndex = parts.findIndex(isInformationSeekingQuestion)

  if (followUpIndex <= 0 || followUpIndex !== parts.length - 1) {
    return undefined
  }

  const reaction = parts.slice(0, followUpIndex).join('').trim()
  const followUp = parts[followUpIndex]?.trim()

  if (!reaction || !followUp) {
    return undefined
  }

  return {
    segments: [
      { ...segment, text: reaction },
      { text: followUp, delayBeforeMs: 0, actions: [] }
    ]
  }
}

function isInformationSeekingQuestion(text: string): boolean {
  return (
    /[?？]/u.test(text) &&
    /(什么|哪个|哪儿|哪里|怎么|为何|为什么|谁|多少|几名|第几|何时|吗|when|where|who|what|which|why|how|how many)/iu.test(
      text
    )
  )
}
