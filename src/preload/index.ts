import { contextBridge, ipcRenderer } from 'electron'

import type { LoadedCharacter } from '../shared/character'
import type { DesktopApi } from '../shared/desktop-api'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const desktopApi: DesktopApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion) as Promise<string>,
  getActiveCharacter: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getActiveCharacter) as Promise<LoadedCharacter>
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
