export const APP_SETTINGS_VERSION = 1

export interface AppSettings {
  launchAtLogin: boolean
  alwaysOnTop: boolean
  autonomousBehaviorEnabled: boolean
  longTermMemoryEnabled: boolean
  petVisible: boolean
}

export const APP_SETTING_KEYS = [
  'launchAtLogin',
  'alwaysOnTop',
  'autonomousBehaviorEnabled',
  'longTermMemoryEnabled',
  'petVisible'
] as const

export type AppSettingKey = (typeof APP_SETTING_KEYS)[number]

export interface UpdateAppSettingInput {
  key: AppSettingKey
  value: boolean
}

export type AIConfigurationStatus =
  | 'configured'
  | 'not-configured'
  | 'not-required'

export interface AIProviderSettingsStatus {
  requestedProvider: 'DeepSeek' | 'Local'
  activeProvider: 'DeepSeek' | 'Local'
  apiStatus: AIConfigurationStatus
  model: string | null
  usingFallback: boolean
}

export interface AppSettingsOverview {
  settings: AppSettings
  ai: AIProviderSettingsStatus
  activeCharacter: {
    id: string
    name: string
  }
  application: {
    name: 'AI Desktop Pet'
    version: string
    description: string
  }
  capabilities: {
    launchAtLogin: boolean
    platform: 'macos' | 'windows' | 'linux' | 'other'
  }
}

export const SETTINGS_DESTINATIONS = ['characters', 'memory'] as const
export type SettingsDestination = (typeof SETTINGS_DESTINATIONS)[number]

export function isUpdateAppSettingInput(
  value: unknown
): value is UpdateAppSettingInput {
  return (
    isRecord(value) &&
    APP_SETTING_KEYS.includes(value.key as AppSettingKey) &&
    typeof value.value === 'boolean'
  )
}

export function isAppSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    APP_SETTING_KEYS.every((key) => typeof value[key] === 'boolean')
  )
}

export function isAppSettingsOverview(
  value: unknown
): value is AppSettingsOverview {
  if (!isRecord(value) || !isAppSettings(value.settings)) {
    return false
  }

  const { ai, activeCharacter, application, capabilities } = value

  return (
    isRecord(ai) &&
    (ai.requestedProvider === 'DeepSeek' || ai.requestedProvider === 'Local') &&
    (ai.activeProvider === 'DeepSeek' || ai.activeProvider === 'Local') &&
    ['configured', 'not-configured', 'not-required'].includes(
      ai.apiStatus as AIConfigurationStatus
    ) &&
    (ai.model === null || typeof ai.model === 'string') &&
    typeof ai.usingFallback === 'boolean' &&
    isRecord(activeCharacter) &&
    typeof activeCharacter.id === 'string' &&
    typeof activeCharacter.name === 'string' &&
    isRecord(application) &&
    application.name === 'AI Desktop Pet' &&
    typeof application.version === 'string' &&
    typeof application.description === 'string' &&
    isRecord(capabilities) &&
    typeof capabilities.launchAtLogin === 'boolean' &&
    ['macos', 'windows', 'linux', 'other'].includes(
      capabilities.platform as string
    )
  )
}

export function isSettingsDestination(
  value: unknown
): value is SettingsDestination {
  return SETTINGS_DESTINATIONS.includes(value as SettingsDestination)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
