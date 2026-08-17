export const IPC_CHANNELS = {
  getAppVersion: 'app:get-version',
  getActiveCharacter: 'characters:get-active',
  petDragStateChanged: 'pet:drag-state-changed',
  petMovementCommand: 'pet:movement-command',
  petMovementEdgeReached: 'pet:movement-edge-reached',
  petMovementStateChanged: 'pet:movement-state-changed',
  petPointerDragStart: 'pet:pointer-drag-start',
  petPointerDragMove: 'pet:pointer-drag-move',
  petPointerDragEnd: 'pet:pointer-drag-end'
} as const
