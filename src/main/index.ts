import { join } from 'node:path'

import { app, BrowserWindow } from 'electron'

import { CharacterManager } from './characters/character-manager'
import {
  registerCharacterAssetProtocol,
  registerCharacterProtocolScheme
} from './characters/character-protocol'
import { registerAppInfoHandlers } from './ipc/app-info'
import { registerCharacterHandlers } from './ipc/characters'
import { createPetWindow } from './windows/pet-window'

registerCharacterProtocolScheme()

async function startApplication(): Promise<void> {
  await app.whenReady()

  const charactersDirectory = app.isPackaged
    ? join(process.resourcesPath, 'characters')
    : join(app.getAppPath(), 'characters')
  const characterManager = new CharacterManager({
    charactersDirectory,
    preferredCharacterId: process.env.DESKTOP_PET_CHARACTER_ID
  })

  await characterManager.initialize()
  registerCharacterAssetProtocol(characterManager)
  registerAppInfoHandlers()
  registerCharacterHandlers(characterManager)

  if (!app.isPackaged) {
    const activeCharacter = characterManager.getActiveCharacter()
    console.info(
      `[CharacterManager] Loaded active character: ${activeCharacter.manifest.name} (${activeCharacter.manifest.id})`
    )
  }

  const characterName = characterManager.getActiveCharacter().manifest.name

  createPetWindow({ characterName })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow({ characterName })
    }
  })
}

void startApplication().catch((error: unknown) => {
  console.error('Failed to start AI Desktop Pet', error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
