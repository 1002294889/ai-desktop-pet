import type { MemoryManager } from './MemoryManager'
import type {
  GeneralMemoryCandidate,
  MemoryCandidate,
  MemoryCandidateRejectionReason,
  MemoryStorageResult,
  ProfileMemoryCandidate
} from './memory-candidate'
import type { MemoryRecord, MemoryType } from './memory-types'

interface StoreMemoryCandidatesInput {
  candidates: readonly MemoryCandidate[]
  sourceMessages: readonly string[]
  currentMessage: string
}

const STANDARD_CONFIDENCE_THRESHOLD = 0.78
const EXPLICIT_CONFIDENCE_THRESHOLD = 0.65
const STANDARD_IMPORTANCE_THRESHOLD = 0.45
const OTHER_IMPORTANCE_THRESHOLD = 0.7
const MAX_ACCEPTED_CANDIDATES = 3
const PROFILE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

const BLOCKED_PROFILE_KEY_PARTS = [
  'password',
  'passcode',
  'secret',
  'token',
  'api_key',
  'bank',
  'card',
  'account_number',
  'government_id',
  'passport',
  'medical',
  'diagnosis',
  'precise_address',
  'coordinate'
] as const

const EXPLICIT_MEMORY_SIGNALS = [
  '记住',
  '记得',
  '别忘了',
  '以后要记得',
  'remember this',
  'remember that',
  'remember my'
] as const

const TRIVIAL_EPHEMERAL_SIGNALS = [
  '喝了一口水',
  '喝口水',
  '哈哈',
  '现在有点困',
  '现在有点累',
  '刚打了个哈欠'
] as const

const SENSITIVE_CONTENT_SIGNALS = [
  'api key',
  'api_key',
  '密码',
  '口令',
  '银行卡',
  '信用卡',
  '身份证',
  '护照号',
  '验证码',
  '私钥',
  '助记词'
] as const

export class MemoryCandidateStore {
  constructor(private readonly memoryManager: MemoryManager) {}

  store(input: StoreMemoryCandidatesInput): MemoryStorageResult {
    const acceptedCategories: MemoryType[] = []
    const rejectedReasons: MemoryCandidateRejectionReason[] = []
    let profileValuesWritten = 0
    let memoriesCreated = 0
    let memoriesDeduplicated = 0

    for (const candidate of input.candidates) {
      if (acceptedCategories.length >= MAX_ACCEPTED_CANDIDATES) {
        rejectedReasons.push('candidate-limit-exceeded')
        continue
      }

      const rejection = validateCandidate(candidate, input)

      if (rejection) {
        rejectedReasons.push(rejection)
        continue
      }

      try {
        if (candidate.category === 'profile') {
          const normalized = normalizeProfileCandidate(candidate)

          if (!normalized) {
            rejectedReasons.push('invalid-profile-value')
            continue
          }

          this.memoryManager.setProfileValue(normalized.key, normalized.value)
          profileValuesWritten += 1
          acceptedCategories.push('profile')
          continue
        }

        const canonicalContent = canonicalizeMemoryContent(candidate.content)
        const duplicate = findDuplicateMemory(
          this.memoryManager.listMemories({ limit: 500 }),
          candidate.category,
          canonicalContent
        )

        if (duplicate) {
          this.memoryManager.updateMemory(duplicate.id, {
            content: canonicalContent,
            importance: Math.max(duplicate.importance, candidate.importance)
          })
          memoriesDeduplicated += 1
        } else {
          this.memoryManager.addMemory({
            type: candidate.category,
            content: canonicalContent,
            importance: candidate.importance
          })
          memoriesCreated += 1
        }

        acceptedCategories.push(candidate.category)
      } catch {
        rejectedReasons.push('storage-error')
      }
    }

    return {
      acceptedCategories,
      rejectedReasons,
      profileValuesWritten,
      memoriesCreated,
      memoriesDeduplicated
    }
  }
}

