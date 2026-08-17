import type { LoadedCharacter } from './character'
import type { ChatPetReaction, ChatSendResult, ChatState } from './chat'
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
  getChatState: () => Promise<ChatState>
  onChatStateChange: (listener: (state: ChatState) => void) => () => void
  onChatPetReaction: (listener: (action: ChatPetReaction) => void) => () => void
  openChat: () => void
  closeChat: () => void
  showSpeechBubble: () => void
  dismissSpeechBubble: () => void
  sendChatMessage: (content: string) => Promise<ChatSendResult>
}
