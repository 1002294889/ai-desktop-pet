import { join } from 'node:path'

import { BrowserWindow, type Event, type WebContents } from 'electron'

import type { AppSettingsOverview } from '../../shared/app-settings'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { AIProviderSelection } from '../ai/provider-factory'
import { AIProviderError } from '../ai/ai-provider-error'
import type { CharacterManager } from '../characters/character-manager'
import {
  ChatController,
  type ChatPersistenceErrorDiagnostics,
  type ChatProviderReplyDiagnostics,
  type ReplyPlanCancellationDiagnostics
} from '../chat/ChatController'
import type { CompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import { registerChatHandlers } from '../ipc/chat'
import { registerCompanionStateHandlers } from '../ipc/companion-state'
import { registerCharacterHandlers } from '../ipc/characters'
import { registerMemoryHandlers } from '../ipc/memory'
import { registerPetMovementHandlers } from '../ipc/pet-movement'
import { registerPetPointerDragHandlers } from '../ipc/pet-pointer-drag'
import type {
  LongTermMemoryCoordinator,
  LongTermMemoryDiagnostics
} from '../memory/LongTermMemoryCoordinator'
import type { MemoryManager } from '../memory/MemoryManager'
import { MemoryManagerError } from '../memory/memory-manager-error'
import type { MemoryService } from '../memory/MemoryService'
import type { SettingsManager } from '../settings/SettingsManager'
import { DesktopMovementController } from './DesktopMovementController'
import { ChatWindowController } from './ChatWindowController'
import { CharacterWindowController } from './CharacterWindowController'
import { MemoryWindowController } from './MemoryWindowController'
import { PetPointerDragController } from './PetPointerDragController'
import { attachPetDragEvents } from './pet-drag-events'
import { attachWindowBoundsGuard, getInitialWindowPosition } from './window-bounds'

const PET_WINDOW_SIZE = 300

export interface CreatePetWindowOptions {
  characterManager: CharacterManager
  aiProvider: AIProviderSelection
  memoryManager: MemoryManager
  longTermMemory: LongTermMemoryCoordinator
  companionState: CompanionStateCoordinator
  memoryService: MemoryService
  settingsManager: SettingsManager
  initialSettings: AppSettingsOverview
  reportProviderErrors: boolean
  onPetVisibilityRequested: (visible: boolean) => Promise<void>
}

export interface DesktopPetRuntime {
  getPetWindow: () => BrowserWindow
  getTrustedWebContents: () => WebContents[]
  openChat: () => void
  openCharacterManager: () => void
  openMemoryManager: () => void
  notifySettingsChanged: (overview: AppSettingsOverview) => void
  dispose: () => void
}

export function createPetWindow(options: CreatePetWindowOptions): DesktopPetRuntime {
  const initialCharacter = options.characterManager.getActiveCharacter()
  const initialPosition = getInitialWindowPosition({
    width: PET_WINDOW_SIZE,
    height: PET_WINDOW_SIZE
  })

  const window = new BrowserWindow({
    ...initialPosition,
    width: PET_WINDOW_SIZE,
    height: PET_WINDOW_SIZE,
    useContentSize: true,
    show: false,
    title: 'AI Desktop Pet',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: options.initialSettings.settings.alwaysOnTop,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const movementController = new DesktopMovementController(window)
  const pointerDragController = new PetPointerDragController(window, movementController)
  const chatController = new ChatController({
    characterName: initialCharacter.manifest.name,
    provider: options.aiProvider.provider,
    providerInfo: options.aiProvider.info,
    memoryManager: options.memoryManager,
    longTermMemory: options.longTermMemory,
    companionState: options.companionState,
    onProviderError: options.reportProviderErrors ? logProviderError : undefined,
    onProviderReply: options.reportProviderErrors ? logProviderReply : undefined,
    onReplyPlanCancelled: options.reportProviderErrors
      ? logReplyPlanCancellation
      : undefined,
    onMemoryDiagnostics: options.reportProviderErrors ? logMemoryDiagnostics : undefined,
    onPersistenceError: logPersistenceError
  })
  const chatWindowController = new ChatWindowController(window, chatController)
  const characterWindowController = new CharacterWindowController()
  const memoryWindowController = new MemoryWindowController()
  const unregisterMovementHandlers = registerPetMovementHandlers(window, movementController)
  const unregisterPointerDragHandlers = registerPetPointerDragHandlers(
    window,
    pointerDragController
  )
  const unregisterChatHandlers = registerChatHandlers(
    window,
    chatController,
    chatWindowController
  )
  const unregisterMemoryHandlers = registerMemoryHandlers(
    window,
    memoryWindowController,
    options.memoryService,
    options.settingsManager
  )
  const unregisterCompanionStateHandlers = registerCompanionStateHandlers(
    window,
    memoryWindowController,
    options.companionState
  )
  const unregisterCharacterHandlers = registerCharacterHandlers({
    petWindow: window,
    characterManager: options.characterManager,
    characterWindowController,
    onActiveCharacterChanged: (character) => {
      chatController.setCharacterName(character.manifest.name)
    }
  })
  const unsubscribeFromChatActions = chatController.subscribeToPetActions((actions) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.chatPetActions, actions)
    }
  })

  attachPetDragEvents(window, {
    onDragStart: () => movementController.stop(),
    shouldIgnoreMove: () => movementController.wasRecentProgrammaticMove()
  })
  let settingsOverview = options.initialSettings
  let isReadyToShow = false
  let allowWindowClose = false
  let isDisposed = false

  const cleanup = (): void => {
    if (isDisposed) {
      return
    }

    isDisposed = true
    unregisterMovementHandlers()
    unregisterPointerDragHandlers()
    unregisterChatHandlers()
    unregisterMemoryHandlers()
    unregisterCompanionStateHandlers()
    unregisterCharacterHandlers()
    unsubscribeFromChatActions()
    chatWindowController.dispose()
    characterWindowController.dispose()
    memoryWindowController.dispose()
    chatController.dispose()
    pointerDragController.dispose()
    movementController.dispose()
  }
  const handleClose = (event: Event): void => {
    if (allowWindowClose) {
      return
    }

    event.preventDefault()
    void options.onPetVisibilityRequested(false)
  }

  attachWindowBoundsGuard(window)
  window.on('close', handleClose)
  window.once('closed', cleanup)
  window.once('ready-to-show', () => {
    isReadyToShow = true
    applyWindowSettings(window, settingsOverview)
  })
  window.webContents.on('did-finish-load', () => {
    sendSettingsToWebContents(window.webContents, settingsOverview)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return {
    getPetWindow: () => window,
    getTrustedWebContents: () =>
      [
        window.webContents,
        chatWindowController.getWebContents(),
        memoryWindowController.getWebContents(),
        characterWindowController.getWebContents()
      ].filter((webContents): webContents is WebContents => webContents !== undefined),
    openChat: () => chatController.openChat(),
    openCharacterManager: () => characterWindowController.open(),
    openMemoryManager: () => memoryWindowController.open(),
    notifySettingsChanged: (overview) => {
      settingsOverview = overview
      applyWindowSettings(window, overview, isReadyToShow)

      for (const webContents of [
        window.webContents,
        chatWindowController.getWebContents(),
        memoryWindowController.getWebContents(),
        characterWindowController.getWebContents()
      ]) {
        if (webContents && !webContents.isDestroyed()) {
          sendSettingsToWebContents(webContents, overview)
        }
      }
    },
    dispose: () => {
      if (isDisposed) {
        return
      }

      allowWindowClose = true
      window.off('close', handleClose)
      cleanup()

      if (!window.isDestroyed()) {
        window.destroy()
      }
    }
  }
}

function applyWindowSettings(
  window: BrowserWindow,
  overview: AppSettingsOverview,
  isReadyToShow = true
): void {
  if (window.isDestroyed()) {
    return
  }

  window.setAlwaysOnTop(overview.settings.alwaysOnTop)

  if (!isReadyToShow) {
    return
  }

  if (overview.settings.petVisible) {
    if (!window.isVisible()) {
      window.showInactive()
    }
  } else if (window.isVisible()) {
    window.hide()
  }
}

function sendSettingsToWebContents(
  webContents: WebContents,
  overview: AppSettingsOverview
): void {
  if (!webContents.isDestroyed()) {
    webContents.send(IPC_CHANNELS.appSettingsChanged, overview)
  }
}

function logProviderReply(diagnostics: ChatProviderReplyDiagnostics): void {
  console.info('[AIProvider] Reply received', diagnostics)
}

function logReplyPlanCancellation(
  diagnostics: ReplyPlanCancellationDiagnostics
): void {
  console.info('[ChatPacing] Cancelled unspoken reply segments', diagnostics)
}

function logMemoryDiagnostics(diagnostics: LongTermMemoryDiagnostics): void {
  console.info('[LongTermMemory]', {
    candidateCount: diagnostics.candidateCount,
    acceptedCategories: diagnostics.acceptedCategories,
    rejectedCandidateCount: diagnostics.rejectedCandidateCount,
    rejectedReasons: diagnostics.rejectedReasons,
    profileValuesWritten: diagnostics.profileValuesWritten,
    memoriesCreated: diagnostics.memoriesCreated,
    memoriesDeduplicated: diagnostics.memoriesDeduplicated,
    retrievedProfileCount: diagnostics.retrievedProfileCount,
    retrievedMemoryCount: diagnostics.retrievedMemoryCount,
    unexpectedExtractorActionRequests: diagnostics.unexpectedExtractorActionRequests,
    extractionFailed: diagnostics.extractionFailed
  })
}

function logProviderError(error: unknown): void {
  if (error instanceof AIProviderError) {
    console.error('[AIProvider]', {
      code: error.code,
      status: error.status,
      detail: error.technicalMessage
    })
    return
  }

  console.error('[AIProvider] Unexpected provider failure', {
    name: error instanceof Error ? error.name : typeof error
  })
}

function logPersistenceError(diagnostics: ChatPersistenceErrorDiagnostics): void {
  console.error('[MemoryManager] Chat persistence failed.', {
    operation: diagnostics.operation,
    code:
      diagnostics.error instanceof MemoryManagerError
        ? diagnostics.error.code
        : 'unexpected-error'
  })
}
