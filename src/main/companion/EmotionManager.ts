import type { EmotionSnapshot, EmotionState } from '../../shared/companion-state'

interface EmotionManagerOptions {
  now?: () => number
  startDecayTimer?: boolean
}

interface ActiveEmotion {
  state: Exclude<EmotionState, 'neutral'>
  initialIntensity: number
  startedAt: number
  decaysToNeutralAt: number
}

type EmotionListener = (snapshot: EmotionSnapshot) => void

const DECAY_DURATION_MS: Record<Exclude<EmotionState, 'neutral'>, number> = {
  happy: 4 * 60_000,
  excited: 2.5 * 60_000,
  calm: 5 * 60_000,
  sleepy: 6 * 60_000,
  annoyed: 2 * 60_000
}

const DECAY_TICK_MS = 10_000
const NEUTRAL_THRESHOLD = 0.04

export class EmotionManager {
  private readonly listeners = new Set<EmotionListener>()
  private readonly now: () => number
  private readonly decayTimer: ReturnType<typeof setInterval> | undefined
  private activeEmotion: ActiveEmotion | undefined
  private neutralStartedAt: number
  private lastEmittedSnapshot: EmotionSnapshot

  constructor(options: EmotionManagerOptions = {}) {
    this.now = options.now ?? Date.now
    this.neutralStartedAt = this.now()
    this.lastEmittedSnapshot = this.createSnapshot(this.neutralStartedAt)

    if (options.startDecayTimer !== false) {
      this.decayTimer = setInterval(() => this.refresh(), DECAY_TICK_MS)
    }
  }

  getSnapshot(at = this.now()): EmotionSnapshot {
    return this.createSnapshot(at)
  }

  subscribe(listener: EmotionListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  setEmotion(state: EmotionState, intensity: number): EmotionSnapshot {
    const now = this.now()

    if (state === 'neutral' || intensity <= NEUTRAL_THRESHOLD) {
      return this.reset(now)
    }

    const normalizedIntensity = clamp(intensity)
    const current = this.createSnapshot(now)
    const blendedIntensity =
      current.state === state
        ? Math.max(normalizedIntensity, Math.min(1, current.intensity + normalizedIntensity * 0.12))
        : normalizedIntensity
    const duration = DECAY_DURATION_MS[state]

    this.activeEmotion = {
      state,
      initialIntensity: blendedIntensity,
      startedAt: now,
      decaysToNeutralAt: now + Math.round(duration * Math.max(0.35, blendedIntensity))
    }

    return this.emitCurrent(now)
  }

  reset(at = this.now()): EmotionSnapshot {
    this.activeEmotion = undefined
    this.neutralStartedAt = at

    return this.emitCurrent(at)
  }

  refresh(at = this.now()): EmotionSnapshot {
    const snapshot = this.createSnapshot(at)

    if (snapshot.state === 'neutral' && this.activeEmotion) {
      this.activeEmotion = undefined
      this.neutralStartedAt = at
    }

    if (!sameEmotionSnapshot(snapshot, this.lastEmittedSnapshot)) {
      this.emit(snapshot)
    }

    return snapshot
  }

  dispose(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer)
    }

    this.listeners.clear()
  }

  private createSnapshot(at: number): EmotionSnapshot {
    const emotion = this.activeEmotion

    if (!emotion || at >= emotion.decaysToNeutralAt) {
      return {
        state: 'neutral',
        intensity: 0,
        startedAt: this.neutralStartedAt,
        decaysToNeutralAt: null
      }
    }

    const remainingRatio =
      (emotion.decaysToNeutralAt - at) / (emotion.decaysToNeutralAt - emotion.startedAt)
    const intensity = roundIntensity(emotion.initialIntensity * remainingRatio)

    if (intensity <= NEUTRAL_THRESHOLD) {
      return {
        state: 'neutral',
        intensity: 0,
        startedAt: this.neutralStartedAt,
        decaysToNeutralAt: null
      }
    }

    return {
      state: emotion.state,
      intensity,
      startedAt: emotion.startedAt,
      decaysToNeutralAt: emotion.decaysToNeutralAt
    }
  }

  private emitCurrent(at: number): EmotionSnapshot {
    const snapshot = this.createSnapshot(at)

    this.emit(snapshot)
    return snapshot
  }

  private emit(snapshot: EmotionSnapshot): void {
    this.lastEmittedSnapshot = snapshot

    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

function roundIntensity(value: number): number {
  return Math.round(clamp(value) * 100) / 100
}

function sameEmotionSnapshot(left: EmotionSnapshot, right: EmotionSnapshot): boolean {
  return left.state === right.state && left.intensity === right.intensity
}
