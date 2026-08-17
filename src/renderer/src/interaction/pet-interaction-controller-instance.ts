import { autonomousBehaviorController } from '../behavior/autonomous-behavior-controller-instance'
import { petActionController } from '../pet/pet-action-controller-instance'
import { PetInteractionController } from './PetInteractionController'

export const petInteractionController = new PetInteractionController(
  petActionController,
  autonomousBehaviorController,
  {
    startPointerDrag: (position) => window.desktopApi.startPetPointerDrag(position),
    updatePointerDrag: (position) => window.desktopApi.updatePetPointerDrag(position),
    endPointerDrag: () => window.desktopApi.endPetPointerDrag()
  }
)
