export const IPC_CHANNELS = {
  getAppVersion: 'app:get-version',
  getActiveCharacter: 'characters:get-active',
  petDragStateChanged: 'pet:drag-state-changed',
  petMovementCommand: 'pet:movement-command',
  petMovementEdgeReached: 'pet:movement-edge-reached',
  petMovementStateChanged: 'pet:movement-state-changed',
  petPointerDragStart: 'pet:pointer-drag-start',
  petPointerDragMove: 'pet:pointer-drag-move',
  petPointerDragEnd: 'pet:pointer-drag-end',
  getChatState: 'chat:get-state',
  chatStateChanged: 'chat:state-changed',
  chatPetActions: 'chat:pet-actions',
  openChat: 'chat:open',
  closeChat: 'chat:close',
  showSpeechBubble: 'chat:show-speech',
  dismissSpeechBubble: 'chat:dismiss-speech',
  sendChatMessage: 'chat:send-message'
} as const
