import { useEffect } from 'react'

import type { PetAction } from '../../../shared/pet-action'
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

export function useDeveloperActionShortcuts(controller: PetActionController): void {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        controller.playAction('idle', { force: true })
        return
      }

      const action = DEVELOPMENT_ACTION_SHORTCUTS[event.key.toLowerCase()]

      if (!action) {
        return
      }

      event.preventDefault()
      const result = controller.playAction(action, { force: action === 'dragged' })

      if (!result.accepted) {
        console.info(
          `[PetActionController] Rejected "${action}": ${result.reason ?? 'unknown reason'}`
        )
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [controller])
}
