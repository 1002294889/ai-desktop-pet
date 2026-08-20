import type {
  CompanionInteraction,
  RelationshipState
} from '../../shared/companion-state'
import type { MemoryManager } from '../memory/MemoryManager'

interface RelationshipManagerOptions {
  now?: () => number
}

interface ConversationRelationshipInput {
  meaningfulInformation: boolean
  usedRelevantMemory: boolean
}

type RelationshipListener = (state: RelationshipState) => void

const PET_INTERACTION_COOLDOWN_MS = 30_000
const MAX_PET_INTERACTIONS_PER_SESSION = 12

export class RelationshipManager {
  private readonly listeners = new Set<RelationshipListener>()
  private readonly now: () => number
  private state: RelationshipState
  private lastCountedPetInteractionAt = 0
  private countedPetInteractionsThisSession = 0

  constructor(
    private readonly memoryManager: MemoryManager,
    options: RelationshipManagerOptions = {}
  ) {
    this.now = options.now ?? Date.now
    this.state = memoryManager.getRelationshipState() ?? createDefaultRelationshipState()
  }

  getSnapshot(): RelationshipState {
    return this.state
  }

  subscribe(listener: RelationshipListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  recordConversation(input: ConversationRelationshipInput): RelationshipState {
    const familiarityGrowth =
      0.004 + (input.meaningfulInformation ? 0.002 : 0) + (input.usedRelevantMemory ? 0.001 : 0)
    const trustGrowth =
      0.0015 + (input.meaningfulInformation ? 0.003 : 0) + (input.usedRelevantMemory ? 0.002 : 0)

    return this.grow(familiarityGrowth, trustGrowth)
  }

  recordPetInteraction(_interaction: CompanionInteraction): RelationshipState {
    const now = this.now()

    if (
      this.countedPetInteractionsThisSession >= MAX_PET_INTERACTIONS_PER_SESSION ||
      now - this.lastCountedPetInteractionAt < PET_INTERACTION_COOLDOWN_MS
    ) {
      return this.state
    }

    this.lastCountedPetInteractionAt = now
    this.countedPetInteractionsThisSession += 1

    return this.grow(0.001, 0.0004, now)
  }

  reset(): RelationshipState {
    this.memoryManager.deleteRelationshipState()
    this.state = createDefaultRelationshipState()
    this.lastCountedPetInteractionAt = 0
    this.countedPetInteractionsThisSession = 0
    this.emit()

    return this.state
  }

  dispose(): void {
    this.listeners.clear()
  }

  private grow(
    familiarityGrowth: number,
    trustGrowth: number,
    at = this.now()
  ): RelationshipState {
    const nextState: RelationshipState = {
      familiarity: roundUnit(this.state.familiarity + familiarityGrowth),
      trust: roundUnit(this.state.trust + trustGrowth),
      interactionCount: Math.min(Number.MAX_SAFE_INTEGER, this.state.interactionCount + 1),
      firstInteractionAt: this.state.firstInteractionAt ?? at,
      lastInteractionAt: at
    }

    this.state = this.memoryManager.setRelationshipState(nextState)
    this.emit()

    return this.state
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

export function createDefaultRelationshipState(): RelationshipState {
  return {
    familiarity: 0,
    trust: 0,
    interactionCount: 0,
    firstInteractionAt: null,
    lastInteractionAt: null
  }
}

function roundUnit(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000
}
