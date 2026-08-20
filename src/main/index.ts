import { join } from 'node:path'

import { app } from 'electron'

import { loadAIConfiguration } from './ai/config'
import { createAIProvider } from './ai/provider-factory'
import { CharacterManager } from './characters/character-manager'
import {
  getCharacterManagementProbeMode,
  runCharacterManagementProbe
} from './characters/development-character-management-probe'
import {
  registerCharacterAssetProtocol,
  registerCharacterProtocolScheme
} from './characters/character-protocol'
import { loadDevelopmentEnvironment } from './config/development-environment'
import { createCompanionStateCoordinator } from './companion/CompanionStateCoordinator'
import type { CompanionStateCoordinator } from './companion/CompanionStateCoordinator'
import {
  getCompanionProbeMode,
  runCompanionProbe
} from './companion/development-companion-probe'
import {
  getConversationPacingProbeMode,
  runConversationPacingProbe
} from './chat/development-conversation-pacing-probe'
import { registerAppInfoHandlers } from './ipc/app-info'
import { registerSettingsHandlers } from './ipc/settings'
import { createLongTermMemoryCoordinator } from './memory/LongTermMemoryCoordinator'
import { MemoryManager } from './memory/MemoryManager'
import { MemoryService } from './memory/MemoryService'
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
import { ApplicationSettingsService } from './settings/ApplicationSettingsService'
import { ElectronLoginItemController } from './settings/LoginItemController'
import { SettingsManager } from './settings/SettingsManager'
import {
  getSettingsProbeMode,
  runSettingsProbe
} from './settings/development-settings-probe'
import { ApplicationTrayController } from './tray/ApplicationTrayController'
import {
  createPetWindow,
  type DesktopPetRuntime
} from './windows/pet-window'
import { SettingsWindowController } from './windows/SettingsWindowController'
import { IPC_CHANNELS } from '../shared/ipc-channels'

registerCharacterProtocolScheme()
app.setName('AI Desktop Pet')

let memoryManager: MemoryManager | undefined
let settingsManager: SettingsManager | undefined
let settingsService: ApplicationSettingsService | undefined
let companionState: CompanionStateCoordinator | undefined
let petRuntime: DesktopPetRuntime | undefined
let settingsWindowController: SettingsWindowController | undefined
let trayController: ApplicationTrayController | undefined
let unregisterSettingsHandlers: (() => void) | undefined
let unsubscribeFromSettings: (() => void) | undefined
let isShuttingDown = false

