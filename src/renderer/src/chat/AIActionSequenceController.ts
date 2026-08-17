import {
  validateAIPetActionSequence,
  type AIPetAction
} from '../../../shared/ai-pet-action'
import type { PetActionState } from '../../../shared/pet-action'
import type { PetActionController } from '../pet/PetActionController'

export type AIActionSequenceStatus = 'idle' | 'waiting' | 'playing' | 'holding'

export interface AIActionSequenceSnapshot {
  status: AIActionSequenceStatus
  activeAction: AIPetAction | null
  pendingActions: readonly AIPetAction[]
  terminalAction: Extract<AIPetAction, 'sit' | 'sleep'> | null
  sequenceId: number
  completedActions: number
}

type SequenceListener = () => void
type TerminalAction = Extract<AIPetAction, 'sit' | 'sleep'>

export class AIActionSequenceController {
  private readonly listeners = new Set<SequenceListener>()
  private readonly unsubscribeFromActions: () => void
  private queue: AIPetAction[] = []
  private activeAction: AIPetAction | undefined
  private terminalAction: TerminalAction | undefined
  private releaseRequested = false
  private sequenceId = 0
  private completedActions = 0
  private status: AIActionSequenceStatus = 'idle'
  private snapshot: AIActionSequenceSnapshot = {
    status: 'idle',
    activeAction: null,
    pendingActions: [],
    terminalAction: null,
    sequenceId: 0,
    completedActions: 0
  }

  constructor(private readonly actionController: PetActionController) {
    this.unsubscribeFromActions = actionController.subscribe(this.handleActionStateChange)
  }

  readonly getSnapshot = (): AIActionSequenceSnapshot => this.snapshot

  readonly subscribe = (listener: SequenceListener): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  playActions(actions: readonly AIPetAction[]): void {
    const validation = validateAIPetActionSequence(actions)

    if (validation.rejected.length > 0) {
      this.log('Rejected renderer action requests', validation.rejected)
    }

    if (validation.actions.length === 0) {
      return
    }

    this.sequenceId += 1
    this.completedActions = 0
    this.releaseRequested = false
    this.terminalAction = undefined
    this.queue = this.prepareForCurrentState(validation.actions)

    if (!this.activeAction) {
      this.status = 'waiting'
    }

    this.log('Sequence started', {
      sequenceId: this.sequenceId,
      actions: this.queue
    })
    this.emit()
    this.playNextAction()
  }

  isEngaged(): boolean {
    return this.status !== 'idle'
  }

  releaseForAutonomy(): boolean {
    if (!this.isEngaged()) {
      return false
    }

    this.releaseRequested = true

    if (this.status === 'holding') {
      this.releaseTerminalAction()
    }

    return true
  }

  dispose(): void {
    this.queue = []
    this.activeAction = undefined
    this.terminalAction = undefined
    this.status = 'idle'
    this.unsubscribeFromActions()
    this.listeners.clear()
  }

  private readonly handleActionStateChange = (): void => {
    const state = this.actionController.getSnapshot()

    if (!this.activeAction) {
      if (this.status === 'waiting') {
        this.playNextAction()
      }

      return
    }

    if (isActiveIdle(state)) {
      const completedAction = this.activeAction
      const completedNormally = state.previousAction === completedAction

      this.activeAction = undefined

      if (completedNormally) {
        this.completedActions += 1
        this.log('Action completed', {
          sequenceId: this.sequenceId,
          action: completedAction
        })
      } else {
        this.log('Action interrupted', {
          sequenceId: this.sequenceId,
          action: completedAction
        })
      }

      this.status = 'waiting'
      this.emit()
      this.playNextAction()
      return
    }

    if (state.lifecycle === 'active' && state.currentAction !== this.activeAction) {
      const interruptedAction = this.activeAction

      this.activeAction = undefined
      this.status = 'waiting'
      this.log('Action interrupted', {
        sequenceId: this.sequenceId,
        action: interruptedAction,
        by: state.currentAction
      })
      this.emit()
      this.playNextAction()
    }
  }

