import { useSyncExternalStore } from 'react'

import type { PetActionState } from '../../../shared/pet-action'
import type { PetActionController } from './PetActionController'

export function usePetActionState(controller: PetActionController): PetActionState {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot)
}
