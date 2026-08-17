import type { ChatMessage } from '../../shared/chat'
import type { AIProvider } from '../ai/ai-provider'
import {
  MEMORY_SENSITIVITY_LEVELS,
  type GeneralMemoryCandidate,
  type MemoryCandidate,
  type MemoryCandidateRejectionReason,
  type MemoryExtractionResult,
  type ProfileMemoryCandidate
} from './memory-candidate'
import { createMemoryExtractionPrompt } from './memory-extraction-prompt'
import { MEMORY_TYPES, type MemoryType } from './memory-types'

interface ExtractMemoryInput {
  currentMessage: string
  recentMessages: readonly ChatMessage[]
  signal?: AbortSignal
}

const MAX_CANDIDATES = 3
const MAX_RECENT_USER_MESSAGES = 4
const MAX_SOURCE_QUOTE_LENGTH = 240
const MAX_PROFILE_KEY_LENGTH = 64
const MAX_PROFILE_VALUE_LENGTH = 500
const MAX_MEMORY_CONTENT_LENGTH = 1_000

export class MemoryExtractor {
  constructor(private readonly provider: AIProvider) {}

  async extract(input: ExtractMemoryInput): Promise<MemoryExtractionResult> {
    const recentUserMessages = input.recentMessages
      .filter(({ role }) => role === 'user')
      .slice(-MAX_RECENT_USER_MESSAGES)
      .map(({ content }) => content)
    const reply = await this.provider.generateReply({
      characterName: 'Memory Extractor',
      messages: [
        { role: 'system', content: createMemoryExtractionPrompt() },
        {
          role: 'user',
          content: JSON.stringify({
            recentUserMessages,
            currentMessage: input.currentMessage
          })
        }
      ],
      signal: input.signal
    })

    const parsed = parseStructuredCandidates(reply.text)

    return {
      ...parsed,
      requestedPetActions: reply.actions?.length ?? 0
    }
  }
}

function parseStructuredCandidates(text: string): Omit<MemoryExtractionResult, 'requestedPetActions'> {
  let parsed: unknown

  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch {
    return { candidates: [], rejectedReasons: ['invalid-structured-output'] }
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
    return { candidates: [], rejectedReasons: ['invalid-structured-output'] }
  }

  const candidates: MemoryCandidate[] = []
  const rejectedReasons: MemoryCandidateRejectionReason[] = []

  for (const rawCandidate of parsed.candidates.slice(0, MAX_CANDIDATES)) {
    const candidate = parseCandidate(rawCandidate)

    if (candidate) {
      candidates.push(candidate)
    } else {
      rejectedReasons.push('invalid-candidate')
    }
  }

  if (parsed.candidates.length > MAX_CANDIDATES) {
    rejectedReasons.push('candidate-limit-exceeded')
  }

  return { candidates, rejectedReasons }
}

function parseCandidate(value: unknown): MemoryCandidate | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const base = parseCandidateBase(value)
  const category = value.category

  if (!base || !isMemoryType(category)) {
    return undefined
  }

  if (category === 'profile') {
    if (
      !isBoundedText(value.key, MAX_PROFILE_KEY_LENGTH) ||
      !isBoundedText(value.value, MAX_PROFILE_VALUE_LENGTH)
    ) {
      return undefined
    }

    const candidate: ProfileMemoryCandidate = {
      ...base,
      category,
      key: value.key.trim(),
      value: value.value.trim()
    }

    return candidate
  }

  if (!isBoundedText(value.content, MAX_MEMORY_CONTENT_LENGTH)) {
    return undefined
  }

  const candidate: GeneralMemoryCandidate = {
    ...base,
    category,
    content: value.content.trim()
  }

  return candidate
}

function parseCandidateBase(
  value: Record<string, unknown>
): Omit<ProfileMemoryCandidate, 'category' | 'key' | 'value'> | undefined {
  if (
    typeof value.shouldRemember !== 'boolean' ||
    !isProbability(value.confidence) ||
    !isProbability(value.importance) ||
    typeof value.explicitRequest !== 'boolean' ||
    !MEMORY_SENSITIVITY_LEVELS.includes(value.sensitivity as never) ||
    !isBoundedText(value.sourceQuote, MAX_SOURCE_QUOTE_LENGTH)
  ) {
    return undefined
  }

  return {
    shouldRemember: value.shouldRemember,
    confidence: value.confidence,
    importance: value.importance,
    explicitRequest: value.explicitRequest,
    sensitivity: value.sensitivity as ProfileMemoryCandidate['sensitivity'],
    sourceQuote: value.sourceQuote.trim()
  }
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

function isMemoryType(value: unknown): value is MemoryType {
  return MEMORY_TYPES.includes(value as MemoryType)
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
