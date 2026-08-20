import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { BrowserWindow } from 'electron'

import type { MemoryService } from '../memory/MemoryService'
import type { ApplicationTrayController } from '../tray/ApplicationTrayController'
import type { DesktopPetRuntime } from '../windows/pet-window'
import type { SettingsWindowController } from '../windows/SettingsWindowController'
import type { ApplicationSettingsService } from './ApplicationSettingsService'
import type { LoginItemController } from './LoginItemController'
import { SettingsManager } from './SettingsManager'

const PROBE_MODES = [
  'exercise',
  'seed-persistence',
  'verify-persistence',
  'cleanup',
  'tray-quit'
] as const

export type SettingsProbeMode = (typeof PROBE_MODES)[number]

export interface SettingsProbeOptions {
  settingsService: ApplicationSettingsService
  memoryService: MemoryService
  petRuntime: DesktopPetRuntime
  settingsWindowController: SettingsWindowController
  trayController: ApplicationTrayController
  repositoryRoot: string
  settingsFilePath: string
}

export function getSettingsProbeMode(): SettingsProbeMode | undefined {
  const value = process.env.DESKTOP_PET_SETTINGS_PROBE_MODE

  if (value === undefined) {
    return undefined
  }

  if (!PROBE_MODES.includes(value as SettingsProbeMode)) {
    throw new Error(
      'DESKTOP_PET_SETTINGS_PROBE_MODE must be exercise, seed-persistence, verify-persistence, cleanup, or tray-quit.'
    )
  }

  return value as SettingsProbeMode
}

export async function runSettingsProbe(
  mode: SettingsProbeMode,
  options: SettingsProbeOptions
): Promise<void> {
  switch (mode) {
    case 'exercise':
      await exerciseSettings(options)
      return
    case 'seed-persistence':
      await setProbePersistenceValues(options.settingsService, false)
      console.info('[SettingsProbe] seed-persistence passed.', {
        settingsSeeded: true
      })
      return
    case 'verify-persistence': {
      const settings = options.settingsService.getOverview().settings

      assert(!settings.alwaysOnTop, 'always-on-top did not persist across restart')
      assert(
        !settings.autonomousBehaviorEnabled,
        'autonomous behavior did not persist across restart'
      )
      assert(!settings.longTermMemoryEnabled, 'memory setting did not persist across restart')
      assert(!settings.petVisible, 'pet visibility did not persist across restart')
      await setProbePersistenceValues(options.settingsService, true)
      console.info('[SettingsProbe] verify-persistence passed.', {
        alwaysOnTopPersisted: true,
        autonomousBehaviorPersisted: true,
        longTermMemoryPersisted: true,
        petVisibilityPersisted: true
      })
      return
    }
    case 'cleanup':
      await setProbePersistenceValues(options.settingsService, true)
      console.info('[SettingsProbe] cleanup passed.')
      return
    case 'tray-quit':
      console.info('[SettingsProbe] Invoking the native tray Quit action.')
      await options.trayController.activateMenuItemForDevelopment('quit')
  }
}

async function exerciseSettings(options: SettingsProbeOptions): Promise<void> {
  await waitForRenderer(options.petRuntime.getPetWindow())
  await exerciseSchemaRecoveryAndLoginItemAdapter(options.repositoryRoot)

  const settingsPathRelativeToRepository = relative(
    resolve(options.repositoryRoot),
    resolve(options.settingsFilePath)
  )

  assert(
    settingsPathRelativeToRepository.startsWith('..') ||
      isAbsolute(settingsPathRelativeToRepository),
    'application settings were stored inside the Git repository'
  )
  assert(
    !options.trayController.getTray().isDestroyed(),
    'tray controller did not create a live tray icon'
  )

  await setProbePersistenceValues(options.settingsService, true)

  let settingsEvents = 0
  const unsubscribe = options.settingsService.subscribe(() => {
    settingsEvents += 1
  })

  try {
    await options.settingsService.update({ key: 'alwaysOnTop', value: false })
    assert(
      !options.petRuntime.getPetWindow().isAlwaysOnTop(),
      'always-on-top did not apply immediately'
    )

    await options.trayController.activateMenuItemForDevelopment('pet-visibility')
    assert(!options.petRuntime.getPetWindow().isVisible(), 'pet did not hide')
    assert(
      !options.trayController.getTray().isDestroyed(),
      'tray was destroyed when the pet was hidden'
    )

    await options.trayController.activateMenuItemForDevelopment('pet-visibility')
    await waitForWindowVisibility(options.petRuntime.getPetWindow(), true)
    assert(options.petRuntime.getPetWindow().isVisible(), 'pet did not show again')

    await options.trayController.activateMenuItemForDevelopment(
      'autonomous-behavior'
    )
    assert(
      !options.settingsService.getOverview().settings.autonomousBehaviorEnabled,
      'autonomous behavior setting did not update'
    )

    await options.settingsService.update({
      key: 'longTermMemoryEnabled',
      value: false
    })
    assert(
      !options.memoryService.getSettings().longTermMemoryEnabled,
      'Settings and Memory did not share the same memory state'
    )

    await options.trayController.activateMenuItemForDevelopment('settings')
    const firstSettingsWindowId = options.settingsWindowController.getWindow()?.id
    await options.trayController.activateMenuItemForDevelopment('settings')
    const secondSettingsWindowId = options.settingsWindowController.getWindow()?.id

    assert(
      firstSettingsWindowId !== undefined &&
        firstSettingsWindowId === secondSettingsWindowId &&
        countWindows('Settings — AI Desktop Pet') === 1,
      'opening Settings created duplicate windows'
    )

    await options.trayController.activateMenuItemForDevelopment('memory')
    await options.trayController.activateMenuItemForDevelopment('memory')
    assert(
      countWindows('Memory & Privacy — AI Desktop Pet') === 1,
      'opening Memory created duplicate windows'
    )

    await options.trayController.activateMenuItemForDevelopment('characters')
    await options.trayController.activateMenuItemForDevelopment('characters')
    assert(
      countWindows('Characters — AI Desktop Pet') === 1,
      'opening Characters created duplicate windows'
    )

    assert(settingsEvents >= 5, 'settings updates were not broadcast consistently')

    console.info('[SettingsProbe] exercise passed.', {
      trayCreated: true,
      trayHideShowPreservedProcess: true,
      alwaysOnTopAppliedImmediately: true,
      autonomousSettingUpdated: true,
      sharedMemorySetting: true,
      settingsWindowSingleton: true,
      memoryWindowSingleton: true,
      characterWindowSingleton: true,
      settingsStoredOutsideRepository: true,
      schemaRecovery: true,
      loginItemAdapterEnableDisable: true,
      loginItemDevelopmentIsolation: true
    })
  } finally {
    unsubscribe()
    await setProbePersistenceValues(options.settingsService, true)
  }
}

