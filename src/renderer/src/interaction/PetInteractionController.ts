import type { PetAction, PetActionState } from '../../../shared/pet-action'
import type { PetPointerPosition } from '../../../shared/pet-pointer-drag'
import type { AutonomousBehaviorController } from '../behavior/AutonomousBehaviorController'
import type { PetActionController } from '../pet/PetActionController'

export type PetInteractionKind =
  | 'none'
  | 'hover'
  | 'pressed'
  | 'click-pending'
  | 'single-click'
  | 'double-click'
  | 'hold'
  | 'dragging'
  | 'drag-release'

export interface PetInteractionSnapshot {
  currentInteraction: PetInteractionKind
  isHovered: boolean
  isPressed: boolean
  isDragging: boolean
  interactionCount: number
}

export interface PetPointerInput extends PetPointerPosition {
  pointerId: number
  button: number
}

interface PetInteractionControllerOptions {
  startPointerDrag: (position: PetPointerPosition) => void
  updatePointerDrag: (position: PetPointerPosition) => void
  endPointerDrag: () => void
}

interface PendingClick {
  releasedAt: number
  position: PetPointerPosition
}

type InteractionListener = () => void

const DRAG_THRESHOLD_PX = 8
const HOLD_THRESHOLD_MS = 550
const DOUBLE_CLICK_DELAY_MS = 300
const DOUBLE_CLICK_DISTANCE_PX = 12
const CUSTOM_DRAG_SETTLE_MS = 500

export class PetInteractionController {
  private readonly listeners = new Set<InteractionListener>()
  private readonly unsubscribeFromActions: () => void
  private activePointer: PetPointerInput | undefined
  private latestPointerPosition: PetPointerPosition | undefined
  private holdTimer: ReturnType<typeof setTimeout> | undefined
  private singleClickTimer: ReturnType<typeof setTimeout> | undefined
  private pendingClick: PendingClick | undefined
  private holdTriggered = false
  private isCustomDrag = false
  private ignoreSystemDragUntil = 0
  private reactionQueue: PetAction[] = []
  private activeReaction: PetAction | undefined
  private shouldResumeAutonomy = false
  private ownsAutonomyPause = false
  private dragPauseActive = false
  private needsWakeBeforeReaction = false
  private snapshot: PetInteractionSnapshot = {
    currentInteraction: 'none',
    isHovered: false,
    isPressed: false,
    isDragging: false,
    interactionCount: 0
  }

  constructor(
    private readonly actionController: PetActionController,
    private readonly behaviorController: AutonomousBehaviorController,
    private readonly options: PetInteractionControllerOptions
  ) {
    this.unsubscribeFromActions = actionController.subscribe(this.handleActionStateChange)
  }

  readonly getSnapshot = (): PetInteractionSnapshot => this.snapshot

  readonly subscribe = (listener: InteractionListener): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  pointerEnter(): void {
    if (this.snapshot.isHovered) {
      return
    }

    this.updateSnapshot({
      isHovered: true,
      ...(this.snapshot.currentInteraction === 'none'
        ? { currentInteraction: 'hover' as const }
        : {})
    })
  }

  pointerLeave(): void {
    if (!this.snapshot.isHovered) {
      return
    }

    this.updateSnapshot({
      isHovered: false,
      ...(this.snapshot.currentInteraction === 'hover'
        ? { currentInteraction: 'none' as const }
        : {})
    })
  }

  pointerDown(input: PetPointerInput): boolean {
    if (input.button !== 0 || this.activePointer || this.snapshot.isDragging) {
      return false
    }

    if (!this.ownsAutonomyPause) {
      const currentAction = this.actionController.getSnapshot().currentAction

      this.needsWakeBeforeReaction = currentAction === 'sleep' || currentAction === 'wake'
      this.captureAutonomyState()

      if (this.shouldResumeAutonomy) {
        this.behaviorController.pauseAutonomousBehavior()
      }
    }

    this.activePointer = input
    this.latestPointerPosition = toPosition(input)
    this.holdTriggered = false
    this.clearHoldTimer()
    this.holdTimer = setTimeout(() => this.triggerHold(), HOLD_THRESHOLD_MS)
    this.updateSnapshot({ currentInteraction: 'pressed', isPressed: true })

    return true
  }

  pointerMove(input: PetPointerInput): boolean {
    if (!this.activePointer || input.pointerId !== this.activePointer.pointerId) {
      return false
    }

    this.latestPointerPosition = toPosition(input)

    if (!this.snapshot.isDragging && exceedsDistance(input, this.activePointer, DRAG_THRESHOLD_PX)) {
      this.beginCustomDrag(input)
    }

    if (this.snapshot.isDragging && this.isCustomDrag) {
      this.options.updatePointerDrag(toPosition(input))
      return true
    }

    return false
  }

