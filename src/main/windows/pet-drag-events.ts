import type { BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-channels'

const DRAG_END_SETTLE_DELAY_MS = 180

export function attachPetDragEvents(window: BrowserWindow): void {
  let isDragging = false
  let dragEndTimer: NodeJS.Timeout | undefined

  const notifyRenderer = (nextIsDragging: boolean): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.petDragStateChanged, nextIsDragging)
    }
  }

  const scheduleDragEnd = (): void => {
    if (dragEndTimer) {
      clearTimeout(dragEndTimer)
    }

    dragEndTimer = setTimeout(() => {
      if (isDragging) {
        isDragging = false
        notifyRenderer(false)
      }
    }, DRAG_END_SETTLE_DELAY_MS)
  }

  const startDrag = (): void => {
    if (!isDragging) {
      isDragging = true
      notifyRenderer(true)
    }

    scheduleDragEnd()
  }

  const trackMove = (): void => {
    if (!isDragging) {
      startDrag()
      return
    }

    if (isDragging) {
      scheduleDragEnd()
    }
  }

  window.on('will-move', startDrag)
  window.on('move', trackMove)

  window.once('closed', () => {
    if (dragEndTimer) {
      clearTimeout(dragEndTimer)
    }
  })
}
