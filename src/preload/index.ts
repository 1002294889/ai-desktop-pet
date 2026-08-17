import { contextBridge, ipcRenderer } from 'electron'

import type { LoadedCharacter } from '../shared/character'
import type { DesktopApi } from '../shared/desktop-api'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  isPetMovementDirection,
  isPetMovementEdge,
  isPetMovementSnapshot
} from '../shared/pet-movement'

const desktopApi: DesktopApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion) as Promise<string>,
  getActiveCharacter: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getActiveCharacter) as Promise<LoadedCharacter>,
  onPetDragStateChange: (listener) => {
    const handleDragStateChange = (_event: Electron.IpcRendererEvent, isDragging: unknown): void => {
      if (typeof isDragging === 'boolean') {
        listener(isDragging)
      }
    }

    ipcRenderer.on(IPC_CHANNELS.petDragStateChanged, handleDragStateChange)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.petDragStateChanged, handleDragStateChange)
    }
  },
  setPetMovement: (direction) => {
    if (isPetMovementDirection(direction)) {
      ipcRenderer.send(IPC_CHANNELS.petMovementCommand, direction)
    }
  },
  onPetMovementEdge: (listener) => {
    const handleMovementEdge = (_event: Electron.IpcRendererEvent, edge: unknown): void => {
      if (isPetMovementEdge(edge)) {
        listener(edge)
      }
    }

    ipcRenderer.on(IPC_CHANNELS.petMovementEdgeReached, handleMovementEdge)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.petMovementEdgeReached, handleMovementEdge)
    }
  },
  onPetMovementStateChange: (listener) => {
    const handleMovementState = (_event: Electron.IpcRendererEvent, snapshot: unknown): void => {
      if (isPetMovementSnapshot(snapshot)) {
        listener(snapshot)
      }
    }

    ipcRenderer.on(IPC_CHANNELS.petMovementStateChanged, handleMovementState)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.petMovementStateChanged, handleMovementState)
    }
  }
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
