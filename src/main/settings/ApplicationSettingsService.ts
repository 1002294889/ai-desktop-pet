import type {
  AppSettingsOverview,
  UpdateAppSettingInput
} from '../../shared/app-settings'
import type { AIProviderSelection } from '../ai/provider-factory'
import type { CharacterManager } from '../characters/character-manager'
import type { SettingsManager } from './SettingsManager'

const APPLICATION_DESCRIPTION =
  'A private desktop companion with replaceable characters, conversation, and local memory.'

export interface ApplicationSettingsServiceOptions {
  settingsManager: SettingsManager
  characterManager: CharacterManager
  aiProvider: AIProviderSelection
  configuredModel: string
  applicationVersion: string
}

type OverviewListener = (overview: AppSettingsOverview) => void

export class ApplicationSettingsService {
  private readonly listeners = new Set<OverviewListener>()
  private readonly unsubscribeFromSettings: () => void
  private readonly unsubscribeFromCharacter: () => void

  constructor(private readonly options: ApplicationSettingsServiceOptions) {
    this.unsubscribeFromSettings = options.settingsManager.subscribe(() => this.emit())
    this.unsubscribeFromCharacter = options.characterManager.subscribe(() => this.emit())
  }

  getOverview(): AppSettingsOverview {
    const activeCharacter = this.options.characterManager.getActiveCharacter().manifest
    const providerInfo = this.options.aiProvider.info
    const requestedProvider =
      providerInfo.requestedProvider === 'deepseek' ? 'DeepSeek' : 'Local'
    const activeProvider =
      providerInfo.activeProvider === 'deepseek' ? 'DeepSeek' : 'Local'

    return {
      settings: this.options.settingsManager.getSnapshot(),
      ai: {
        requestedProvider,
        activeProvider,
        apiStatus:
          requestedProvider === 'Local'
            ? 'not-required'
            : this.options.aiProvider.fallbackReason === 'missing-api-key'
              ? 'not-configured'
              : 'configured',
        model:
          requestedProvider === 'DeepSeek'
            ? this.options.configuredModel
            : providerInfo.model,
        usingFallback: providerInfo.usingFallback
      },
      activeCharacter: {
        id: activeCharacter.id,
        name: activeCharacter.name
      },
      application: {
        name: 'AI Desktop Pet',
        version: this.options.applicationVersion,
        description: APPLICATION_DESCRIPTION
      },
      capabilities: {
        launchAtLogin: this.options.settingsManager.isLaunchAtLoginSupported(),
        platform: getPlatformName()
      }
    }
  }

  async update(input: UpdateAppSettingInput): Promise<AppSettingsOverview> {
    await this.options.settingsManager.setSetting(input.key, input.value)
    return this.getOverview()
  }

  subscribe(listener: OverviewListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.unsubscribeFromSettings()
    this.unsubscribeFromCharacter()
    this.listeners.clear()
  }

  private emit(): void {
    const overview = this.getOverview()

    for (const listener of this.listeners) {
      listener(overview)
    }
  }
}

function getPlatformName(): AppSettingsOverview['capabilities']['platform'] {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    case 'linux':
      return 'linux'
    default:
      return 'other'
  }
}
