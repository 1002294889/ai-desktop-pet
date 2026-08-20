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
import { MemoryManager } from './memory/MemoryManager'
import {
  configureDevelopmentMemoryTest,
  runDevelopmentMemoryProbe
} from './memory/development-memory-probe'
import {
  getLongTermMemoryProbeMode,
  runLongTermMemoryProbe
} from './memory/development-long-term-memory-probe'
import {
  getMemoryManagementProbeMode,
  runMemoryManagementProbe
} from './memory/development-memory-management-probe'
import { MemoryManagerError } from './memory/memory-manager-error'
import { createPetWindow } from './windows/pet-window'

registerCharacterProtocolScheme()

let memoryManager: MemoryManager | undefined

async function startApplication(): Promise<void> {
  const developmentMemoryTestMode = configureDevelopmentMemoryTest(app)

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
  const databasePath = join(app.getPath('userData'), 'pet-memory.db')

  await characterManager.initialize()
  memoryManager = new MemoryManager({ databasePath })
  memoryManager.initialize()

  if (developmentMemoryTestMode) {
    runDevelopmentMemoryProbe(memoryManager, developmentMemoryTestMode)
  }

  const memoryManagementProbeMode = app.isPackaged
    ? undefined
    : getMemoryManagementProbeMode()

  if (memoryManagementProbeMode) {
    await runMemoryManagementProbe(memoryManagementProbeMode, memoryManager)
  }

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
    console.info(`[MemoryManager] Local database ready: ${databasePath}`)
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
  const longTermMemoryProbeMode = app.isPackaged
    ? undefined
    : getLongTermMemoryProbeMode()

  if (longTermMemoryProbeMode) {
    await runLongTermMemoryProbe(longTermMemoryProbeMode, {
      characterName,
      providerSelection: aiProvider,
      memoryManager: requireMemoryManager()
    })
  }

  const createMainWindow = (): void => {
    createPetWindow({
      characterName,
      aiProvider,
      memoryManager: requireMemoryManager(),
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
  if (error instanceof MemoryManagerError) {
    console.error('Failed to start AI Desktop Pet memory storage.', { code: error.code })
  } else {
    console.error('Failed to start AI Desktop Pet', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : 'Unknown startup error'
    })
  }

  app.quit()
})

app.on('will-quit', () => {
  try {
    memoryManager?.close()
  } catch (error: unknown) {
    console.error('[MemoryManager] Failed to close local storage.', {
      code: error instanceof MemoryManagerError ? error.code : 'unexpected-error'
    })
  } finally {
    memoryManager = undefined
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function requireMemoryManager(): MemoryManager {
  if (!memoryManager) {
    throw new MemoryManagerError('not-initialized')
  }

  return memoryManager
}
