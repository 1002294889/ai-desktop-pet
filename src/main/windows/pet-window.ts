import { join } from 'node:path'

import { BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { AIProviderSelection } from '../ai/provider-factory'
import { AIProviderError } from '../ai/ai-provider-error'
import { ChatController } from '../chat/ChatController'
import { registerChatHandlers } from '../ipc/chat'
import { registerPetMovementHandlers } from '../ipc/pet-movement'
import { registerPetPointerDragHandlers } from '../ipc/pet-pointer-drag'
import { DesktopMovementController } from './DesktopMovementController'
import { ChatWindowController } from './ChatWindowController'
import { PetPointerDragController } from './PetPointerDragController'
import { attachPetDragEvents } from './pet-drag-events'
import { attachWindowBoundsGuard, getInitialWindowPosition } from './window-bounds'

const PET_WINDOW_SIZE = 300

export interface CreatePetWindowOptions {
  characterName: string
  aiProvider: AIProviderSelection
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
  const chatController = new ChatController({
    characterName: options.characterName,
    provider: options.aiProvider.provider,
    providerInfo: options.aiProvider.info,
    onProviderError: options.reportProviderErrors ? logProviderError : undefined
  })
  const chatWindowController = new ChatWindowController(window, chatController)
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
  const unsubscribeFromChatReactions = chatController.subscribeToPetReactions((action) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.chatPetReaction, action)
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
    unsubscribeFromChatReactions()
    chatWindowController.dispose()
    chatController.dispose()
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
