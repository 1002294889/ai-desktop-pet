import type {
  App,
  LoginItemSettingsOptions,
  Settings
} from 'electron'

export interface LoginItemController {
  readonly supported: boolean
  getEnabled: () => boolean
  setEnabled: (enabled: boolean) => void
}

export class ElectronLoginItemController implements LoginItemController {
  readonly supported: boolean

  constructor(private readonly electronApp: App) {
    this.supported =
      electronApp.isPackaged &&
      (process.platform === 'darwin' || process.platform === 'win32')
  }

  getEnabled(): boolean {
    if (!this.supported) {
      return false
    }

    return this.electronApp.getLoginItemSettings(
      this.createLoginItemSettingsOptions()
    ).openAtLogin
  }

  setEnabled(enabled: boolean): void {
    if (!this.supported) {
      throw new Error('Launch at login is not supported on this platform.')
    }

    this.electronApp.setLoginItemSettings(
      this.createLoginItemSettings(enabled)
    )
  }

  private createLoginItemSettings(openAtLogin: boolean): Settings {
    if (process.platform === 'darwin') {
      return {
        openAtLogin,
        type: 'mainAppService'
      }
    }

    return {
      openAtLogin,
      path: process.execPath,
      args: this.electronApp.isPackaged ? [] : [this.electronApp.getAppPath()]
    }
  }

  private createLoginItemSettingsOptions(): LoginItemSettingsOptions {
    if (process.platform === 'darwin') {
      return { type: 'mainAppService' }
    }

    return {
      path: process.execPath,
      args: this.electronApp.isPackaged ? [] : [this.electronApp.getAppPath()]
    }
  }
}
