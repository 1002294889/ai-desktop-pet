import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'

import type { LoadedCharacter } from '../../shared/character'
import type {
  CharacterOperationErrorCode,
  CharacterOperationResult
} from '../../shared/character-management'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  CharacterPackError,
  getCharacterPackErrorMessage
} from '../characters/character-pack-error'
import type { CharacterManager } from '../characters/character-manager'
import type { CharacterWindowController } from '../windows/CharacterWindowController'

interface RegisterCharacterHandlersOptions {
  petWindow: BrowserWindow
  characterManager: CharacterManager
  characterWindowController: CharacterWindowController
  onActiveCharacterChanged: (character: LoadedCharacter) => void
}

export function registerCharacterHandlers(
  options: RegisterCharacterHandlersOptions
): () => void {
  const {
    petWindow,
    characterManager,
    characterWindowController,
    onActiveCharacterChanged
  } = options
  const assertManagerSender = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== characterWindowController.getWebContents()) {
      throw new Error('Unauthorized character-management IPC sender')
    }
  }
  const assertCharacterReader = (event: IpcMainInvokeEvent): void => {
    if (
      event.sender !== petWindow.webContents &&
      event.sender !== characterWindowController.getWebContents()
    ) {
      throw new Error('Unauthorized character IPC sender')
    }
  }
  const handleOpenManager = (event: IpcMainEvent): void => {
    if (event.sender === petWindow.webContents) {
      characterWindowController.open()
    }
  }
  const handleGetActive = (event: IpcMainInvokeEvent) => {
    assertCharacterReader(event)
    return characterManager.getActiveCharacter()
  }
  const handleGetOverview = (event: IpcMainInvokeEvent) => {
    assertManagerSender(event)
    return characterManager.getOverview()
  }
  const handleImport = async (
    event: IpcMainInvokeEvent
  ): Promise<CharacterOperationResult> => {
    assertManagerSender(event)
    const managerWindow = characterWindowController.getWindow()

    if (!managerWindow || managerWindow.isDestroyed()) {
      return createErrorResult(
        characterManager,
        'unexpected-error',
        'The Character Manager window is unavailable.'
      )
    }

    const selection = await dialog.showOpenDialog(managerWindow, {
      title: 'Select a character pack folder',
      buttonLabel: 'Import Character',
      properties: ['openDirectory']
    })

    if (selection.canceled || !selection.filePaths[0]) {
      return {
        status: 'cancelled',
        message: 'Character import was cancelled.',
        overview: characterManager.getOverview()
      }
    }

    try {
      const imported = await characterManager.importCharacterPack(
        selection.filePaths[0]
      )

      return {
        status: 'success',
        message: `${imported.name} was imported.`,
        overview: characterManager.getOverview(),
        characterId: imported.id
      }
    } catch (error: unknown) {
      return createOperationError(characterManager, error)
    }
  }
  const handleSetActive = async (
    event: IpcMainInvokeEvent,
    characterId: unknown
  ): Promise<CharacterOperationResult> => {
    assertManagerSender(event)

    if (!isCharacterId(characterId)) {
      return createErrorResult(
        characterManager,
        'not-found',
        'The requested character ID is invalid.'
      )
    }

    try {
      const character = await characterManager.setActiveCharacter(characterId)

      return {
        status: 'success',
        message: `${character.manifest.name} is now active.`,
        overview: characterManager.getOverview(),
        characterId
      }
    } catch (error: unknown) {
      return createOperationError(characterManager, error)
    }
  }
  const handleRemove = async (
    event: IpcMainInvokeEvent,
    characterId: unknown
  ): Promise<CharacterOperationResult> => {
    assertManagerSender(event)

    if (!isCharacterId(characterId)) {
      return createErrorResult(
        characterManager,
        'not-found',
        'The requested character ID is invalid.'
      )
    }

    try {
      const result = await characterManager.removeCharacter(characterId)

      return {
        status: 'success',
        message: result.switchedToDefault
          ? 'The active user character was removed and the default character is active.'
          : 'The user character was removed.',
        overview: characterManager.getOverview(),
        characterId
      }
    } catch (error: unknown) {
      return createOperationError(characterManager, error)
    }
  }
  const unsubscribe = characterManager.subscribe((character) => {
    if (!petWindow.isDestroyed()) {
      petWindow.webContents.send(
        IPC_CHANNELS.activeCharacterChanged,
        character
      )
    }

    onActiveCharacterChanged(character)
  })

  ipcMain.on(IPC_CHANNELS.openCharacterManager, handleOpenManager)
  ipcMain.handle(IPC_CHANNELS.getActiveCharacter, handleGetActive)
  ipcMain.handle(IPC_CHANNELS.getCharacterOverview, handleGetOverview)
  ipcMain.handle(IPC_CHANNELS.importCharacterPack, handleImport)
  ipcMain.handle(IPC_CHANNELS.setActiveCharacter, handleSetActive)
  ipcMain.handle(IPC_CHANNELS.removeCharacterPack, handleRemove)

  return () => {
    unsubscribe()
    ipcMain.off(IPC_CHANNELS.openCharacterManager, handleOpenManager)
    ipcMain.removeHandler(IPC_CHANNELS.getActiveCharacter)
    ipcMain.removeHandler(IPC_CHANNELS.getCharacterOverview)
    ipcMain.removeHandler(IPC_CHANNELS.importCharacterPack)
    ipcMain.removeHandler(IPC_CHANNELS.setActiveCharacter)
    ipcMain.removeHandler(IPC_CHANNELS.removeCharacterPack)
  }
}

function createOperationError(
  manager: CharacterManager,
  error: unknown
): CharacterOperationResult {
  const errorCode =
    error instanceof CharacterPackError ? error.code : 'unexpected-error'

  return createErrorResult(
    manager,
    errorCode,
    getCharacterPackErrorMessage(error)
  )
}

function createErrorResult(
  manager: CharacterManager,
  errorCode: CharacterOperationErrorCode,
  message: string
): CharacterOperationResult {
  return {
    status: 'error',
    errorCode,
    message,
    overview: manager.getOverview()
  }
}

function isCharacterId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
  )
}
