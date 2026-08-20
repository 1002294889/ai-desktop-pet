import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import {
  isMemoryOverviewQuery,
  isUpdateManagedMemoryInput,
  isUpdateManagedProfileInput
} from '../../shared/memory-management'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { MemoryService } from '../memory/MemoryService'
import { MemoryManagerError } from '../memory/memory-manager-error'
import type { SettingsManager } from '../settings/SettingsManager'
import type { MemoryWindowController } from '../windows/MemoryWindowController'

export function registerMemoryHandlers(
  petWindow: BrowserWindow,
  memoryWindowController: MemoryWindowController,
  memoryService: MemoryService,
  settingsManager: SettingsManager
): () => void {
  const assertMemoryWindowSender = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== memoryWindowController.getWebContents()) {
      throw new Error('Unauthorized memory IPC sender')
    }
  }
  const handleOpenSettings = (event: Electron.IpcMainEvent): void => {
    if (event.sender !== petWindow.webContents) {
      return
    }

    memoryWindowController.open()
  }
  const handleGetOverview = (event: IpcMainInvokeEvent, query: unknown) => {
    assertMemoryWindowSender(event)

    if (!isMemoryOverviewQuery(query)) {
      throw new MemoryManagerError('invalid-input')
    }

    return memoryService.getOverview(query)
  }
  const handleUpdateProfile = (event: IpcMainInvokeEvent, input: unknown) => {
    assertMemoryWindowSender(event)

    if (!isUpdateManagedProfileInput(input)) {
      throw new MemoryManagerError('invalid-input')
    }

    return memoryService.updateProfile(input)
  }
  const handleDeleteProfile = (event: IpcMainInvokeEvent, key: unknown) => {
    assertMemoryWindowSender(event)

    if (typeof key !== 'string') {
      throw new MemoryManagerError('invalid-input')
    }

    return { deleted: memoryService.deleteProfile(key) }
  }
  const handleUpdateMemory = (event: IpcMainInvokeEvent, input: unknown) => {
    assertMemoryWindowSender(event)

    if (!isUpdateManagedMemoryInput(input)) {
      throw new MemoryManagerError('invalid-input')
    }

    return memoryService.updateMemory(input)
  }
  const handleDeleteMemory = (event: IpcMainInvokeEvent, id: unknown) => {
    assertMemoryWindowSender(event)

    if (!Number.isSafeInteger(id) || (id as number) <= 0) {
      throw new MemoryManagerError('invalid-input')
    }

    return { deleted: memoryService.deleteMemory(id as number) }
  }
  const handleSetEnabled = async (event: IpcMainInvokeEvent, enabled: unknown) => {
    assertMemoryWindowSender(event)

    if (typeof enabled !== 'boolean') {
      throw new MemoryManagerError('invalid-input')
    }

    const settings = await settingsManager.setSetting(
      'longTermMemoryEnabled',
      enabled
    )

    return { longTermMemoryEnabled: settings.longTermMemoryEnabled }
  }
  const handleClearConversation = (event: IpcMainInvokeEvent) => {
    assertMemoryWindowSender(event)
    return memoryService.clearConversationHistory()
  }
  const handleClearLongTermMemory = (event: IpcMainInvokeEvent) => {
    assertMemoryWindowSender(event)
    return memoryService.clearLongTermMemory()
  }
  const handleClearAll = (event: IpcMainInvokeEvent) => {
    assertMemoryWindowSender(event)
    return memoryService.clearAllMemory()
  }

  ipcMain.on(IPC_CHANNELS.openMemorySettings, handleOpenSettings)
  ipcMain.handle(IPC_CHANNELS.getMemoryOverview, handleGetOverview)
  ipcMain.handle(IPC_CHANNELS.updateMemoryProfile, handleUpdateProfile)
  ipcMain.handle(IPC_CHANNELS.deleteMemoryProfile, handleDeleteProfile)
  ipcMain.handle(IPC_CHANNELS.updateManagedMemory, handleUpdateMemory)
  ipcMain.handle(IPC_CHANNELS.deleteManagedMemory, handleDeleteMemory)
  ipcMain.handle(IPC_CHANNELS.setLongTermMemoryEnabled, handleSetEnabled)
  ipcMain.handle(IPC_CHANNELS.clearConversationHistory, handleClearConversation)
  ipcMain.handle(IPC_CHANNELS.clearLongTermMemory, handleClearLongTermMemory)
  ipcMain.handle(IPC_CHANNELS.clearAllMemory, handleClearAll)

  return () => {
    ipcMain.off(IPC_CHANNELS.openMemorySettings, handleOpenSettings)
    ipcMain.removeHandler(IPC_CHANNELS.getMemoryOverview)
    ipcMain.removeHandler(IPC_CHANNELS.updateMemoryProfile)
    ipcMain.removeHandler(IPC_CHANNELS.deleteMemoryProfile)
    ipcMain.removeHandler(IPC_CHANNELS.updateManagedMemory)
    ipcMain.removeHandler(IPC_CHANNELS.deleteManagedMemory)
    ipcMain.removeHandler(IPC_CHANNELS.setLongTermMemoryEnabled)
    ipcMain.removeHandler(IPC_CHANNELS.clearConversationHistory)
    ipcMain.removeHandler(IPC_CHANNELS.clearLongTermMemory)
    ipcMain.removeHandler(IPC_CHANNELS.clearAllMemory)
  }
}
