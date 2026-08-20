import type { PetAction, PetActionState } from '../../../shared/pet-action'
import type { EmotionSnapshot, EmotionState } from '../../../shared/companion-state'
import type { PetMovementDirection, PetMovementEdge } from '../../../shared/pet-movement'
import type { PetActionController } from '../pet/PetActionController'

export const AUTONOMOUS_ACTIONS = [
  'idle',
  'walk_left',
  'walk_right',
  'sit',
  'sleep'
] as const

export type AutonomousAction = (typeof AUTONOMOUS_ACTIONS)[number]
export type AutonomousBehaviorStatus = 'stopped' | 'running' | 'paused'

export interface AutonomousBehaviorSnapshot {
  status: AutonomousBehaviorStatus
  plannedAction: PetAction | null
  isDragPaused: boolean
  schedulerActive: boolean
  transitionCount: number
  mood: EmotionState
  moodIntensity: number
}

interface DurationRange {
  minimum: number
  maximum: number
}

interface WeightedAction {
  action: AutonomousAction
  weight: number
}

interface AutonomousBehaviorControllerOptions {
  setMovement: (direction: PetMovementDirection) => void
  random?: () => number
}

type BehaviorListener = () => void

const ACTION_DURATION_RANGES: Record<AutonomousAction, DurationRange> = {
  idle: { minimum: 3_000, maximum: 8_000 },
  walk_left: { minimum: 2_000, maximum: 6_000 },
  walk_right: { minimum: 2_000, maximum: 6_000 },
  sit: { minimum: 4_000, maximum: 10_000 },
  sleep: { minimum: 8_000, maximum: 20_000 }
}

const WEIGHTED_ACTIONS: readonly WeightedAction[] = [
  { action: 'idle', weight: 32 },
  { action: 'walk_left', weight: 20 },
  { action: 'walk_right', weight: 20 },
  { action: 'sit', weight: 23 },
  { action: 'sleep', weight: 5 }
]

const EMOTION_WEIGHT_TARGETS: Record<EmotionState, readonly WeightedAction[]> = {
  neutral: WEIGHTED_ACTIONS,
  happy: [
    { action: 'idle', weight: 28 },
    { action: 'walk_left', weight: 25 },
    { action: 'walk_right', weight: 25 },
    { action: 'sit', weight: 18 },
    { action: 'sleep', weight: 4 }
  ],
  excited: [
    { action: 'idle', weight: 24 },
    { action: 'walk_left', weight: 30 },
    { action: 'walk_right', weight: 30 },
    { action: 'sit', weight: 13 },
    { action: 'sleep', weight: 3 }
  ],
  calm: [
    { action: 'idle', weight: 40 },
    { action: 'walk_left', weight: 10 },
    { action: 'walk_right', weight: 10 },
    { action: 'sit', weight: 34 },
    { action: 'sleep', weight: 6 }
  ],
  sleepy: [
    { action: 'idle', weight: 30 },
    { action: 'walk_left', weight: 7 },
    { action: 'walk_right', weight: 7 },
    { action: 'sit', weight: 34 },
    { action: 'sleep', weight: 22 }
  ],
  annoyed: [
    { action: 'idle', weight: 45 },
    { action: 'walk_left', weight: 18 },
    { action: 'walk_right', weight: 18 },
    { action: 'sit', weight: 17 },
    { action: 'sleep', weight: 2 }
  ]
}

const INTERRUPTION_RESUME_DELAY_MS = 750
const DRAG_RESUME_DELAY_MS = 900

export class AutonomousBehaviorController {
  private readonly listeners = new Set<BehaviorListener>()
  private readonly random: () => number
  private readonly unsubscribeFromActions: () => void
  private schedulerTimer: ReturnType<typeof setTimeout> | undefined
  private ownedAction: PetAction | null = null
  private lastPlannedAction: AutonomousAction | null = null
  private waitingForInterruption = false
  private waitingForWake = false
  private isTransitioning = false
  private emotion: EmotionSnapshot = {
    state: 'neutral',
    intensity: 0,
    startedAt: 0,
    decaysToNeutralAt: null
  }
  private snapshot: AutonomousBehaviorSnapshot = {
    status: 'stopped',
    plannedAction: null,
    isDragPaused: false,
    schedulerActive: false,
    transitionCount: 0,
    mood: 'neutral',
    moodIntensity: 0
  }

  constructor(
    private readonly actionController: PetActionController,
    private readonly options: AutonomousBehaviorControllerOptions
  ) {
    this.random = options.random ?? Math.random
    this.unsubscribeFromActions = actionController.subscribe(this.handleActionStateChange)
  }

  readonly getSnapshot = (): AutonomousBehaviorSnapshot => this.snapshot

  readonly subscribe = (listener: BehaviorListener): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  startAutonomousBehavior(): void {
    if (this.snapshot.status === 'running') {
      return
    }

    this.waitingForInterruption = false
    this.waitingForWake = false
    this.updateSnapshot({ status: 'running', isDragPaused: false })
    this.runAutonomousAction('idle', this.getActionDuration('idle'))
  }

