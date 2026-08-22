import { useEffect } from 'react'

import type { PetAction } from '../../../shared/pet-action'
import {
  AUTONOMOUS_ACTIONS,
  type AutonomousAction,
  type AutonomousBehaviorController
} from '../behavior/AutonomousBehaviorController'
import type { PetActionController } from './PetActionController'

export const DEVELOPMENT_ACTION_SHORTCUTS: Readonly<Record<string, PetAction>> = {
  '0': 'idle',
  '1': 'walk_left',
  '2': 'walk_right',
  '3': 'sit',
  '4': 'sleep',
  '5': 'wake',
  '6': 'happy',
  '7': 'angry',
  '8': 'jump',
  '9': 'wave',
  t: 'talk',
  d: 'dragged'
}

const DEVELOPMENT_ACTION_DURATIONS: Partial<Record<AutonomousAction, number>> = {
  idle: 5_000,
  walk_left: 60_000,
  walk_right: 60_000,
  sit: 5_000,
  sleep: 12_000
}

export function useDeveloperActionShortcuts(
  actionController: PetActionController,
  behaviorController: AutonomousBehaviorController
): void {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'p') {
        event.preventDefault()
        behaviorController.pauseAutonomousBehavior()
        return
      }

      if (key === 'r') {
        event.preventDefault()
        behaviorController.resumeAutonomousBehavior()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        behaviorController.forceAutonomousAction('idle', DEVELOPMENT_ACTION_DURATIONS.idle)
        return
      }

      const action = DEVELOPMENT_ACTION_SHORTCUTS[key]

      if (!action) {
        return
      }

      event.preventDefault()

      if (isAutonomousAction(action)) {
        behaviorController.forceAutonomousAction(
          action,
          DEVELOPMENT_ACTION_DURATIONS[action]
        )
        return
      }

      const result = actionController.playAction(action, { force: action === 'dragged' })

      if (!result.accepted) {
        console.info(
          `[PetActionController] Rejected "${action}": ${result.reason ?? 'unknown reason'}`
        )
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actionController, behaviorController])
}

function isAutonomousAction(action: PetAction): action is AutonomousAction {
  return AUTONOMOUS_ACTIONS.includes(action as AutonomousAction)
}
