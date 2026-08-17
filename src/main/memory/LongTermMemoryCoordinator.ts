import type { ChatMessage } from '../../shared/chat'
import type { AIProvider } from '../ai/ai-provider'
import { MemoryCandidateStore } from './MemoryCandidateStore'
import { MemoryContextBuilder, type RetrievedMemoryContext } from './MemoryContextBuilder'
import { MemoryExtractor } from './MemoryExtractor'
import type { MemoryCandidateRejectionReason } from './memory-candidate'
import type { MemoryManager } from './MemoryManager'
import type { MemoryType } from './memory-types'

interface PrepareMemoryContextInput {
  currentMessage: string
  recentMessages: readonly ChatMessage[]
  signal?: AbortSignal
}

export interface LongTermMemoryDiagnostics {
  candidateCount: number
  acceptedCategories: readonly MemoryType[]
  rejectedCandidateCount: number
  rejectedReasons: readonly MemoryCandidateRejectionReason[]
  profileValuesWritten: number
  memoriesCreated: number
  memoriesDeduplicated: number
  retrievedProfileCount: number
  retrievedMemoryCount: number
  unexpectedExtractorActionRequests: number
  extractionFailed: boolean
}

export interface PreparedMemoryContext {
  context: RetrievedMemoryContext
  diagnostics: LongTermMemoryDiagnostics
}

export class LongTermMemoryCoordinator {
  private enabled = true

  constructor(
    private readonly extractor: MemoryExtractor,
    private readonly store: MemoryCandidateStore,
    private readonly contextBuilder: MemoryContextBuilder
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async prepare(input: PrepareMemoryContextInput): Promise<PreparedMemoryContext> {
    if (!this.enabled) {
      return {
        context: { profile: [], memories: [] },
        diagnostics: createEmptyDiagnostics()
      }
    }

    let candidateCount = 0
    let acceptedCategories: readonly MemoryType[] = []
    let rejectedReasons: readonly MemoryCandidateRejectionReason[] = []
    let profileValuesWritten = 0
    let memoriesCreated = 0
    let memoriesDeduplicated = 0
    let unexpectedExtractorActionRequests = 0
    let extractionFailed = false

    try {
      const extraction = await this.extractor.extract(input)
      candidateCount = extraction.candidates.length
      unexpectedExtractorActionRequests = extraction.requestedPetActions
      const storage = this.store.store({
        candidates: extraction.candidates,
        currentMessage: input.currentMessage,
        sourceMessages: [
          ...input.recentMessages
            .filter(({ role }) => role === 'user')
            .map(({ content }) => content),
          input.currentMessage
        ]
      })

      acceptedCategories = storage.acceptedCategories
      rejectedReasons = [...extraction.rejectedReasons, ...storage.rejectedReasons]
      profileValuesWritten = storage.profileValuesWritten
      memoriesCreated = storage.memoriesCreated
      memoriesDeduplicated = storage.memoriesDeduplicated
    } catch {
      extractionFailed = true
    }

    const context = this.contextBuilder.retrieve(input.currentMessage)

    return {
      context,
      diagnostics: {
        candidateCount,
        acceptedCategories,
        rejectedCandidateCount: rejectedReasons.length,
        rejectedReasons,
        profileValuesWritten,
        memoriesCreated,
        memoriesDeduplicated,
        retrievedProfileCount: context.profile.length,
        retrievedMemoryCount: context.memories.length,
        unexpectedExtractorActionRequests,
        extractionFailed
      }
    }
  }
}

export function createLongTermMemoryCoordinator(
  provider: AIProvider,
  memoryManager: MemoryManager
): LongTermMemoryCoordinator {
  return new LongTermMemoryCoordinator(
    new MemoryExtractor(provider),
    new MemoryCandidateStore(memoryManager),
    new MemoryContextBuilder(memoryManager)
  )
}

function createEmptyDiagnostics(): LongTermMemoryDiagnostics {
  return {
    candidateCount: 0,
    acceptedCategories: [],
    rejectedCandidateCount: 0,
    rejectedReasons: [],
    profileValuesWritten: 0,
    memoriesCreated: 0,
    memoriesDeduplicated: 0,
    retrievedProfileCount: 0,
    retrievedMemoryCount: 0,
    unexpectedExtractorActionRequests: 0,
    extractionFailed: false
  }
}