function validateCandidate(
  candidate: MemoryCandidate,
  input: StoreMemoryCandidatesInput
): MemoryCandidateRejectionReason | undefined {
  if (!candidate.shouldRemember) {
    return 'not-recommended'
  }

  const explicitRequest =
    candidate.explicitRequest && containsAny(normalizeForComparison(input.currentMessage), EXPLICIT_MEMORY_SIGNALS)
  const confidenceThreshold = explicitRequest
    ? EXPLICIT_CONFIDENCE_THRESHOLD
    : STANDARD_CONFIDENCE_THRESHOLD

  if (candidate.confidence < confidenceThreshold) {
    return 'low-confidence'
  }

  const importanceThreshold =
    candidate.category === 'other' ? OTHER_IMPORTANCE_THRESHOLD : STANDARD_IMPORTANCE_THRESHOLD

  if (!explicitRequest && candidate.importance < importanceThreshold) {
    return 'low-importance'
  }

  if (candidate.sensitivity === 'sensitive' || candidate.sensitivity === 'highly_sensitive') {
    return 'unsupported-sensitive-data'
  }

  const candidateText =
    candidate.category === 'profile'
      ? `${candidate.key} ${candidate.value}`
      : candidate.content

  if (containsAny(normalizeForComparison(candidateText), SENSITIVE_CONTENT_SIGNALS)) {
    return 'unsupported-sensitive-data'
  }

  const evidenceMessages = explicitRequest
    ? input.sourceMessages
    : [input.currentMessage]

  if (!hasSourceEvidence(candidate.sourceQuote, evidenceMessages)) {
    return 'missing-source-evidence'
  }

  if (
    !explicitRequest &&
    (candidate.category === 'event' || candidate.category === 'other') &&
    containsAny(normalizeForComparison(input.currentMessage), TRIVIAL_EPHEMERAL_SIGNALS)
  ) {
    return 'trivial-ephemeral-detail'
  }

  if (
    candidate.category === 'profile' &&
    (!PROFILE_KEY_PATTERN.test(candidate.key) ||
      BLOCKED_PROFILE_KEY_PARTS.some((part) => candidate.key.includes(part)))
  ) {
    return 'blocked-profile-key'
  }

  if (candidate.category === 'location_general' && looksLikePreciseLocation(candidate.content)) {
    return 'unsupported-sensitive-data'
  }

  return undefined
}

function normalizeProfileCandidate(
  candidate: ProfileMemoryCandidate
): { key: string; value: string } | undefined {
  const key = candidate.key.trim().toLowerCase()
  let value = candidate.value.trim().normalize('NFKC')

  if (key === 'age') {
    const ageMatch = value.match(/\d{1,3}/)
    const age = ageMatch ? Number(ageMatch[0]) : Number.NaN

    if (!Number.isInteger(age) || age < 0 || age > 130) {
      return undefined
    }

    value = String(age)
  }

  return value ? { key, value } : undefined
}

function canonicalizeMemoryContent(content: string): string {
  return content
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/用户(?:真的)?(?:特别|非常|很|挺)?爱吃/g, '用户喜欢吃')
    .replace(/用户(?:真的)?(?:特别|非常|很|挺)?喜欢/g, '用户喜欢')
    .replace(/[。.!！]+$/u, '')
}

function findDuplicateMemory(
  memories: readonly MemoryRecord[],
  type: MemoryType,
  content: string
): MemoryRecord | undefined {
  const identity = normalizeMemoryIdentity(content)

  return memories.find(
    (memory) =>
      memory.type === type && normalizeMemoryIdentity(memory.content) === identity
  )
}

function normalizeMemoryIdentity(content: string): string {
  return canonicalizeMemoryContent(content)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function hasSourceEvidence(sourceQuote: string, sourceMessages: readonly string[]): boolean {
  const quote = normalizeForEvidence(sourceQuote)

  return quote.length >= 1 && sourceMessages.some((message) => normalizeForEvidence(message).includes(quote))
}

function normalizeForEvidence(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, '')
}

function normalizeForComparison(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function containsAny(value: string, signals: readonly string[]): boolean {
  return signals.some((signal) => value.includes(signal))
}

function looksLikePreciseLocation(content: string): boolean {
  const normalized = normalizeForComparison(content)

  return (
    /(?:路|街|巷|弄|号|栋|单元|室)\s*\d+/u.test(normalized) ||
    /\b\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/u.test(normalized) ||
    normalized.includes('详细地址') ||
    normalized.includes('精确坐标')
  )
}
