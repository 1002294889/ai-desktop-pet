import { contextBridge, ipcRenderer } from 'electron'

import type { LoadedCharacter } from '../shared/character'
import {
  isChatPetReaction,
  isChatSendResult,
  isChatState
} from '../shared/chat'
import type { DesktopApi } from '../shared/desktop-api'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  isPetMovementDirection,
  isPetMovementEdge,
  isPetMovementSnapshot
} from '../shared/pet-movement'
import { isPetPointerPosition } from '../shared/pet-pointer-drag'

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
  },
  startPetPointerDrag: (position) => {
    if (isPetPointerPosition(position)) {
      ipcRenderer.send(IPC_CHANNELS.petPointerDragStart, position)
    }
  },
  updatePetPointerDrag: (position) => {
    if (isPetPointerPosition(position)) {
      ipcRenderer.send(IPC_CHANNELS.petPointerDragMove, position)
    }
  },
  endPetPointerDrag: () => {
    ipcRenderer.send(IPC_CHANNELS.petPointerDragEnd)
  },
  getChatState: async () => {
    const state: unknown = await ipcRenderer.invoke(IPC_CHANNELS.getChatState)

    if (!isChatState(state)) {
      throw new Error('Main process returned an invalid chat state')
    }

    return state
  },
  onChatStateChange: (listener) => {
    const handleChatStateChange = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      if (isChatState(state)) {
        listener(state)
      }
    }

    ipcRenderer.on(IPC_CHANNELS.chatStateChanged, handleChatStateChange)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.chatStateChanged, handleChatStateChange)
  },
  onChatPetReaction: (listener) => {
    const handlePetReaction = (_event: Electron.IpcRendererEvent, action: unknown): void => {
      if (isChatPetReaction(action)) {
        listener(action)
      }
    }

    ipcRenderer.on(IPC_CHANNELS.chatPetReaction, handlePetReaction)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.chatPetReaction, handlePetReaction)
  },
  openChat: () => ipcRenderer.send(IPC_CHANNELS.openChat),
  closeChat: () => ipcRenderer.send(IPC_CHANNELS.closeChat),
  showSpeechBubble: () => ipcRenderer.send(IPC_CHANNELS.showSpeechBubble),
  dismissSpeechBubble: () => ipcRenderer.send(IPC_CHANNELS.dismissSpeechBubble),
  sendChatMessage: async (content) => {
    if (typeof content !== 'string') {
      return { accepted: false, reason: 'empty-message' }
    }

    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.sendChatMessage, content)

    if (!isChatSendResult(result)) {
      throw new Error('Main process returned an invalid chat send result')
    }

    return result
  }
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
