import type {
  PetAction,
  PetActionLifecycle,
  PetActionRequestOptions,
  PetActionRequestResult,
  PetActionState
} from '../../../shared/pet-action'
import { PET_ACTION_POLICIES } from './pet-action-priorities'

type PetActionListener = () => void

export class PetActionController {
  private readonly listeners = new Set<PetActionListener>()
  private completionTimer: ReturnType<typeof setTimeout> | undefined
  private returnAction: PetAction = 'idle'
  private state: PetActionState

  constructor() {
    const idlePolicy = PET_ACTION_POLICIES.idle

    this.state = {
      currentAction: 'idle',
      previousAction: null,
      currentActionPriority: idlePolicy.priority,
      isInterruptible: idlePolicy.interruptible,
      lifecycle: 'active',
      startedAt: Date.now()
    }
  }

  readonly getSnapshot = (): PetActionState => this.state

  readonly subscribe = (listener: PetActionListener): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  playAction(action: PetAction, options: PetActionRequestOptions = {}): PetActionRequestResult {
    const nextPolicy = PET_ACTION_POLICIES[action]

    if (!options.force) {
      if (!this.state.isInterruptible) {
        return { accepted: false, reason: 'current-action-not-interruptible' }
      }

      if (nextPolicy.priority < this.state.currentActionPriority) {
        return { accepted: false, reason: 'lower-priority' }
      }
    }

    const previousAction = this.state.currentAction
    const durationMs = options.durationMs ?? nextPolicy.durationMs

    this.clearCompletionTimer()

    if (this.isActionInProgress(this.state.lifecycle)) {
      this.setState({ ...this.state, lifecycle: 'cancelled' })
    }

    this.returnAction = options.returnTo ?? 'idle'

    const nextState: Omit<PetActionState, 'lifecycle'> = {
      currentAction: action,
      previousAction,
      currentActionPriority: nextPolicy.priority,
      isInterruptible: nextPolicy.interruptible,
      startedAt: Date.now(),
      ...(durationMs === undefined ? {} : { durationMs })
    }

    this.setState({ ...nextState, lifecycle: 'requested' })
    this.setState({ ...nextState, lifecycle: 'started' })
    this.setState({ ...nextState, lifecycle: 'active' })

    if (durationMs !== undefined) {
      this.completionTimer = setTimeout(() => {
        this.completeCurrentAction(action)
      }, durationMs)
    }

    return { accepted: true }
  }

  completeCurrentAction(expectedAction?: PetAction, returnTo?: PetAction): boolean {
    if (expectedAction && this.state.currentAction !== expectedAction) {
      return false
    }

    const completedAction = this.state.currentAction
    const nextAction = returnTo ?? this.returnAction

    this.clearCompletionTimer()
    this.setState({ ...this.state, lifecycle: 'completed' })
    this.playAction(nextAction, { force: true })

    return this.state.previousAction === completedAction
  }

  cancelCurrentAction(returnTo: PetAction = 'idle'): void {
    this.clearCompletionTimer()
    this.setState({ ...this.state, lifecycle: 'cancelled' })
    this.playAction(returnTo, { force: true })
  }

  dispose(): void {
    this.clearCompletionTimer()
    this.listeners.clear()
  }

  private isActionInProgress(lifecycle: PetActionLifecycle): boolean {
    return lifecycle === 'requested' || lifecycle === 'started' || lifecycle === 'active'
  }

  private setState(state: PetActionState): void {
    this.state = state

    for (const listener of this.listeners) {
      listener()
    }
  }

  private clearCompletionTimer(): void {
    if (this.completionTimer !== undefined) {
      clearTimeout(this.completionTimer)
      this.completionTimer = undefined
    }
  }
}