  pauseAutonomousBehavior(): void {
    if (this.snapshot.status !== 'running') {
      return
    }

    this.clearScheduler()
    this.stopMovement()
    this.waitingForInterruption = false
    this.waitingForWake = false
    this.releaseOwnedAction(true)
    this.updateSnapshot({ status: 'paused', plannedAction: null })
  }

  resumeAutonomousBehavior(): void {
    if (this.snapshot.status === 'running') {
      return
    }

    this.updateSnapshot({ status: 'running' })

    if (!this.snapshot.isDragPaused) {
      this.scheduleResume(INTERRUPTION_RESUME_DELAY_MS)
    }
  }

  stopAutonomousBehavior(): void {
    this.clearScheduler()
    this.stopMovement()
    this.waitingForInterruption = false
    this.waitingForWake = false
    this.releaseOwnedAction(true)
    this.updateSnapshot({
      status: 'stopped',
      plannedAction: null,
      isDragPaused: false
    })
  }

  pauseForDrag(): void {
    if (this.snapshot.isDragPaused) {
      return
    }

    this.clearScheduler()
    this.stopMovement()
    this.waitingForInterruption = false
    this.waitingForWake = false
    this.ownedAction = null
    this.updateSnapshot({ isDragPaused: true, plannedAction: null })
  }

  resumeAfterDrag(): void {
    if (!this.snapshot.isDragPaused) {
      return
    }

    this.updateSnapshot({ isDragPaused: false })

    if (this.snapshot.status === 'running') {
      this.scheduleResume(DRAG_RESUME_DELAY_MS)
    }
  }

  forceAutonomousAction(action: AutonomousAction, durationMs?: number): void {
    if (this.snapshot.isDragPaused) {
      return
    }

    if (this.snapshot.status !== 'running') {
      this.updateSnapshot({ status: 'running' })
    }

    this.runAutonomousAction(action, durationMs ?? this.getActionDuration(action), true)
  }

  setEmotion(emotion: EmotionSnapshot): void {
    this.emotion = emotion
    this.updateSnapshot({
      mood: emotion.state,
      moodIntensity: emotion.intensity
    })
  }

  handleMovementEdge(edge: PetMovementEdge): void {
    if (this.snapshot.status !== 'running' || this.snapshot.isDragPaused) {
      return
    }

    const expectedAction: AutonomousAction = edge === 'left' ? 'walk_left' : 'walk_right'

    if (
      this.ownedAction !== expectedAction ||
      this.actionController.getSnapshot().currentAction !== expectedAction
    ) {
      return
    }

    const oppositeAction: AutonomousAction = edge === 'left' ? 'walk_right' : 'walk_left'

    this.runAutonomousAction(oppositeAction, this.getActionDuration(oppositeAction))
  }

  dispose(): void {
    this.stopAutonomousBehavior()
    this.unsubscribeFromActions()
    this.listeners.clear()
  }

  private readonly handleActionStateChange = (): void => {
    if (this.isTransitioning || this.snapshot.status !== 'running' || this.snapshot.isDragPaused) {
      return
    }

    const actionState = this.actionController.getSnapshot()

    if (this.waitingForWake) {
      if (isActiveIdleAfter(actionState, 'wake')) {
        this.waitingForWake = false
        this.ownedAction = null
        this.schedule(() => {
          this.runAutonomousAction('idle', this.getActionDuration('idle'))
        }, 0)
      }

      return
    }

    if (this.ownedAction && actionState.currentAction !== this.ownedAction) {
      this.clearScheduler()
      this.stopMovement()
      this.ownedAction = null
      this.waitingForInterruption = true
      this.updateSnapshot({ plannedAction: null })
    }

    if (this.waitingForInterruption && isActiveIdle(actionState)) {
      this.waitingForInterruption = false
      this.scheduleResume(INTERRUPTION_RESUME_DELAY_MS)
    }
  }

  private runAutonomousAction(
    action: AutonomousAction,
    durationMs: number,
    force = false
  ): void {
    if (this.snapshot.status !== 'running' || this.snapshot.isDragPaused) {
      return
    }

    this.clearScheduler()
    this.waitingForInterruption = false
    this.waitingForWake = false

    const currentAction = this.actionController.getSnapshot().currentAction
    const canReplaceOwnedAction = this.ownedAction === currentAction

    this.isTransitioning = true
    this.ownedAction = action

    const result = this.actionController.playAction(action, {
      force: force || canReplaceOwnedAction
    })

    this.isTransitioning = false

    if (!result.accepted) {
      this.ownedAction = null
      this.waitingForInterruption = true
      this.stopMovement()
      this.updateSnapshot({ plannedAction: null })
      return
    }

    this.lastPlannedAction = action
    this.setMovementForAction(action)
    this.updateSnapshot({
      plannedAction: action,
      transitionCount: this.snapshot.transitionCount + 1
    })
    this.schedule(() => this.completeScheduledAction(action), durationMs)
  }

