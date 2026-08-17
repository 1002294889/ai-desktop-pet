import { join } from 'node:path'

import { app, BrowserWindow } from 'electron'

import { loadAIConfiguration } from './ai/config'
import { createAIProvider } from './ai/provider-factory'
import { CharacterManager } from './characters/character-manager'
import {
  registerCharacterAssetProtocol,
  registerCharacterProtocolScheme
} from './characters/character-protocol'
import { loadDevelopmentEnvironment } from './config/development-environment'
import { registerAppInfoHandlers } from './ipc/app-info'
import { registerCharacterHandlers } from './ipc/characters'
import { createPetWindow } from './windows/pet-window'

registerCharacterProtocolScheme()

async function startApplication(): Promise<void> {
  await app.whenReady()

  const developmentEnvironment = app.isPackaged
    ? { loaded: false }
    : loadDevelopmentEnvironment(app.getAppPath())

  const charactersDirectory = app.isPackaged
    ? join(process.resourcesPath, 'characters')
    : join(app.getAppPath(), 'characters')
  const characterManager = new CharacterManager({
    charactersDirectory,
    preferredCharacterId: process.env.DESKTOP_PET_CHARACTER_ID
  })

  await characterManager.initialize()
  const aiConfiguration = loadAIConfiguration()
  const aiProvider = createAIProvider(aiConfiguration)
  registerCharacterAssetProtocol(characterManager)
  registerAppInfoHandlers()
  registerCharacterHandlers(characterManager)

  if (!app.isPackaged) {
    const activeCharacter = characterManager.getActiveCharacter()

    if (developmentEnvironment.warning) {
      console.warn(`[Environment] ${developmentEnvironment.warning}`)
    } else if (developmentEnvironment.loaded) {
      console.info('[Environment] Loaded local development settings from .env.local.')
    }

    console.info(
      `[CharacterManager] Loaded active character: ${activeCharacter.manifest.name} (${activeCharacter.manifest.id})`
    )
    for (const warning of aiConfiguration.warnings) {
      console.warn(`[AIConfiguration] ${warning}`)
    }
    console.info(
      aiProvider.fallbackReason === 'missing-api-key'
        ? '[AIProvider] DeepSeek requested but no API key is configured; using local fallback.'
        : `[AIProvider] Active provider: ${aiProvider.info.activeProvider}${aiProvider.info.model ? ` (${aiProvider.info.model})` : ''}`
    )
  }

  const characterName = characterManager.getActiveCharacter().manifest.name

  const createMainWindow = (): void => {
    createPetWindow({
      characterName,
      aiProvider,
      reportProviderErrors: !app.isPackaged
    })
  }

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
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
