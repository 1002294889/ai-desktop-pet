import { ipcMain } from 'electron'

import type { CharacterManager } from '../characters/character-manager'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

export function registerCharacterHandlers(characterManager: CharacterManager): void {
  ipcMain.handle(IPC_CHANNELS.getActiveCharacter, () => characterManager.getActiveCharacter())
}
