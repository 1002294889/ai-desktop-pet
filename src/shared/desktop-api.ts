import type { LoadedCharacter } from './character'

export interface DesktopApi {
  getAppVersion: () => Promise<string>
  getActiveCharacter: () => Promise<LoadedCharacter>
  onPetDragStateChange: (listener: (isDragging: boolean) => void) => () => void
}
