import { join } from 'node:path'

import { BrowserWindow } from 'electron'

import { attachPetDragEvents } from './pet-drag-events'
import { attachWindowBoundsGuard, getInitialWindowPosition } from './window-bounds'

const PET_WINDOW_SIZE = 300

export function createPetWindow(): BrowserWindow {
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

  attachPetDragEvents(window)
  attachWindowBoundsGuard(window)
  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
