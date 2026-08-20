import { CompanionStateCoordinator } from './CompanionStateCoordinator'
import { EmotionManager } from './EmotionManager'
import { RelationshipManager } from './RelationshipManager'
import type { LongTermMemoryDiagnostics } from '../memory/LongTermMemoryCoordinator'
import type { MemoryManager } from '../memory/MemoryManager'

const PROBE_MODES = [
  'exercise',
  'seed-persistence',
  'verify-persistence',
  'cleanup'
] as const

type CompanionProbeMode = (typeof PROBE_MODES)[number]

export function getCompanionProbeMode(): CompanionProbeMode | undefined {
  const value = process.env.DESKTOP_PET_COMPANION_PROBE_MODE

  if (value === undefined) {
    return undefined
  }

  if (!PROBE_MODES.includes(value as CompanionProbeMode)) {
    throw new Error(
      'DESKTOP_PET_COMPANION_PROBE_MODE must be exercise, seed-persistence, verify-persistence, or cleanup.'
    )
  }

  return value as CompanionProbeMode
}

export function runCompanionProbe(
  mode: CompanionProbeMode,
  memoryManager: MemoryManager
): void {
  switch (mode) {
    case 'exercise':
      exerciseTransientAndGrowthBehavior(memoryManager)
      return
    case 'seed-persistence':
      seedRelationshipPersistence(memoryManager)
      return
    case 'verify-persistence':
      verifyRelationshipPersistence(memoryManager)
      return
    case 'cleanup':
      memoryManager.deleteRelationshipState()
      console.info('[CompanionProbe] cleanup passed.', { relationshipReset: true })
  }
}

function exerciseTransientAndGrowthBehavior(memoryManager: MemoryManager): void {
  memoryManager.deleteRelationshipState()
  let now = 1_800_000_000_000
  const clock = (): number => now
  const emotion = new EmotionManager({ now: clock, startDecayTimer: false })
  const relationship = new RelationshipManager(memoryManager, { now: clock })
  const coordinator = new CompanionStateCoordinator(emotion, relationship)

  try {
    assert(coordinator.getSnapshot().emotion.state === 'neutral', 'initial mood was not neutral')
    coordinator.recordConversation('我今天比赛拿第一了。', EMPTY_MEMORY_DIAGNOSTICS)
    const achievementState = coordinator.getSnapshot()

    assert(
      achievementState.emotion.state === 'excited' && achievementState.emotion.intensity >= 0.7,
      'achievement did not create bounded excitement'
    )

    coordinator.handleAutonomousAction('sit')
    assert(
      coordinator.getSnapshot().emotion.state === 'excited',
      'autonomous behavior overwrote a stronger conversation emotion'
    )

    now += 10 * 60_000
    emotion.refresh()
    assert(coordinator.getSnapshot().emotion.state === 'neutral', 'emotion did not decay to neutral')

    coordinator.recordConversation('今天有点累。', EMPTY_MEMORY_DIAGNOSTICS)
    const tiredState = coordinator.getSnapshot()

    assert(tiredState.emotion.state === 'calm', 'mild tiredness did not produce calm mood')

    const familiarityBeforeNormalChats = tiredState.relationship.familiarity

    for (let index = 0; index < 5; index += 1) {
      coordinator.recordConversation('普通聊天。', EMPTY_MEMORY_DIAGNOSTICS)
    }

    const afterNormalChats = coordinator.getSnapshot().relationship

    assert(
      afterNormalChats.familiarity > familiarityBeforeNormalChats &&
        afterNormalChats.familiarity - familiarityBeforeNormalChats <= 0.021,
      'familiarity growth was not gradual'
    )

    const countBeforeClickLoop = afterNormalChats.interactionCount

    for (let index = 0; index < 20; index += 1) {
      coordinator.handlePetInteraction('single-click')
    }

    const afterClickLoop = coordinator.getSnapshot().relationship

    assert(
      afterClickLoop.interactionCount === countBeforeClickLoop + 1,
      'repeated clicks bypassed relationship throttling'
    )

    const beforeInactivity = { ...afterClickLoop }
    now += 180 * 24 * 60 * 60_000
    const afterInactivity = coordinator.getSnapshot().relationship

    assert(
      afterInactivity.familiarity === beforeInactivity.familiarity &&
        afterInactivity.trust === beforeInactivity.trust &&
        afterInactivity.interactionCount === beforeInactivity.interactionCount,
      'inactivity reduced relationship state'
    )

    console.info('[CompanionProbe] exercise passed.', {
      startedNeutral: true,
      achievementBecameExcited: true,
      autonomousMoodDidNotOverride: true,
      decayedToNeutral: true,
      tirednessStayedCalm: true,
      gradualConversationGrowth: true,
      clickLoopThrottled: true,
      inactivityPenalty: false
    })
  } finally {
    coordinator.dispose()
  }
}

function seedRelationshipPersistence(memoryManager: MemoryManager): void {
  memoryManager.deleteRelationshipState()
  const emotion = new EmotionManager({ startDecayTimer: false })
  const relationship = new RelationshipManager(memoryManager)
  const coordinator = new CompanionStateCoordinator(emotion, relationship)

  try {
    emotion.setEmotion('excited', 0.9)

    for (let index = 0; index < 5; index += 1) {
      relationship.recordConversation({
        meaningfulInformation: index === 0,
        usedRelevantMemory: index === 4
      })
    }

    const state = coordinator.getSnapshot()

    assert(state.relationship.interactionCount === 5, 'persistence seed count was wrong')
    assert(state.relationship.familiarity > 0 && state.relationship.familiarity < 0.05, 'seed growth was not bounded')
    console.info('[CompanionProbe] seed-persistence passed.', {
      interactionCount: state.relationship.interactionCount,
      familiarity: state.relationship.familiarity,
      trust: state.relationship.trust,
      sessionMood: state.emotion.state
    })
  } finally {
    coordinator.dispose()
  }
}

function verifyRelationshipPersistence(memoryManager: MemoryManager): void {
  const persisted = memoryManager.getRelationshipState()

  assert(persisted, 'relationship state did not survive restart')
  assert(persisted.interactionCount === 5, 'persisted interaction count changed')
  assert(persisted.familiarity > 0 && persisted.familiarity < 0.05, 'persisted familiarity was invalid')

  const emotion = new EmotionManager({ startDecayTimer: false })
  const relationship = new RelationshipManager(memoryManager, {
    now: () => (persisted.lastInteractionAt ?? Date.now()) + 365 * 24 * 60 * 60_000
  })
  const coordinator = new CompanionStateCoordinator(emotion, relationship)

  try {
    const restarted = coordinator.getSnapshot()

    assert(restarted.emotion.state === 'neutral', 'stale extreme emotion survived restart')
    assert(
      restarted.relationship.familiarity === persisted.familiarity &&
        restarted.relationship.trust === persisted.trust,
      'simulated inactivity punished the relationship'
    )
    console.info('[CompanionProbe] verify-persistence passed.', {
      relationshipSurvivedRestart: true,
      interactionCount: restarted.relationship.interactionCount,
      staleEmotionRestored: false,
      inactivityPenalty: false
    })
  } finally {
    coordinator.dispose()
  }
}

const EMPTY_MEMORY_DIAGNOSTICS: LongTermMemoryDiagnostics = {
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[CompanionProbe] ${message}`)
  }
}
