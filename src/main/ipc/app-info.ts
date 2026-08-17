import { app, ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc-channels'

export function registerAppInfoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getAppVersion, () => app.getVersion())
}
