import { join } from 'node:path'

import { BrowserWindow, type WebContents } from 'electron'

export class MemoryWindowController {
  private window: BrowserWindow | undefined

  open(): void {
    const window = this.ensureWindow()

    if (window.isMinimized()) {
      window.restore()
    }

    window.show()
    window.focus()
  }

  getWebContents(): WebContents | undefined {
    return this.window?.webContents
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }

    this.window = undefined
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    const window = new BrowserWindow({
      width: 760,
      height: 700,
      minWidth: 620,
      minHeight: 560,
      useContentSize: true,
      show: false,
      title: 'Memory & Privacy — AI Desktop Pet',
      backgroundColor: '#f7f5ff',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    this.window = window
    window.once('closed', () => {
      this.window = undefined
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
      rendererUrl.searchParams.set('view', 'memory')
      void window.loadURL(rendererUrl.toString())
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { view: 'memory' }
      })
    }

    return window
  }
}