async function startApplication(): Promise<void> {
  const developmentMemoryTestMode = configureDevelopmentMemoryTest(app)

  await app.whenReady()

  const developmentEnvironment = app.isPackaged
    ? { loaded: false }
    : loadDevelopmentEnvironment(app.getAppPath())

  settingsManager = new SettingsManager({
    settingsFilePath: join(app.getPath('userData'), 'app-settings.json'),
    loginItems: new ElectronLoginItemController(app)
  })
  await settingsManager.initialize()
  const settingsProbeMode = app.isPackaged ? undefined : getSettingsProbeMode()

  const databasePath = join(app.getPath('userData'), 'pet-memory.db')

  memoryManager = new MemoryManager({ databasePath })
  memoryManager.initialize()

  const builtInCharactersDirectory = app.isPackaged
    ? join(process.resourcesPath, 'characters')
    : join(app.getAppPath(), 'characters')
  const characterManager = new CharacterManager({
    builtInCharactersDirectory,
    userCharactersDirectory: join(app.getPath('userData'), 'characters'),
    settingsFilePath: join(app.getPath('userData'), 'character-settings.json'),
    defaultCharacterId: 'default',
    preferredCharacterId: process.env.DESKTOP_PET_CHARACTER_ID
  })

  await characterManager.initialize()

  const characterManagementProbeMode = app.isPackaged
    ? undefined
    : getCharacterManagementProbeMode()

  if (characterManagementProbeMode) {
    await runCharacterManagementProbe(characterManagementProbeMode, {
      characterManager,
      repositoryRoot: app.getAppPath(),
      userCharactersDirectory: join(app.getPath('userData'), 'characters')
    })
  }

  if (developmentMemoryTestMode) {
    runDevelopmentMemoryProbe(memoryManager, developmentMemoryTestMode)
  }

  const memoryManagementProbeMode = app.isPackaged
    ? undefined
    : getMemoryManagementProbeMode()

  if (memoryManagementProbeMode) {
    await runMemoryManagementProbe(memoryManagementProbeMode, memoryManager)
  }

  const companionProbeMode = app.isPackaged ? undefined : getCompanionProbeMode()

  if (companionProbeMode) {
    runCompanionProbe(companionProbeMode, memoryManager)
  }

  const conversationPacingProbeMode = app.isPackaged
    ? undefined
    : getConversationPacingProbeMode()
  const longTermMemoryProbeMode = app.isPackaged
    ? undefined
    : getLongTermMemoryProbeMode()

  if (conversationPacingProbeMode === 'exercise') {
    await runConversationPacingProbe(conversationPacingProbeMode, memoryManager)
  }

  if (
    !app.isPackaged &&
    process.env.DESKTOP_PET_PROBE_ONLY === '1' &&
    conversationPacingProbeMode !== 'deepseek' &&
    longTermMemoryProbeMode === undefined &&
    settingsProbeMode === undefined
  ) {
    app.quit()
    return
  }

  const aiConfiguration = loadAIConfiguration()
  const aiProvider = createAIProvider(aiConfiguration)
  registerCharacterAssetProtocol(characterManager)
  registerAppInfoHandlers()

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
    console.info(
      `[CharacterManager] User character storage: ${join(app.getPath('userData'), 'characters')}`
    )
    for (const warning of characterManager.getWarnings()) {
      console.warn(`[CharacterManager] ${warning}`)
    }
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

  if (conversationPacingProbeMode === 'deepseek') {
    await runConversationPacingProbe(
      conversationPacingProbeMode,
      memoryManager,
      aiProvider.provider
    )

    if (process.env.DESKTOP_PET_PROBE_ONLY === '1') {
      app.quit()
      return
    }
  }

  const characterName = characterManager.getActiveCharacter().manifest.name

  if (longTermMemoryProbeMode) {
    await runLongTermMemoryProbe(longTermMemoryProbeMode, {
      characterName,
      providerSelection: aiProvider,
      memoryManager: requireMemoryManager()
    })

    if (process.env.DESKTOP_PET_PROBE_ONLY === '1') {
      app.quit()
      return
    }
  }

  const longTermMemory = createLongTermMemoryCoordinator(
    aiProvider.provider,
    requireMemoryManager()
  )
  companionState = createCompanionStateCoordinator(requireMemoryManager())
  const memoryService = new MemoryService(
    requireMemoryManager(),
    longTermMemory,
    companionState
  )

  requireSettingsManager().bindLongTermMemory({
    getEnabled: () => memoryService.getSettings().longTermMemoryEnabled,
    setEnabled: (enabled) =>
      memoryService.setLongTermMemoryEnabled(enabled).longTermMemoryEnabled
  })

  settingsService = new ApplicationSettingsService({
    settingsManager: requireSettingsManager(),
    characterManager,
    aiProvider,
    configuredModel: aiConfiguration.deepSeek.model,
    applicationVersion: app.getVersion()
  })
  settingsWindowController = new SettingsWindowController()
  petRuntime = createPetWindow({
    characterManager,
    aiProvider,
    memoryManager: requireMemoryManager(),
    longTermMemory,
    companionState,
    memoryService,
    settingsManager: requireSettingsManager(),
    initialSettings: requireSettingsService().getOverview(),
    reportProviderErrors: !app.isPackaged,
    onPetVisibilityRequested: async (visible) => {
      await requireSettingsService().update({ key: 'petVisible', value: visible })
    },
    openSettings: () => settingsWindowController?.open(),
    onQuitRequested: requestApplicationQuit
  })
  unregisterSettingsHandlers = registerSettingsHandlers({
    settingsService: requireSettingsService(),
    settingsWindowController,
    petRuntime
  })
  unsubscribeFromSettings = requireSettingsService().subscribe((overview) => {
    petRuntime?.notifySettingsChanged(overview)

    const settingsWebContents = settingsWindowController?.getWebContents()

    if (settingsWebContents && !settingsWebContents.isDestroyed()) {
      settingsWebContents.send(IPC_CHANNELS.appSettingsChanged, overview)
    }
  })
  trayController = new ApplicationTrayController(requireSettingsService(), {
    openChat: () => petRuntime?.openChat(),
    openCharacters: () => petRuntime?.openCharacterManager(),
    openMemory: () => petRuntime?.openMemoryManager(),
    openSettings: () => settingsWindowController?.open(),
    quit: requestApplicationQuit
  })

  if (settingsProbeMode) {
    await runSettingsProbe(settingsProbeMode, {
      settingsService: requireSettingsService(),
      memoryService,
      petRuntime,
      settingsWindowController,
      trayController,
      repositoryRoot: app.getAppPath(),
      settingsFilePath: join(app.getPath('userData'), 'app-settings.json')
    })

    if (process.env.DESKTOP_PET_PROBE_ONLY === '1') {
      app.quit()
      return
    }
  }

  app.on('activate', handleApplicationActivate)

  if (!app.isPackaged) {
    console.info(
      `[SettingsManager] Local settings ready: ${join(app.getPath('userData'), 'app-settings.json')}`
    )
    for (const warning of requireSettingsManager().getWarnings()) {
      console.warn(`[SettingsManager] ${warning}`)
    }
    console.info('[Tray] AI Desktop Pet menu is ready.')
  }
}

