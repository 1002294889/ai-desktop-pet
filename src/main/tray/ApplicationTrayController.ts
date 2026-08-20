import {
  app,
  Menu,
  Tray,
  nativeImage,
  type Menu as ElectronMenu,
  type MenuItemConstructorOptions
} from 'electron'

import type { ApplicationSettingsService } from '../settings/ApplicationSettingsService'

const TRAY_GUID = 'f08f66ef-e4d5-49c2-b8d7-893a602e94c8'
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII='

export interface ApplicationTrayActions {
  openChat: () => void
  openCharacters: () => void
  openMemory: () => void
  openSettings: () => void
  quit: () => void
}

export type DevelopmentTrayAction =
  | 'pet-visibility'
  | 'chat'
  | 'characters'
  | 'memory'
  | 'settings'
  | 'autonomous-behavior'
  | 'quit'

export class ApplicationTrayController {
  private readonly tray: Tray
  private readonly unsubscribeFromSettings: () => void
  private menu: ElectronMenu | undefined

  constructor(
    private readonly settingsService: ApplicationSettingsService,
    private readonly actions: ApplicationTrayActions
  ) {
    const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({
      width: 16,
      height: 16
    })

    if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
    }

    this.tray = new Tray(icon, TRAY_GUID)
    this.tray.setToolTip('AI Desktop Pet')
    this.unsubscribeFromSettings = settingsService.subscribe(() => this.rebuildMenu())
    this.rebuildMenu()
  }

  getTray(): Tray {
    return this.tray
  }

  async activateMenuItemForDevelopment(
    action: DevelopmentTrayAction
  ): Promise<void> {
    if (app.isPackaged) {
      throw new Error('Development tray actions are unavailable in packaged builds.')
    }

    const menuItem = this.menu?.getMenuItemById(action)

    if (!menuItem) {
      throw new Error(`Tray action "${action}" is unavailable.`)
    }

    await this.performAction(action)
  }

  dispose(): void {
    this.unsubscribeFromSettings()

    if (!this.tray.isDestroyed()) {
      this.tray.destroy()
    }
  }

  private rebuildMenu(): void {
    const settings = this.settingsService.getOverview().settings
    const template: MenuItemConstructorOptions[] = [
      {
        id: 'pet-visibility',
        label: settings.petVisible ? 'Hide Pet' : 'Show Pet',
        click: () => {
          void this.performAction('pet-visibility')
        }
      },
      {
        id: 'chat',
        label: 'Chat',
        click: () => this.performAction('chat')
      },
      { type: 'separator' },
      {
        id: 'characters',
        label: 'Characters…',
        click: () => this.performAction('characters')
      },
      {
        id: 'memory',
        label: 'Memory & Privacy…',
        click: () => this.performAction('memory')
      },
      {
        id: 'settings',
        label: 'Settings…',
        click: () => this.performAction('settings')
      },
      { type: 'separator' },
      {
        id: 'autonomous-behavior',
        label: settings.autonomousBehaviorEnabled
          ? 'Pause Autonomous Behavior'
          : 'Resume Autonomous Behavior',
        click: () => {
          void this.performAction('autonomous-behavior')
        }
      },
      { type: 'separator' },
      {
        id: 'quit',
        label: 'Quit AI Desktop Pet',
        click: () => this.performAction('quit')
      }
    ]

    this.menu = Menu.buildFromTemplate(template)
    this.tray.setContextMenu(this.menu)
  }

  private async updateBooleanSetting(
    key: 'petVisible' | 'autonomousBehaviorEnabled',
    value: boolean
  ): Promise<void> {
    try {
      await this.settingsService.update({ key, value })
    } catch (error: unknown) {
      console.error('[Settings] Tray update failed.', {
        setting: key,
        message: error instanceof Error ? error.message : 'unknown error'
      })
    }
  }

  private async performAction(action: DevelopmentTrayAction): Promise<void> {
    const settings = this.settingsService.getOverview().settings

    switch (action) {
      case 'pet-visibility':
        await this.updateBooleanSetting('petVisible', !settings.petVisible)
        return
      case 'chat':
        this.actions.openChat()
        return
      case 'characters':
        this.actions.openCharacters()
        return
      case 'memory':
        this.actions.openMemory()
        return
      case 'settings':
        this.actions.openSettings()
        return
      case 'autonomous-behavior':
        await this.updateBooleanSetting(
          'autonomousBehaviorEnabled',
          !settings.autonomousBehaviorEnabled
        )
        return
      case 'quit':
        this.actions.quit()
    }
  }
}
