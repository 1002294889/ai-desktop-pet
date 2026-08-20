import { contextBridge, ipcRenderer } from 'electron'

import { isAIPetActionSequence } from '../shared/ai-pet-action'
import type { LoadedCharacter } from '../shared/character'
import { isChatSendResult, isChatState } from '../shared/chat'
import type { DesktopApi } from '../shared/desktop-api'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  isClearMemoryResult,
  isDeleteMemoryItemResult,
  isManagedMemory,
  isManagedProfileEntry,
  isMemoryOverview,
  isMemoryOverviewQuery,
  isMemorySettings,
  isUpdateManagedMemoryInput,
  isUpdateManagedProfileInput
} from '../shared/memory-management'
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
  onChatPetActions: (listener) => {
    const handlePetActions = (_event: Electron.IpcRendererEvent, actions: unknown): void => {
      if (isAIPetActionSequence(actions)) {
        listener(actions)
      }
    }

    ipcRenderer.on(IPC_CHANNELS.chatPetActions, handlePetActions)

    return () => ipcRenderer.removeListener(IPC_CHANNELS.chatPetActions, handlePetActions)
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
  },
  openMemorySettings: () => ipcRenderer.send(IPC_CHANNELS.openMemorySettings),
  getMemoryOverview: async (query) => {
    if (!isMemoryOverviewQuery(query)) {
      throw new Error('Invalid memory overview query')
    }

    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.getMemoryOverview, query)

    if (!isMemoryOverview(result)) {
      throw new Error('Main process returned an invalid memory overview')
    }

    return result
  },
  updateMemoryProfile: async (input) => {
    if (!isUpdateManagedProfileInput(input)) {
      throw new Error('Invalid profile update')
    }

    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.updateMemoryProfile, input)

    if (!isManagedProfileEntry(result)) {
      throw new Error('Main process returned an invalid profile entry')
    }

    return result
  },
  deleteMemoryProfile: async (key) => {
    if (typeof key !== 'string') {
      throw new Error('Invalid profile key')
    }

    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.deleteMemoryProfile, key)

    if (!isDeleteMemoryItemResult(result)) {
      throw new Error('Main process returned an invalid profile deletion result')
    }

    return result
  },
  updateManagedMemory: async (input) => {
    if (!isUpdateManagedMemoryInput(input)) {
      throw new Error('Invalid memory update')
    }

    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.updateManagedMemory, input)

    if (result !== null && !isManagedMemory(result)) {
      throw new Error('Main process returned an invalid memory entry')
    }

    return result
  },
  deleteManagedMemory: async (id) => {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid memory id')
    }

    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.deleteManagedMemory, id)

    if (!isDeleteMemoryItemResult(result)) {
      throw new Error('Main process returned an invalid memory deletion result')
    }

    return result
  },
  setLongTermMemoryEnabled: async (enabled) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid memory setting')
    }

    const result: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.setLongTermMemoryEnabled,
      enabled
    )

    if (!isMemorySettings(result)) {
      throw new Error('Main process returned invalid memory settings')
    }

    return result
  },
  clearConversationHistory: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.clearConversationHistory)

    if (!isClearMemoryResult(result)) {
      throw new Error('Main process returned an invalid clear result')
    }

    return result
  },
  clearLongTermMemory: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.clearLongTermMemory)

    if (!isClearMemoryResult(result)) {
      throw new Error('Main process returned an invalid clear result')
    }

    return result
  },
  clearAllMemory: async () => {
    const result: unknown = await ipcRenderer.invoke(IPC_CHANNELS.clearAllMemory)

    if (!isClearMemoryResult(result)) {
      throw new Error('Main process returned an invalid clear result')
    }

    return result
  }
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