  private playNextAction(): void {
    if (this.activeAction || this.status === 'holding') {
      return
    }

    const nextAction = this.queue[0]

    if (!nextAction) {
      this.finishSequence()
      return
    }

    const state = this.actionController.getSnapshot()

    if (state.currentAction === 'sleep' && nextAction !== 'sleep' && nextAction !== 'wake') {
      this.queue.unshift('wake')
      this.emit()
      this.playNextAction()
      return
    }

    if (!canStartFromState(state, nextAction)) {
      this.status = 'waiting'
      this.emit()
      return
    }

    this.queue.shift()

    if (
      (state.currentAction === 'sleep' && nextAction === 'sleep') ||
      (state.currentAction === 'sit' && nextAction === 'sit')
    ) {
      this.terminalAction = nextAction
      this.completedActions += 1
      this.log('Action already active', {
        sequenceId: this.sequenceId,
        action: nextAction
      })
      this.finishSequence()
      return
    }

    this.activeAction = nextAction
    this.status = 'playing'
    this.log('Action started', { sequenceId: this.sequenceId, action: nextAction })
    this.emit()

    const result = this.actionController.playAction(nextAction)

    if (!result.accepted) {
      this.activeAction = undefined
      this.status = 'waiting'
      this.log('Action rejected by PetActionController', {
        sequenceId: this.sequenceId,
        action: nextAction,
        reason: result.reason
      })
      this.emit()
      this.playNextAction()
      return
    }

    if (isTerminalAction(nextAction)) {
      this.activeAction = undefined
      this.terminalAction = nextAction
      this.completedActions += 1
      this.log('Action completed', {
        sequenceId: this.sequenceId,
        action: nextAction,
        terminal: true
      })
      this.finishSequence()
    }
  }

  private finishSequence(): void {
    if (this.queue.length > 0 || this.activeAction) {
      return
    }

    if (this.terminalAction) {
      if (this.releaseRequested) {
        this.releaseTerminalAction()
        return
      }

      this.status = 'holding'
      this.log('Sequence completed in terminal state', {
        sequenceId: this.sequenceId,
        terminalAction: this.terminalAction
      })
      this.emit()
      return
    }

    if (!isActiveIdle(this.actionController.getSnapshot())) {
      this.status = 'waiting'
      this.emit()
      return
    }

    this.status = 'idle'
    this.releaseRequested = false
    this.log('Sequence completed', {
      sequenceId: this.sequenceId,
      completedActions: this.completedActions
    })
    this.emit()
  }

  private releaseTerminalAction(): void {
    const terminalAction = this.terminalAction

    this.terminalAction = undefined
    this.status = 'waiting'

    if (terminalAction === 'sleep') {
      this.queue = ['wake', ...this.queue]
      this.emit()
      this.playNextAction()
      return
    }

    if (terminalAction === 'sit') {
      this.emit()

      if (!this.actionController.completeCurrentAction('sit', 'idle')) {
        this.actionController.playAction('idle', { force: true })
      }

      if (this.status === 'waiting') {
        this.playNextAction()
      }

      return
    }

    this.finishSequence()
  }

  private prepareForCurrentState(actions: readonly AIPetAction[]): AIPetAction[] {
    const currentAction = this.actionController.getSnapshot().currentAction
    const needsWake =
      currentAction === 'sleep' &&
      actions[0] !== 'wake' &&
      actions.some((action) => action !== 'sleep')

    return needsWake ? ['wake', ...actions] : [...actions]
  }

  private emit(): void {
    this.snapshot = {
      status: this.status,
      activeAction: this.activeAction ?? null,
      pendingActions: [...this.queue],
      terminalAction: this.terminalAction ?? null,
      sequenceId: this.sequenceId,
      completedActions: this.completedActions
    }

    for (const listener of this.listeners) {
      listener()
    }
  }

  private log(message: string, details: unknown): void {
    if (import.meta.env.DEV) {
      console.info(`[AIActionSequence] ${message}`, details)
    }
  }
}

function isTerminalAction(action: AIPetAction): action is TerminalAction {
  return action === 'sit' || action === 'sleep'
}

function canStartFromState(state: PetActionState, nextAction: AIPetAction): boolean {
  if (state.lifecycle !== 'active') {
    return false
  }

  if (state.currentAction === 'idle' || state.currentAction === 'sit') {
    return true
  }

  return state.currentAction === 'sleep' && (nextAction === 'sleep' || nextAction === 'wake')
}

function isActiveIdle(state: PetActionState): boolean {
  return state.currentAction === 'idle' && state.lifecycle === 'active'
}
