import type { AIPetAction } from '../../shared/ai-pet-action'
import {
  emotionForPetAction,
  type CompanionAutonomousAction,
  type CompanionInteraction,
  type CompanionStateSnapshot,
  type EmotionState
} from '../../shared/companion-state'
import type { LongTermMemoryDiagnostics } from '../memory/LongTermMemoryCoordinator'
import type { MemoryManager } from '../memory/MemoryManager'
import { EmotionManager } from './EmotionManager'
import { RelationshipManager } from './RelationshipManager'

type CompanionStateListener = (snapshot: CompanionStateSnapshot) => void

export class CompanionStateCoordinator {
  private readonly listeners = new Set<CompanionStateListener>()
  private readonly unsubscribeFromEmotion: () => void
  private readonly unsubscribeFromRelationship: () => void

  constructor(
    private readonly emotionManager: EmotionManager,
    private readonly relationshipManager: RelationshipManager
  ) {
    this.unsubscribeFromEmotion = emotionManager.subscribe(() => this.emit())
    this.unsubscribeFromRelationship = relationshipManager.subscribe(() => this.emit())
  }

  getSnapshot(): CompanionStateSnapshot {
    return {
      emotion: this.emotionManager.getSnapshot(),
      relationship: this.relationshipManager.getSnapshot()
    }
  }

  subscribe(listener: CompanionStateListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  recordConversation(
    content: string,
    memoryDiagnostics: LongTermMemoryDiagnostics
  ): CompanionStateSnapshot {
    const inferredEmotion = inferEmotionFromConversation(content)

    if (inferredEmotion) {
      this.emotionManager.setEmotion(inferredEmotion.state, inferredEmotion.intensity)
    }

    this.relationshipManager.recordConversation({
      meaningfulInformation:
        memoryDiagnostics.profileValuesWritten > 0 || memoryDiagnostics.memoriesCreated > 0,
      usedRelevantMemory:
        memoryDiagnostics.retrievedProfileCount > 0 || memoryDiagnostics.retrievedMemoryCount > 0
    })

    return this.getSnapshot()
  }

  handleAIResponse(actions: readonly AIPetAction[]): CompanionStateSnapshot {
    const strongest = selectStrongestActionEmotion(actions)

    if (strongest) {
      this.emotionManager.setEmotion(strongest.state, strongest.intensity)
    }

    return this.getSnapshot()
  }

  handlePetInteraction(interaction: CompanionInteraction): CompanionStateSnapshot {
    this.relationshipManager.recordPetInteraction(interaction)

    switch (interaction) {
      case 'double-click':
        this.emotionManager.setEmotion('excited', 0.52)
        break
      case 'hold':
        this.emotionManager.setEmotion('happy', 0.42)
        break
      case 'single-click':
        this.emotionManager.setEmotion('happy', 0.26)
        break
    }

    return this.getSnapshot()
  }

  handleAutonomousAction(action: CompanionAutonomousAction): CompanionStateSnapshot {
    const currentEmotion = this.emotionManager.getSnapshot()

    // Autonomous actions can establish a low-intensity ambient mood, but must not
    // keep refreshing it or overwrite a stronger user/AI-triggered emotion.
    if (currentEmotion.state !== 'neutral') {
      return this.getSnapshot()
    }

    if (action === 'sit') {
      this.emotionManager.setEmotion('calm', 0.2)
    } else if (action === 'sleep') {
      this.emotionManager.setEmotion('sleepy', 0.3)
    }

    return this.getSnapshot()
  }

  resetEmotion(): CompanionStateSnapshot {
    this.emotionManager.reset()
    return this.getSnapshot()
  }

  resetRelationship(): CompanionStateSnapshot {
    this.relationshipManager.reset()
    return this.getSnapshot()
  }

  dispose(): void {
    this.unsubscribeFromEmotion()
    this.unsubscribeFromRelationship()
    this.emotionManager.dispose()
    this.relationshipManager.dispose()
    this.listeners.clear()
  }

  private emit(): void {
    const snapshot = this.getSnapshot()

    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

export function createCompanionStateCoordinator(
  memoryManager: MemoryManager
): CompanionStateCoordinator {
  return new CompanionStateCoordinator(
    new EmotionManager(),
    new RelationshipManager(memoryManager)
  )
}

interface InferredEmotion {
  state: Exclude<EmotionState, 'neutral' | 'annoyed'>
  intensity: number
}

const STRONG_ACHIEVEMENT_SIGNALS = [
  '拿第一',
  '第一名',
  '拿冠军',
  '赢了比赛',
  '比赛赢了',
  '获奖',
  '拿奖',
  '升职',
  '通过了'
] as const
const POSITIVE_SIGNALS = ['好消息', '很开心', '太开心', '成功了', '做到了', '被夸'] as const
const BEDTIME_SIGNALS = ['晚安', '该睡了', '去睡觉', '准备睡觉', '困得睁不开'] as const
const TIRED_SIGNALS = ['有点累', '好累', '累了', '疲惫', '忙了一天'] as const
const CALM_SIGNALS = ['放松一下', '很平静', '慢慢来', '休息一下'] as const

function inferEmotionFromConversation(content: string): InferredEmotion | undefined {
  const normalized = content.normalize('NFKC').toLocaleLowerCase()

  if (containsAny(normalized, STRONG_ACHIEVEMENT_SIGNALS)) {
    return { state: 'excited', intensity: 0.76 }
  }

  if (containsAny(normalized, BEDTIME_SIGNALS)) {
    return { state: 'sleepy', intensity: 0.62 }
  }

  if (containsAny(normalized, TIRED_SIGNALS)) {
    return { state: 'calm', intensity: 0.46 }
  }

  if (containsAny(normalized, POSITIVE_SIGNALS)) {
    return { state: 'happy', intensity: 0.58 }
  }

  if (containsAny(normalized, CALM_SIGNALS)) {
    return { state: 'calm', intensity: 0.42 }
  }

  return undefined
}

function selectStrongestActionEmotion(
  actions: readonly AIPetAction[]
): { state: EmotionState; intensity: number } | undefined {
  const intensities: Partial<Record<EmotionState, number>> = {
    happy: 0.66,
    excited: 0.78,
    calm: 0.52,
    sleepy: 0.64,
    annoyed: 0.32
  }

  return actions
    .map((action) => emotionForPetAction(action))
    .filter((state): state is EmotionState => state !== undefined)
    .map((state) => ({ state, intensity: intensities[state] ?? 0 }))
    .sort((left, right) => right.intensity - left.intensity)[0]
}

function containsAny(value: string, signals: readonly string[]): boolean {
  return signals.some((signal) => value.includes(signal))
}