  private completeScheduledAction(expectedAction: AutonomousAction): void {
    if (
      this.snapshot.status !== 'running' ||
      this.snapshot.isDragPaused ||
      this.ownedAction !== expectedAction ||
      this.actionController.getSnapshot().currentAction !== expectedAction
    ) {
      return
    }

    if (expectedAction === 'sleep') {
      this.beginWakeSequence()
      return
    }

    const nextAction = this.chooseNextAction()

    this.runAutonomousAction(nextAction, this.getActionDuration(nextAction))
  }

  private beginWakeSequence(): void {
    this.clearScheduler()
    this.stopMovement()
    this.waitingForWake = true

    const currentAction = this.actionController.getSnapshot().currentAction
    const canReplaceOwnedAction = this.ownedAction === currentAction

    this.isTransitioning = true
    this.ownedAction = 'wake'

    const result = this.actionController.playAction('wake', {
      force: canReplaceOwnedAction
    })

    this.isTransitioning = false

    if (!result.accepted) {
      this.ownedAction = null
      this.waitingForWake = false
      this.waitingForInterruption = true
      this.updateSnapshot({ plannedAction: null })
      return
    }

    this.updateSnapshot({
      plannedAction: 'wake',
      transitionCount: this.snapshot.transitionCount + 1
    })
  }

  private chooseNextAction(): AutonomousAction {
    const availableActions = this.getWeightedActions().filter(
      ({ action }) => action !== this.lastPlannedAction
    )
    const totalWeight = availableActions.reduce((total, { weight }) => total + weight, 0)
    let selectedWeight = this.random() * totalWeight

    for (const { action, weight } of availableActions) {
      selectedWeight -= weight

      if (selectedWeight <= 0) {
        return action
      }
    }

    return availableActions[availableActions.length - 1]?.action ?? 'idle'
  }

  private getActionDuration(action: AutonomousAction): number {
    const range = ACTION_DURATION_RANGES[action]
    const multiplier = getDurationMultiplier(this.emotion, action)

    return Math.round(
      (range.minimum + this.random() * (range.maximum - range.minimum)) * multiplier
    )
  }

  private getWeightedActions(): readonly WeightedAction[] {
    const target = EMOTION_WEIGHT_TARGETS[this.emotion.state]
    const intensity = this.emotion.intensity

    return WEIGHTED_ACTIONS.map((base) => {
      const targetWeight = target.find(({ action }) => action === base.action)?.weight ?? base.weight

      return {
        action: base.action,
        weight: base.weight + (targetWeight - base.weight) * intensity
      }
    })
  }

  private setMovementForAction(action: AutonomousAction): void {
    if (action === 'walk_left') {
      this.options.setMovement('left')
      return
    }

    if (action === 'walk_right') {
      this.options.setMovement('right')
      return
    }

    this.stopMovement()
  }

  private stopMovement(): void {
    this.options.setMovement('stopped')
  }

  private releaseOwnedAction(returnToIdle: boolean): void {
    const currentAction = this.actionController.getSnapshot().currentAction

    if (returnToIdle && this.ownedAction && currentAction === this.ownedAction) {
      this.isTransitioning = true
      this.actionController.playAction('idle', { force: true })
      this.isTransitioning = false
    }

    this.ownedAction = null
  }

  private scheduleResume(delayMs: number): void {
    this.schedule(() => {
      this.runAutonomousAction('idle', this.getActionDuration('idle'))
    }, delayMs)
  }

  private schedule(callback: () => void, delayMs: number): void {
    this.clearScheduler()
    this.schedulerTimer = setTimeout(() => {
      this.schedulerTimer = undefined
      this.updateSnapshot({ schedulerActive: false })
      callback()
    }, delayMs)
    this.updateSnapshot({ schedulerActive: true })
  }

  private clearScheduler(): void {
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer)
      this.schedulerTimer = undefined
    }

    if (this.snapshot.schedulerActive) {
      this.updateSnapshot({ schedulerActive: false })
    }
  }

  private updateSnapshot(update: Partial<AutonomousBehaviorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update }

    for (const listener of this.listeners) {
      listener()
    }
  }
}

function isActiveIdle(state: PetActionState): boolean {
  return state.currentAction === 'idle' && state.lifecycle === 'active'
}

function isActiveIdleAfter(state: PetActionState, previousAction: PetAction): boolean {
  return isActiveIdle(state) && state.previousAction === previousAction
}

function getDurationMultiplier(
  emotion: EmotionSnapshot,
  action: AutonomousAction
): number {
  const intensity = emotion.intensity

  switch (emotion.state) {
    case 'excited':
      return 1 - 0.2 * intensity
    case 'happy':
      return 1 - 0.08 * intensity
    case 'calm':
      return 1 + 0.22 * intensity
    case 'sleepy':
      return action === 'walk_left' || action === 'walk_right'
        ? 1
        : 1 + 0.3 * intensity
    case 'annoyed':
      return 1 + 0.08 * intensity
    case 'neutral':
      return 1
  }
}
