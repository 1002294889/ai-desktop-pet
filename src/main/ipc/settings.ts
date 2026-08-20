import {
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'

import {
  isSettingsDestination,
  isUpdateAppSettingInput
} from '../../shared/app-settings'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { ApplicationSettingsService } from '../settings/ApplicationSettingsService'
import { SettingsManagerError } from '../settings/settings-manager-error'
import type { DesktopPetRuntime } from '../windows/pet-window'
import type { SettingsWindowController } from '../windows/SettingsWindowController'

export interface RegisterSettingsHandlersOptions {
  settingsService: ApplicationSettingsService
  settingsWindowController: SettingsWindowController
  petRuntime: DesktopPetRuntime
}

export function registerSettingsHandlers(
  options: RegisterSettingsHandlersOptions
): () => void {
  const { settingsService, settingsWindowController, petRuntime } = options
  const isPetSender = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    event.sender === petRuntime.getPetWindow().webContents
  const isSettingsSender = (
    event: IpcMainEvent | IpcMainInvokeEvent
  ): boolean => event.sender === settingsWindowController.getWebContents()
  const handleOpen = (event: IpcMainEvent): void => {
    if (isPetSender(event)) {
      settingsWindowController.open()
    }
  }
  const handleGetOverview = (event: IpcMainInvokeEvent) => {
    if (!isPetSender(event) && !isSettingsSender(event)) {
      throw new SettingsManagerError('invalid-input', 'Unauthorized settings request.')
    }

    return settingsService.getOverview()
  }
  const handleUpdate = async (
    event: IpcMainInvokeEvent,
    input: unknown
  ) => {
    if (!isSettingsSender(event) || !isUpdateAppSettingInput(input)) {
      throw new SettingsManagerError('invalid-input', 'Invalid settings update.')
    }

    return settingsService.update(input)
  }
  const handleOpenDestination = (
    event: IpcMainEvent,
    destination: unknown
  ): void => {
    if (!isSettingsSender(event) || !isSettingsDestination(destination)) {
      return
    }

    if (destination === 'characters') {
      petRuntime.openCharacterManager()
    } else {
      petRuntime.openMemoryManager()
    }
  }

  ipcMain.on(IPC_CHANNELS.openAppSettings, handleOpen)
  ipcMain.handle(IPC_CHANNELS.getAppSettings, handleGetOverview)
  ipcMain.handle(IPC_CHANNELS.updateAppSetting, handleUpdate)
  ipcMain.on(IPC_CHANNELS.openSettingsDestination, handleOpenDestination)

  return () => {
    ipcMain.off(IPC_CHANNELS.openAppSettings, handleOpen)
    ipcMain.removeHandler(IPC_CHANNELS.getAppSettings)
    ipcMain.removeHandler(IPC_CHANNELS.updateAppSetting)
    ipcMain.off(IPC_CHANNELS.openSettingsDestination, handleOpenDestination)
  }
}
