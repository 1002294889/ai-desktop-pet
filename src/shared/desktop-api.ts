import type { LoadedCharacter } from './character'
import type { AIPetAction } from './ai-pet-action'
import type { ChatSendResult, ChatState } from './chat'
import type {
  CompanionAutonomousAction,
  CompanionInteraction,
  CompanionStateSnapshot
} from './companion-state'
import type { PetMovementDirection, PetMovementEdge, PetMovementSnapshot } from './pet-movement'
import type { PetPointerPosition } from './pet-pointer-drag'
import type {
  ClearMemoryResult,
  DeleteMemoryItemResult,
  ManagedMemory,
  ManagedProfileEntry,
  MemoryOverview,
  MemoryOverviewQuery,
  MemorySettings,
  UpdateManagedMemoryInput,
  UpdateManagedProfileInput
} from './memory-management'

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
  onChatPetActions: (listener: (actions: readonly AIPetAction[]) => void) => () => void
  openChat: () => void
  closeChat: () => void
  showSpeechBubble: () => void
  dismissSpeechBubble: () => void
  sendChatMessage: (content: string) => Promise<ChatSendResult>
  openMemorySettings: () => void
  getMemoryOverview: (query: MemoryOverviewQuery) => Promise<MemoryOverview>
  updateMemoryProfile: (input: UpdateManagedProfileInput) => Promise<ManagedProfileEntry>
  deleteMemoryProfile: (key: string) => Promise<DeleteMemoryItemResult>
  updateManagedMemory: (input: UpdateManagedMemoryInput) => Promise<ManagedMemory | null>
  deleteManagedMemory: (id: number) => Promise<DeleteMemoryItemResult>
  setLongTermMemoryEnabled: (enabled: boolean) => Promise<MemorySettings>
  clearConversationHistory: () => Promise<ClearMemoryResult>
  clearLongTermMemory: () => Promise<ClearMemoryResult>
  clearAllMemory: () => Promise<ClearMemoryResult>
  getCompanionState: () => Promise<CompanionStateSnapshot>
  onCompanionStateChange: (
    listener: (snapshot: CompanionStateSnapshot) => void
  ) => () => void
  reportCompanionInteraction: (interaction: CompanionInteraction) => void
  reportCompanionAutonomousAction: (action: CompanionAutonomousAction) => void
  resetCompanionEmotion: () => Promise<CompanionStateSnapshot>
  resetCompanionRelationship: () => Promise<CompanionStateSnapshot>
}