void startApplication().catch((error: unknown) => {
  const failedDevelopmentProbe =
    !app.isPackaged && process.env.DESKTOP_PET_PROBE_ONLY === '1'

  if (error instanceof MemoryManagerError) {
    console.error('Failed to start AI Desktop Pet memory storage.', { code: error.code })
  } else {
    console.error('Failed to start AI Desktop Pet', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : 'Unknown startup error'
    })
  }

  if (failedDevelopmentProbe) {
    app.exit(1)
    return
  }

  app.quit()
})

app.on('before-quit', () => {
  shutdownApplication()
})

app.on('will-quit', () => {
  shutdownApplication()
})

app.on('window-all-closed', () => {
  // The tray/menu-bar icon intentionally keeps the application alive.
})

function requestApplicationQuit(): void {
  isShuttingDown = true
  app.quit()
}

function shutdownApplication(): void {
  if (isShuttingDown && !memoryManager && !petRuntime) {
    return
  }

  isShuttingDown = true
  app.off('activate', handleApplicationActivate)
  unregisterSettingsHandlers?.()
  unregisterSettingsHandlers = undefined
  unsubscribeFromSettings?.()
  unsubscribeFromSettings = undefined
  trayController?.dispose()
  trayController = undefined
  settingsWindowController?.dispose()
  settingsWindowController = undefined
  petRuntime?.dispose()
  petRuntime = undefined
  settingsService?.dispose()
  settingsService = undefined
  settingsManager?.dispose()
  settingsManager = undefined
  companionState?.dispose()
  companionState = undefined

  try {
    memoryManager?.close()
  } catch (error: unknown) {
    console.error('[MemoryManager] Failed to close local storage.', {
      code: error instanceof MemoryManagerError ? error.code : 'unexpected-error'
    })
  } finally {
    memoryManager = undefined
  }
}

function handleApplicationActivate(): void {
  if (!isShuttingDown && settingsService) {
    void settingsService.update({ key: 'petVisible', value: true })
  }
}

function requireMemoryManager(): MemoryManager {
  if (!memoryManager) {
    throw new MemoryManagerError('not-initialized')
  }

  return memoryManager
}

function requireSettingsManager(): SettingsManager {
  if (!settingsManager) {
    throw new Error('SettingsManager is not initialized')
  }

  return settingsManager
}

function requireSettingsService(): ApplicationSettingsService {
  if (!settingsService) {
    throw new Error('ApplicationSettingsService is not initialized')
  }

  return settingsService
}