  pointerUp(input: PetPointerInput): boolean {
    if (!this.activePointer || input.pointerId !== this.activePointer.pointerId) {
      return false
    }

    const wasDragging = this.snapshot.isDragging
    const wasHold = this.holdTriggered

    this.clearHoldTimer()
    this.activePointer = undefined
    this.latestPointerPosition = undefined
    this.updateSnapshot({ isPressed: false })

    if (wasDragging) {
      if (this.isCustomDrag) {
        this.options.endPointerDrag()
        this.ignoreSystemDragUntil = Date.now() + CUSTOM_DRAG_SETTLE_MS
      }

      this.finishDrag()
      return true
    }

    if (wasHold) {
      this.finishInteractionIfReady()
      return false
    }

    this.registerClick(toPosition(input))
    return false
  }

  pointerCancel(pointerId: number): void {
    if (!this.activePointer || pointerId !== this.activePointer.pointerId) {
      return
    }

    const wasDragging = this.snapshot.isDragging

    this.clearHoldTimer()
    this.clearPendingSingleClick()
    this.activePointer = undefined
    this.latestPointerPosition = undefined
    this.updateSnapshot({ isPressed: false })

    if (wasDragging) {
      if (this.isCustomDrag) {
        this.options.endPointerDrag()
        this.ignoreSystemDragUntil = Date.now() + CUSTOM_DRAG_SETTLE_MS
      }

      this.finishDrag()
      return
    }

    this.finishInteraction()
  }

  handleSystemDragState(isDragging: boolean): void {
    if (isDragging) {
      if (Date.now() < this.ignoreSystemDragUntil || this.snapshot.isDragging) {
        return
      }

      this.beginDrag(false)
      return
    }

    if (this.snapshot.isDragging && !this.isCustomDrag) {
      this.finishDrag()
    }
  }

  dispose(): void {
    this.clearHoldTimer()
    this.clearSingleClickTimer()

    if (this.isCustomDrag) {
      this.options.endPointerDrag()
    }

    this.reactionQueue = []
    this.activeReaction = undefined
    this.finishInteraction()
    this.unsubscribeFromActions()
    this.listeners.clear()
  }

  private readonly handleActionStateChange = (): void => {
    if (!this.activeReaction) {
      return
    }

    const state = this.actionController.getSnapshot()

    if (state.currentAction === 'dragged') {
      this.reactionQueue = []
      this.activeReaction = undefined
      return
    }

    if (isActiveIdle(state)) {
      const completedExpectedReaction = state.previousAction === this.activeReaction

      this.activeReaction = undefined

      if (completedExpectedReaction) {
        this.playNextReaction()
      } else {
        this.reactionQueue = []
        this.finishInteractionIfReady()
      }
    }
  }

  private triggerHold(): void {
    this.holdTimer = undefined

    if (!this.activePointer || this.snapshot.isDragging) {
      return
    }

    this.holdTriggered = true
    this.clearPendingSingleClick()
    this.startReaction(
      this.needsWakeBeforeReaction ? ['wake', 'happy'] : ['happy'],
      'hold'
    )
  }

  private registerClick(position: PetPointerPosition): void {
    const now = Date.now()

    if (
      this.pendingClick &&
      now - this.pendingClick.releasedAt <= DOUBLE_CLICK_DELAY_MS &&
      distanceBetween(position, this.pendingClick.position) <= DOUBLE_CLICK_DISTANCE_PX
    ) {
      this.clearPendingSingleClick()
      this.startReaction(
        this.needsWakeBeforeReaction ? ['wake', 'jump', 'happy'] : ['jump', 'happy'],
        'double-click'
      )
      return
    }

    if (this.pendingClick) {
      this.triggerPendingSingleClick()
    }

    this.pendingClick = { releasedAt: now, position }
    this.clearSingleClickTimer()
    this.singleClickTimer = setTimeout(() => this.triggerPendingSingleClick(), DOUBLE_CLICK_DELAY_MS)
    this.updateSnapshot({ currentInteraction: 'click-pending' })
  }

  private triggerPendingSingleClick(): void {
    if (!this.pendingClick) {
      return
    }

    this.clearPendingSingleClick()
    this.startReaction(this.needsWakeBeforeReaction ? ['wake'] : ['wave'], 'single-click')
  }

