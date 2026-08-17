import type { LoadedCharacter } from './character'
import type { PetMovementDirection, PetMovementEdge, PetMovementSnapshot } from './pet-movement'
import type { PetPointerPosition } from './pet-pointer-drag'

export interface DesktopApi {
  getAppVersion: () => Promise<string>
  getActiveCharacter: () => Promise<LoadedCharacter>
  onPetDragStateChange: (listener: (isDragging: boolean) => void) => () => void
  setPetMovement: (direction: PetMovementDirection) => void
  onPetMovementEdge: (listener: (edge: PetMovementEdge) => void) => () => void
  onPetMovementStateChange: (listener: (snapshot: PetMovementSnapshot) => void) => () => void
  startPetPointerDrag: (position: PetPointerPosition) => void
  updatePetPointerDrag: (position: PetPointerPosition) => void
  endPetPointerDrag: () => void
}
