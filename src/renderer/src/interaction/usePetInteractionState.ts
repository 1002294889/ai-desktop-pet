import { useSyncExternalStore } from 'react'

import type {
  PetInteractionController,
  PetInteractionSnapshot
} from './PetInteractionController'

export function usePetInteractionState(
  controller: PetInteractionController
): PetInteractionSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot)
}