  private beginCustomDrag(input: PetPointerInput): void {
    if (!this.activePointer) {
      return
    }

    this.clearHoldTimer()
    this.clearPendingSingleClick()
    this.isCustomDrag = true
    this.options.startPointerDrag(toPosition(this.activePointer))
    this.beginDrag(true)
    this.options.updatePointerDrag(toPosition(input))
  }

  private beginDrag(isCustom: boolean): void {
    this.clearHoldTimer()
    this.clearPendingSingleClick()
    this.clearReactionSequence()
    this.captureAutonomyState()
    this.behaviorController.pauseForDrag()
    this.dragPauseActive = true
    this.isCustomDrag = isCustom
    this.actionController.playAction('dragged', { force: true })
    this.updateSnapshot({
      currentInteraction: 'dragging',
      isDragging: true,
      interactionCount: this.snapshot.interactionCount + 1
    })
  }

  private finishDrag(): void {
    if (!this.snapshot.isDragging) {
      return
    }

    this.isCustomDrag = false
    this.actionController.completeCurrentAction('dragged', 'idle')
    this.updateSnapshot({
      currentInteraction: 'drag-release',
      isDragging: false,
      interactionCount: this.snapshot.interactionCount + 1
    })
    this.startReaction(['happy'], 'drag-release', false)
  }

  private startReaction(
    actions: PetAction[],
    interaction: PetInteractionKind,
    incrementCount = true
  ): void {
    this.clearReactionSequence()
    this.needsWakeBeforeReaction = false
    this.reactionQueue = [...actions]
    this.updateSnapshot({
      currentInteraction: interaction,
      ...(incrementCount
        ? { interactionCount: this.snapshot.interactionCount + 1 }
        : {})
    })
    this.playNextReaction()
  }

  private playNextReaction(): void {
    const nextAction = this.reactionQueue.shift()

    if (!nextAction) {
      this.finishInteractionIfReady()
      return
    }

    const currentAction = this.actionController.getSnapshot().currentAction

    if (nextAction === 'wake' && currentAction === 'wake') {
      this.activeReaction = 'wake'
      return
    }

    this.activeReaction = nextAction
    const result = this.actionController.playAction(nextAction)

    if (!result.accepted) {
      this.activeReaction = undefined
      this.reactionQueue = []
      this.finishInteractionIfReady()
    }
  }

  private finishInteractionIfReady(): void {
    if (this.activeReaction || this.reactionQueue.length > 0 || this.activePointer) {
      return
    }

    this.finishInteraction()
  }

  private finishInteraction(): void {
    if (this.dragPauseActive) {
      this.behaviorController.resumeAfterDrag()
      this.dragPauseActive = false
    }

    if (this.ownsAutonomyPause && this.shouldResumeAutonomy) {
      this.behaviorController.resumeAutonomousBehavior()
    }

    this.ownsAutonomyPause = false
    this.shouldResumeAutonomy = false
    this.needsWakeBeforeReaction = false
    this.updateSnapshot({
      currentInteraction: this.snapshot.isHovered ? 'hover' : 'none',
      isPressed: false
    })
  }

  private captureAutonomyState(): void {
    if (this.ownsAutonomyPause) {
      return
    }

    this.shouldResumeAutonomy =
      this.behaviorController.getSnapshot().status === 'running'
    this.ownsAutonomyPause = true
  }

  private clearReactionSequence(): void {
    this.reactionQueue = []
    this.activeReaction = undefined
  }

  private clearPendingSingleClick(): void {
    this.clearSingleClickTimer()
    this.pendingClick = undefined
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer)
      this.holdTimer = undefined
    }
  }

  private clearSingleClickTimer(): void {
    if (this.singleClickTimer) {
      clearTimeout(this.singleClickTimer)
      this.singleClickTimer = undefined
    }
  }

  private updateSnapshot(update: Partial<PetInteractionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update }

    for (const listener of this.listeners) {
      listener()
    }
  }
}

function toPosition(input: PetPointerInput): PetPointerPosition {
  return { screenX: input.screenX, screenY: input.screenY }
}

function exceedsDistance(
  current: PetPointerPosition,
  start: PetPointerPosition,
  threshold: number
): boolean {
  return distanceBetween(current, start) >= threshold
}

function distanceBetween(left: PetPointerPosition, right: PetPointerPosition): number {
  return Math.hypot(left.screenX - right.screenX, left.screenY - right.screenY)
}

function isActiveIdle(state: PetActionState): boolean {
  return state.currentAction === 'idle' && state.lifecycle === 'active'
}