async function exerciseSchemaRecoveryAndLoginItemAdapter(
  repositoryRoot: string
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'ai-desktop-pet-settings-probe-'))
  const settingsFilePath = join(directory, 'app-settings.json')
  const loginItems = new ProbeLoginItemController()

  try {
    await writeFile(
      settingsFilePath,
      JSON.stringify({
        version: 0,
        launchAtLogin: false,
        alwaysOnTop: 'invalid',
        autonomousBehaviorEnabled: true,
        petVisible: false
      }),
      'utf8'
    )
    const manager = new SettingsManager({ settingsFilePath, loginItems })

    await manager.initialize()
    let memoryEnabled = true
    manager.bindLongTermMemory({
      getEnabled: () => memoryEnabled,
      setEnabled: (enabled) => {
        memoryEnabled = enabled
        return enabled
      }
    })

    assert(manager.getSnapshot().alwaysOnTop, 'invalid field did not use its default')
    assert(!manager.getSnapshot().petVisible, 'valid partial setting was not preserved')
    assert(manager.getWarnings().length >= 2, 'schema recovery did not report warnings')

    await manager.setSetting('launchAtLogin', true)
    assert(loginItems.enabled, 'login-item adapter did not enable the setting')
    await manager.setSetting('launchAtLogin', false)
    assert(!loginItems.enabled, 'login-item adapter did not disable the setting')
    await manager.setSetting('longTermMemoryEnabled', false)
    assert(!memoryEnabled, 'delegated memory setting did not update')

    const relativePath = relative(resolve(repositoryRoot), resolve(settingsFilePath))
    assert(
      relativePath.startsWith('..') || isAbsolute(relativePath),
      'probe settings were written inside the repository'
    )
    manager.dispose()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function setProbePersistenceValues(
  settingsService: ApplicationSettingsService,
  enabled: boolean
): Promise<void> {
  for (const key of [
    'alwaysOnTop',
    'autonomousBehaviorEnabled',
    'longTermMemoryEnabled',
    'petVisible'
  ] as const) {
    await settingsService.update({ key, value: enabled })
  }

  if (settingsService.getOverview().settings.launchAtLogin) {
    await settingsService.update({ key: 'launchAtLogin', value: false })
  }
}

async function waitForRenderer(window: BrowserWindow): Promise<void> {
  if (!window.webContents.isLoadingMainFrame()) {
    return
  }

  await new Promise<void>((resolvePromise) => {
    window.webContents.once('did-finish-load', () => resolvePromise())
  })
}

async function waitForWindowVisibility(
  window: BrowserWindow,
  expectedVisible: boolean
): Promise<void> {
  const deadline = Date.now() + 2_000

  while (window.isVisible() !== expectedVisible && Date.now() < deadline) {
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, 25)
    })
  }
}

function countWindows(title: string): number {
  return BrowserWindow.getAllWindows().filter(
    (window) => !window.isDestroyed() && window.getTitle() === title
  ).length
}

class ProbeLoginItemController implements LoginItemController {
  readonly supported = true
  enabled = false

  getEnabled = (): boolean => this.enabled

  setEnabled = (enabled: boolean): void => {
    this.enabled = enabled
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[SettingsProbe] ${message}`)
  }
}
