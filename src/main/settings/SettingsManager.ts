import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  APP_SETTINGS_VERSION,
  type AppSettingKey,
  type AppSettings
} from '../../shared/app-settings'
import type { LoginItemController } from './LoginItemController'
import { SettingsManagerError } from './settings-manager-error'

const DEFAULT_SETTINGS: Omit<AppSettings, 'longTermMemoryEnabled'> = {
  launchAtLogin: false,
  alwaysOnTop: true,
  autonomousBehaviorEnabled: true,
  petVisible: true
}

interface PersistedAppSettings {
  version: number
  launchAtLogin: boolean
  alwaysOnTop: boolean
  autonomousBehaviorEnabled: boolean
  petVisible: boolean
}

export interface LongTermMemorySettingsAccess {
  getEnabled: () => boolean
  setEnabled: (enabled: boolean) => boolean
}

export interface SettingsManagerOptions {
  settingsFilePath: string
  loginItems: LoginItemController
}

type SettingsListener = (settings: AppSettings) => void

export class SettingsManager {
  private readonly listeners = new Set<SettingsListener>()
  private readonly warnings: string[] = []
  private persisted: PersistedAppSettings = {
    version: APP_SETTINGS_VERSION,
    ...DEFAULT_SETTINGS
  }
  private longTermMemory: LongTermMemorySettingsAccess | undefined
  private initialized = false
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly options: SettingsManagerOptions) {}

  async initialize(): Promise<void> {
    const loaded = await this.readPersistedSettings()

    this.persisted = loaded.settings
    this.warnings.push(...loaded.warnings)
    this.initialized = true

    if (this.options.loginItems.supported) {
      try {
        this.options.loginItems.setEnabled(this.persisted.launchAtLogin)
        const applied = this.options.loginItems.getEnabled()

        if (applied !== this.persisted.launchAtLogin) {
          this.warnings.push(
            'The operating system did not apply the saved launch-at-login setting.'
          )
          this.persisted.launchAtLogin = applied
        }
      } catch (error: unknown) {
        this.warnings.push(
          `Launch-at-login could not be synchronized: ${getErrorMessage(error)}`
        )
        this.persisted.launchAtLogin = false
      }
    } else {
      this.persisted.launchAtLogin = false
    }

    await this.persistSettings()
  }

  bindLongTermMemory(access: LongTermMemorySettingsAccess): void {
    this.assertInitialized()
    this.longTermMemory = access
    this.emit()
  }

  getSnapshot(): AppSettings {
    this.assertInitialized()

    return {
      launchAtLogin: this.persisted.launchAtLogin,
      alwaysOnTop: this.persisted.alwaysOnTop,
      autonomousBehaviorEnabled: this.persisted.autonomousBehaviorEnabled,
      longTermMemoryEnabled: this.longTermMemory?.getEnabled() ?? true,
      petVisible: this.persisted.petVisible
    }
  }

  getWarnings(): readonly string[] {
    return [...this.warnings]
  }

  isLaunchAtLoginSupported(): boolean {
    return this.options.loginItems.supported
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async setSetting(key: AppSettingKey, value: boolean): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      this.assertInitialized()

      if (key === 'longTermMemoryEnabled') {
        if (!this.longTermMemory) {
          throw new SettingsManagerError(
            'not-initialized',
            'Long-term memory settings are not ready.'
          )
        }

        this.longTermMemory.setEnabled(value)
        this.emit()
        return this.getSnapshot()
      }

      if (this.persisted[key] === value) {
        return this.getSnapshot()
      }

      if (key === 'launchAtLogin') {
        this.applyLaunchAtLogin(value)
      }

      const previousPersisted = this.persisted
      this.persisted = {
        ...this.persisted,
        [key]: value
      }

      try {
        await this.persistSettings()
      } catch (error: unknown) {
        this.persisted = previousPersisted

        if (key === 'launchAtLogin') {
          try {
            this.options.loginItems.setEnabled(!value)
          } catch {
            // The persistence error is the primary failure reported to the caller.
          }
        }

        throw new SettingsManagerError(
          'persistence-failed',
          'The application setting could not be saved.',
          { cause: error }
        )
      }

      this.emit()
      return this.getSnapshot()
    })
  }

  notifyMetadataChanged(): void {
    if (this.initialized) {
      this.emit()
    }
  }

  dispose(): void {
    this.listeners.clear()
    this.longTermMemory = undefined
  }

  private applyLaunchAtLogin(enabled: boolean): void {
    if (!this.options.loginItems.supported) {
      throw new SettingsManagerError(
        'login-item-unavailable',
        'Launch at login is not available on this platform.'
      )
    }

    try {
      this.options.loginItems.setEnabled(enabled)

      if (this.options.loginItems.getEnabled() !== enabled) {
        throw new Error('The operating system did not confirm the requested setting.')
      }
    } catch (error: unknown) {
      throw new SettingsManagerError(
        'login-item-unavailable',
        'The operating system could not update Launch at Login.',
        { cause: error }
      )
    }
  }

  private async readPersistedSettings(): Promise<{
    settings: PersistedAppSettings
    warnings: string[]
  }> {
    const warnings: string[] = []

    try {
      const contents = await readFile(this.options.settingsFilePath, 'utf8')

      if (contents.length > 32_000) {
        throw new Error('settings file is too large')
      }

      const value: unknown = JSON.parse(contents)

      if (!isRecord(value)) {
        throw new Error('settings file must contain an object')
      }

      if (value.version !== APP_SETTINGS_VERSION) {
        warnings.push(
          'Application settings were migrated to the current schema version.'
        )
      }

      return {
        settings: {
          version: APP_SETTINGS_VERSION,
          launchAtLogin: readBoolean(
            value,
            'launchAtLogin',
            DEFAULT_SETTINGS.launchAtLogin,
            warnings
          ),
          alwaysOnTop: readBoolean(
            value,
            'alwaysOnTop',
            DEFAULT_SETTINGS.alwaysOnTop,
            warnings
          ),
          autonomousBehaviorEnabled: readBoolean(
            value,
            'autonomousBehaviorEnabled',
            DEFAULT_SETTINGS.autonomousBehaviorEnabled,
            warnings
          ),
          petVisible: readBoolean(
            value,
            'petVisible',
            DEFAULT_SETTINGS.petVisible,
            warnings
          )
        },
        warnings
      }
    } catch (error: unknown) {
      if (!isFileNotFoundError(error)) {
        warnings.push(
          'Application settings were invalid and safe defaults were restored.'
        )
      }

      return {
        settings: {
          version: APP_SETTINGS_VERSION,
          ...DEFAULT_SETTINGS
        },
        warnings
      }
    }
  }

  private async persistSettings(): Promise<void> {
    const settingsDirectory = dirname(this.options.settingsFilePath)
    const temporaryPath = join(
      settingsDirectory,
      `.app-settings-${randomUUID()}.tmp`
    )

    await mkdir(settingsDirectory, { recursive: true })

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(this.persisted, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 }
      )
      await rename(temporaryPath, this.options.settingsFilePath)
    } catch (error: unknown) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot()

    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new SettingsManagerError(
        'not-initialized',
        'SettingsManager has not been initialized.'
      )
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)

    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    )

    return result
  }
}

function readBoolean(
  value: Record<string, unknown>,
  key: keyof typeof DEFAULT_SETTINGS,
  fallback: boolean,
  warnings: string[]
): boolean {
  if (typeof value[key] === 'boolean') {
    return value[key]
  }

  if (value[key] !== undefined) {
    warnings.push(`Invalid setting "${key}" was reset to its default.`)
  }

  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown operating-system error'
}
