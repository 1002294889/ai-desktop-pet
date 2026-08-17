export const IPC_CHANNELS = {
  getAppVersion: 'app:get-version',
  getActiveCharacter: 'characters:get-active',
  petDragStateChanged: 'pet:drag-state-changed',
  petMovementCommand: 'pet:movement-command',
  petMovementEdgeReached: 'pet:movement-edge-reached',
  petMovementStateChanged: 'pet:movement-state-changed'
} as const
