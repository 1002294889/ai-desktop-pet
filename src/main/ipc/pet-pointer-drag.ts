import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { isPetPointerPosition } from '../../shared/pet-pointer-drag'
import type { PetPointerDragController } from '../windows/PetPointerDragController'

export function registerPetPointerDragHandlers(
  window: BrowserWindow,
  pointerDragController: PetPointerDragController
): () => void {
  const isExpectedSender = (event: IpcMainEvent): boolean => event.sender === window.webContents

  const handleStart = (event: IpcMainEvent, position: unknown): void => {
    if (isExpectedSender(event) && isPetPointerPosition(position)) {
      pointerDragController.start(position)
    }
  }

  const handleMove = (event: IpcMainEvent, position: unknown): void => {
    if (isExpectedSender(event) && isPetPointerPosition(position)) {
      pointerDragController.move(position)
    }
  }

  const handleEnd = (event: IpcMainEvent): void => {
    if (isExpectedSender(event)) {
      pointerDragController.end()
    }
  }

  ipcMain.on(IPC_CHANNELS.petPointerDragStart, handleStart)
  ipcMain.on(IPC_CHANNELS.petPointerDragMove, handleMove)
  ipcMain.on(IPC_CHANNELS.petPointerDragEnd, handleEnd)

  return () => {
    ipcMain.removeListener(IPC_CHANNELS.petPointerDragStart, handleStart)
    ipcMain.removeListener(IPC_CHANNELS.petPointerDragMove, handleMove)
    ipcMain.removeListener(IPC_CHANNELS.petPointerDragEnd, handleEnd)
  }
}
