import type { AIPetAction } from '../../shared/ai-pet-action'
import type { ChatMessage } from '../../shared/chat'
import type { AIProviderSelection } from '../ai/provider-factory'
import { ChatController } from '../chat/ChatController'
import { createCompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import { createLongTermMemoryCoordinator } from './LongTermMemoryCoordinator'
import type { MemoryManager } from './MemoryManager'

const PROBE_MODES = [
  'seed-name',
  'verify-name-seed-age',
  'verify-age-seed-details',
  'verify-details',
  'seed-event',
  'verify-event'
] as const

type LongTermMemoryProbeMode = (typeof PROBE_MODES)[number]

interface RunLongTermMemoryProbeOptions {
  characterName: string
  providerSelection: AIProviderSelection
  memoryManager: MemoryManager
}

export function getLongTermMemoryProbeMode(): LongTermMemoryProbeMode | undefined {
  const value = process.env.DESKTOP_PET_LONG_TERM_MEMORY_PROBE_MODE

  if (value === undefined) {
    return undefined
  }

  if (!PROBE_MODES.includes(value as LongTermMemoryProbeMode)) {
    throw new Error(
      'DESKTOP_PET_LONG_TERM_MEMORY_PROBE_MODE must be seed-name, verify-name-seed-age, verify-age-seed-details, verify-details, seed-event, or verify-event.'
    )
  }

  return value as LongTermMemoryProbeMode
}

export async function runLongTermMemoryProbe(
  mode: LongTermMemoryProbeMode,
  options: RunLongTermMemoryProbeOptions
): Promise<void> {
  const actionRequests: AIPetAction[][] = []
  const companionState = createCompanionStateCoordinator(options.memoryManager)
  const diagnostics: Array<{
    candidateCount: number
    acceptedCategories: readonly string[]
    rejectedCandidateCount: number
    retrievedProfileCount: number
    retrievedMemoryCount: number
    memoriesDeduplicated: number
  }> = []
  const controller = new ChatController({
    characterName: options.characterName,
    provider: options.providerSelection.provider,
    providerInfo: options.providerSelection.info,
    memoryManager: options.memoryManager,
    longTermMemory: createLongTermMemoryCoordinator(
      options.providerSelection.provider,
      options.memoryManager
    ),
    companionState,
    onMemoryDiagnostics: (result) => {
      diagnostics.push({
        candidateCount: result.candidateCount,
        acceptedCategories: result.acceptedCategories,
        rejectedCandidateCount: result.rejectedCandidateCount,
        retrievedProfileCount: result.retrievedProfileCount,
        retrievedMemoryCount: result.retrievedMemoryCount,
        memoriesDeduplicated: result.memoriesDeduplicated
      })
    }
  })
  const stopListeningForActions = controller.subscribeToPetActions((actions) => {
    actionRequests.push([...actions])
  })

  controller.openChat()

  try {
    switch (mode) {
      case 'seed-name': {
        const reply = await sendAndReadReply(controller, '我叫阿达。')
        const stored = options.memoryManager.getProfileValue('preferred_name')?.value === '阿达'

        assert(stored, 'preferred_name was not stored as 阿达')
        logProbe(mode, { storedPreferredName: true, reply, diagnostics })
        return
      }
      case 'verify-name-seed-age': {
        const nameReply = await sendAndReadReply(controller, '我叫什么？')
        assert(nameReply.includes('阿达'), 'the restarted chat did not retrieve preferred_name')

        const ageStoreReply = await sendAndReadReply(controller, '我今年28岁。')
        const storedAge = options.memoryManager.getProfileValue('age')?.value

        assert(storedAge === '28', 'age was not stored as 28')
        logProbe(mode, {
          retrievedPreferredName: true,
          nameReply,
          storedAge: true,
          ageStoreReply,
          diagnostics
        })
        return
      }
      case 'verify-age-seed-details': {
        const ageReply = await sendAndReadReply(controller, '我多大？')
        assert(ageReply.includes('28'), 'the restarted chat did not retrieve age 28')

        await sendAndReadReply(controller, '我做跨境电商。')
        assert(
          options.memoryManager.getProfileValue('occupation')?.value === '跨境电商',
          'occupation was not stored'
        )

        await sendAndReadReply(controller, '我很喜欢吃火锅。')
        const preferenceCountBeforeTrivial = countHotpotPreferences(options.memoryManager)
        const totalMemoriesBeforeTrivial = options.memoryManager.listMemories({ limit: 500 }).length

        await sendAndReadReply(controller, '我今天喝了一口水。')
        const totalMemoriesAfterTrivial = options.memoryManager.listMemories({ limit: 500 }).length

        assert(
          totalMemoriesAfterTrivial === totalMemoriesBeforeTrivial,
          'the trivial water message was promoted to long-term memory'
        )

        await sendAndReadReply(controller, '我27岁。')
        assert(options.memoryManager.getProfileValue('age')?.value === '27', 'age did not update to 27')

        await sendAndReadReply(controller, '我已经28岁了。')
        assert(options.memoryManager.getProfileValue('age')?.value === '28', 'age did not correct to 28')
        assert(
          options.memoryManager.getProfile().filter(({ key }) => key === 'age').length === 1,
          'the age correction created conflicting profile rows'
        )

        await sendAndReadReply(controller, '我喜欢火锅。')
        await sendAndReadReply(controller, '我真的挺爱吃火锅的。')
        const preferenceCountAfterDuplicates = countHotpotPreferences(options.memoryManager)

        assert(preferenceCountBeforeTrivial === 1, 'the initial hotpot preference was not stored once')
        assert(preferenceCountAfterDuplicates === 1, 'duplicate hotpot memories were created')

        const naturalReply = await sendAndReadReply(controller, '老板今天居然夸我了。')
        assert(naturalReply.includes('？') || naturalReply.includes('?'), 'natural follow-up behavior regressed')

        await sendAndReadReply(controller, '跳一下。')
        assert(
          actionRequests.some((actions) => actions.includes('jump')),
          'the jump action tool call did not survive memory integration'
        )

        logProbe(mode, {
          retrievedAge: true,
          ageReply,
          storedOccupation: true,
          storedHotpotPreference: true,
          trivialMessageRejected: true,
          correctedAge: true,
          duplicatePreferenceCount: preferenceCountAfterDuplicates,
          naturalFollowUpPreserved: true,
          jumpActionPreserved: true,
          naturalReply,
          diagnostics
        })
        return
      }
      case 'verify-details': {
        const occupationReply = await sendAndReadReply(
          controller,
          '今天店铺又忙起来了，你还记得我是做什么的吗？'
        )
        const preferenceReply = await sendAndReadReply(controller, '我喜欢吃什么？')

        assert(occupationReply.includes('跨境电商'), 'occupation was not retrieved naturally')
        assert(preferenceReply.includes('火锅'), 'hotpot preference did not survive restart')
        assert(options.memoryManager.getProfileValue('age')?.value === '28', 'corrected age did not persist')
        assert(countHotpotPreferences(options.memoryManager) === 1, 'deduplication did not persist')
        assert(
          diagnostics.every(
            ({ retrievedProfileCount, retrievedMemoryCount }) =>
              retrievedProfileCount <= 4 && retrievedMemoryCount <= 4
          ),
          'retrieved memory context exceeded its bounds'
        )

        logProbe(mode, {
          occupationPersistedAndRetrieved: true,
          occupationReply,
          preferencePersistedAndRetrieved: true,
          preferenceReply,
          correctedAgePersisted: true,
          duplicatePreferenceCount: 1,
          retrievalBounded: true,
          diagnostics
        })
        return
      }
      case 'seed-event': {
        const reply = await sendAndReadReply(controller, '我下个月要参加羽毛球比赛。')
        const storedEvent = options.memoryManager
          .listMemories({ type: 'event', limit: 100 })
          .some(({ content }) => content.includes('羽毛球比赛'))

        assert(storedEvent, 'the future badminton competition event was not stored')
        logProbe(mode, { storedBadmintonEvent: true, reply, diagnostics })
        return
      }
      case 'verify-event': {
        const actionsBefore = actionRequests.length
        const reply = await sendAndReadReply(controller, '之前跟你说的那个比赛，我拿奖了。')
        const newActions = actionRequests.slice(actionsBefore).flat()

        assert(
          reply.includes('羽毛球') || reply.includes('比赛'),
          `the award reply did not retrieve the persisted competition event (retrieved ${diagnostics.at(-1)?.retrievedMemoryCount ?? 0}; reply: ${reply})`
        )
        assert(
          newActions.includes('happy') || newActions.includes('jump'),
          'the positive event did not preserve a matching pet action'
        )

        logProbe(mode, {
          competitionEventRetrieved: true,
          reply,
          positiveActionPreserved: true,
          actions: newActions,
          diagnostics
        })
      }
    }
  } finally {
    stopListeningForActions()
    controller.dispose()
    companionState.dispose()
  }
}

async function sendAndReadReply(controller: ChatController, message: string): Promise<string> {
  const previousAssistantCount = controller
    .getSnapshot()
    .messages.filter(({ role }) => role === 'assistant').length
  const result = await controller.sendMessage(message)

  assert(result.accepted, `chat rejected a probe message: ${result.reason ?? 'unknown'}`)

  const assistantMessages = controller
    .getSnapshot()
    .messages.filter((entry): entry is ChatMessage & { role: 'assistant' } => entry.role === 'assistant')

  assert(
    assistantMessages.length > previousAssistantCount,
    'chat did not produce an assistant response'
  )

  return assistantMessages.at(-1)?.content ?? ''
}

function countHotpotPreferences(memoryManager: MemoryManager): number {
  return memoryManager
    .listMemories({ type: 'preference', limit: 500 })
    .filter(({ content }) => content.includes('火锅')).length
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[LongTermMemoryProbe] ${message}`)
  }
}

function logProbe(mode: LongTermMemoryProbeMode, result: Record<string, unknown>): void {
  console.info(`[LongTermMemoryProbe] ${mode} passed.`, result)
}
