import { app, BrowserWindow } from 'electron'

import { registerAppInfoHandlers } from './ipc/app-info'
import { createPetWindow } from './windows/pet-window'

app.whenReady().then(() => {
  registerAppInfoHandlers()
  createPetWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
