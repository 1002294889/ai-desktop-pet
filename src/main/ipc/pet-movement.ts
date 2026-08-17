import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'

import { isPetMovementDirection } from '../../shared/pet-movement'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { DesktopMovementController } from '../windows/DesktopMovementController'

export function registerPetMovementHandlers(
  window: BrowserWindow,
  movementController: DesktopMovementController
): () => void {
  const handleMovementCommand = (event: IpcMainEvent, direction: unknown): void => {
    if (event.sender !== window.webContents || !isPetMovementDirection(direction)) {
      return
    }

    movementController.setDirection(direction)
  }

  ipcMain.on(IPC_CHANNELS.petMovementCommand, handleMovementCommand)

  return () => {
    ipcMain.removeListener(IPC_CHANNELS.petMovementCommand, handleMovementCommand)
  }
}
