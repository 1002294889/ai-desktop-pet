import { join } from 'node:path'

import { BrowserWindow, screen, type Size, type WebContents } from 'electron'

import type { ChatController } from '../chat/ChatController'
import type { ChatMode, ChatState } from '../../shared/chat'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { calculateChatWindowPosition } from './chat-window-position'

const CHAT_WINDOW_SIZES: Record<Exclude<ChatMode, 'hidden'>, Size> = {
  speech: { width: 320, height: 150 },
  chat: { width: 390, height: 300 }
}

export class ChatWindowController {
  private window: BrowserWindow | undefined
  private isRendererReady = false
  private isDisposed = false
  private lastVisibleMode: ChatMode = 'hidden'
  private readonly unsubscribeFromChat: () => void

  constructor(
    private readonly petWindow: BrowserWindow,
    private readonly chatController: ChatController
  ) {
    this.unsubscribeFromChat = chatController.subscribe((state) => this.syncToState(state))
    petWindow.on('move', this.handlePetMove)
    screen.on('display-metrics-changed', this.handleDisplayChange)
    screen.on('display-removed', this.handleDisplayChange)
  }

  getWebContents(): WebContents | undefined {
    return this.window?.webContents
  }

  syncToState(state: ChatState): void {
    this.sendStateToPet(state)

    if (this.window && !this.window.isDestroyed()) {
      this.window.setTitle(`${state.characterName} Chat`)
    }

    if (state.mode === 'hidden') {
      this.window?.hide()
      this.lastVisibleMode = 'hidden'
      return
    }

    const window = this.ensureWindow()
    const size = CHAT_WINDOW_SIZES[state.mode]
    const modeChanged = this.lastVisibleMode !== state.mode

    window.setSize(size.width, size.height, false)
    this.positionWindow(size)

    if (this.isRendererReady) {
      window.webContents.send(IPC_CHANNELS.chatStateChanged, this.chatController.getSnapshot())

      if (state.mode === 'chat') {
        if (modeChanged || !window.isVisible()) {
          window.show()
        }

        window.focus()
      } else if (!window.isVisible() || modeChanged) {
        window.showInactive()
      }
    }

    this.lastVisibleMode = state.mode
  }

  dispose(): void {
    if (this.isDisposed) {
      return
    }

    this.isDisposed = true
    this.unsubscribeFromChat()
    this.petWindow.off('move', this.handlePetMove)
    screen.off('display-metrics-changed', this.handleDisplayChange)
    screen.off('display-removed', this.handleDisplayChange)

    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }

    this.window = undefined
    this.isRendererReady = false
  }

  private readonly handlePetMove = (): void => {
    const mode = this.chatController.getSnapshot().mode

    if (mode !== 'hidden') {
      this.positionWindow(CHAT_WINDOW_SIZES[mode])
    }
  }

  private readonly handleDisplayChange = (): void => this.handlePetMove()

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const initialSize = CHAT_WINDOW_SIZES.speech
    const window = new BrowserWindow({
      width: initialSize.width,
      height: initialSize.height,
      useContentSize: true,
      show: false,
      title: `${this.chatController.getSnapshot().characterName} Chat`,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
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

    this.window = window
    this.isRendererReady = false

    window.webContents.on('did-finish-load', () => {
      if (window.isDestroyed()) {
        return
      }

      this.isRendererReady = true
      this.syncToState(this.chatController.getSnapshot())
    })
    window.once('closed', () => {
      this.window = undefined
      this.isRendererReady = false

      if (!this.isDisposed) {
        this.chatController.closeChat()
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
      rendererUrl.searchParams.set('view', 'chat')
      void window.loadURL(rendererUrl.toString())
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { view: 'chat' }
      })
    }

    return window
  }

  private positionWindow(size: Size): void {
    if (!this.window || this.window.isDestroyed() || this.petWindow.isDestroyed()) {
      return
    }

    const petBounds = this.petWindow.getBounds()
    const display = screen.getDisplayMatching(petBounds)
    const position = calculateChatWindowPosition(petBounds, size, display.workArea)

    this.chatController.setPlacement(position.placement)
    this.window.setPosition(position.point.x, position.point.y, false)
  }

  private sendStateToPet(state: ChatState): void {
    if (!this.petWindow.isDestroyed()) {
      this.petWindow.webContents.send(IPC_CHANNELS.chatStateChanged, state)
    }
  }
}
