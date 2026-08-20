import { join } from 'node:path'

import { BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { AIProviderSelection } from '../ai/provider-factory'
import { AIProviderError } from '../ai/ai-provider-error'
import {
  ChatController,
  type ChatPersistenceErrorDiagnostics,
  type ChatProviderReplyDiagnostics
} from '../chat/ChatController'
import { createCompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import { registerChatHandlers } from '../ipc/chat'
import { registerCompanionStateHandlers } from '../ipc/companion-state'
import { registerMemoryHandlers } from '../ipc/memory'
import { registerPetMovementHandlers } from '../ipc/pet-movement'
import { registerPetPointerDragHandlers } from '../ipc/pet-pointer-drag'
import {
  createLongTermMemoryCoordinator,
  type LongTermMemoryDiagnostics
} from '../memory/LongTermMemoryCoordinator'
import type { MemoryManager } from '../memory/MemoryManager'
import { MemoryManagerError } from '../memory/memory-manager-error'
import { MemoryService } from '../memory/MemoryService'
import { DesktopMovementController } from './DesktopMovementController'
import { ChatWindowController } from './ChatWindowController'
import { MemoryWindowController } from './MemoryWindowController'
import { PetPointerDragController } from './PetPointerDragController'
import { attachPetDragEvents } from './pet-drag-events'
import { attachWindowBoundsGuard, getInitialWindowPosition } from './window-bounds'

const PET_WINDOW_SIZE = 300

export interface CreatePetWindowOptions {
  characterName: string
  aiProvider: AIProviderSelection
  memoryManager: MemoryManager
  reportProviderErrors: boolean
}

export function createPetWindow(options: CreatePetWindowOptions): BrowserWindow {
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
    alwaysOnTop: true,
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
  const longTermMemory = createLongTermMemoryCoordinator(
    options.aiProvider.provider,
    options.memoryManager
  )
  const companionState = createCompanionStateCoordinator(options.memoryManager)
  const memoryService = new MemoryService(
    options.memoryManager,
    longTermMemory,
    companionState
  )
  const chatController = new ChatController({
    characterName: options.characterName,
    provider: options.aiProvider.provider,
    providerInfo: options.aiProvider.info,
    memoryManager: options.memoryManager,
    longTermMemory,
    companionState,
    onProviderError: options.reportProviderErrors ? logProviderError : undefined,
    onProviderReply: options.reportProviderErrors ? logProviderReply : undefined,
    onMemoryDiagnostics: options.reportProviderErrors ? logMemoryDiagnostics : undefined,
    onPersistenceError: logPersistenceError
  })
  const chatWindowController = new ChatWindowController(window, chatController)
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
    memoryService
  )
  const unregisterCompanionStateHandlers = registerCompanionStateHandlers(
    window,
    memoryWindowController,
    companionState
  )
  const unsubscribeFromChatActions = chatController.subscribeToPetActions((actions) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.chatPetActions, actions)
    }
  })

  attachPetDragEvents(window, {
    onDragStart: () => movementController.stop(),
    shouldIgnoreMove: () => movementController.wasRecentProgrammaticMove()
  })
  attachWindowBoundsGuard(window)
  window.once('closed', () => {
    unregisterMovementHandlers()
    unregisterPointerDragHandlers()
    unregisterChatHandlers()
    unregisterMemoryHandlers()
    unregisterCompanionStateHandlers()
    unsubscribeFromChatActions()
    chatWindowController.dispose()
    memoryWindowController.dispose()
    chatController.dispose()
    companionState.dispose()
    pointerDragController.dispose()
    movementController.dispose()
  })
  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

function logProviderReply(diagnostics: ChatProviderReplyDiagnostics): void {
  console.info('[AIProvider] Reply received', diagnostics)
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
