import { contextBridge, ipcRenderer } from 'electron'

import type { DesktopApi } from '../shared/desktop-api'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const desktopApi: DesktopApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion) as Promise<string>
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
