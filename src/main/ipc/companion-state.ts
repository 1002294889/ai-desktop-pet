import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import {
  isCompanionAutonomousAction,
  isCompanionInteraction
} from '../../shared/companion-state'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { CompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import type { MemoryWindowController } from '../windows/MemoryWindowController'

export function registerCompanionStateHandlers(
  petWindow: BrowserWindow,
  memoryWindowController: MemoryWindowController,
  companionState: CompanionStateCoordinator
): () => void {
  const petWebContents = petWindow.webContents
  const isAllowedReader = (event: IpcMainInvokeEvent): boolean =>
    event.sender === petWebContents ||
    event.sender === memoryWindowController.getWebContents()
  const assertAllowedReader = (event: IpcMainInvokeEvent): void => {
    if (!isAllowedReader(event)) {
      throw new Error('Unauthorized companion-state IPC sender')
    }
  }
  const assertSettingsSender = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== memoryWindowController.getWebContents()) {
      throw new Error('Unauthorized companion-state reset sender')
    }
  }
  const handleGetState = (event: IpcMainInvokeEvent) => {
    assertAllowedReader(event)
    const snapshot = companionState.getSnapshot()

    logDevelopmentSnapshot('snapshot-requested', snapshot)
    return snapshot
  }
  const handlePetInteraction = (event: Electron.IpcMainEvent, interaction: unknown): void => {
    if (event.sender === petWebContents && isCompanionInteraction(interaction)) {
      const snapshot = companionState.handlePetInteraction(interaction)

      logDevelopmentSnapshot(`interaction:${interaction}`, snapshot)
    }
  }
  const handleAutonomousAction = (event: Electron.IpcMainEvent, action: unknown): void => {
    if (event.sender === petWebContents && isCompanionAutonomousAction(action)) {
      const snapshot = companionState.handleAutonomousAction(action)

      if (action === 'sit' || action === 'sleep') {
        logDevelopmentSnapshot(`autonomous:${action}`, snapshot)
      }
    }
  }
  const handleResetEmotion = (event: IpcMainInvokeEvent) => {
    assertSettingsSender(event)
    return companionState.resetEmotion()
  }
  const handleResetRelationship = (event: IpcMainInvokeEvent) => {
    assertSettingsSender(event)
    return companionState.resetRelationship()
  }
  const sendSnapshotToPet = (): void => {
    if (!petWebContents.isDestroyed()) {
      petWebContents.send(
        IPC_CHANNELS.companionStateChanged,
        companionState.getSnapshot()
      )
    }
  }
  const handlePetRendererLoaded = (): void => {
    setTimeout(sendSnapshotToPet, 0)
  }
  const unsubscribe = companionState.subscribe((snapshot) => {
    if (!petWebContents.isDestroyed()) {
      petWebContents.send(IPC_CHANNELS.companionStateChanged, snapshot)
    }

    const settingsWebContents = memoryWindowController.getWebContents()

    if (settingsWebContents && !settingsWebContents.isDestroyed()) {
      settingsWebContents.send(IPC_CHANNELS.companionStateChanged, snapshot)
    }
  })

  ipcMain.handle(IPC_CHANNELS.getCompanionState, handleGetState)
  ipcMain.on(IPC_CHANNELS.reportCompanionInteraction, handlePetInteraction)
  ipcMain.on(IPC_CHANNELS.reportCompanionAutonomousAction, handleAutonomousAction)
  ipcMain.handle(IPC_CHANNELS.resetCompanionEmotion, handleResetEmotion)
  ipcMain.handle(IPC_CHANNELS.resetCompanionRelationship, handleResetRelationship)
  petWebContents.on('did-finish-load', handlePetRendererLoaded)

  return () => {
    unsubscribe()
    ipcMain.removeHandler(IPC_CHANNELS.getCompanionState)
    ipcMain.off(IPC_CHANNELS.reportCompanionInteraction, handlePetInteraction)
    ipcMain.off(IPC_CHANNELS.reportCompanionAutonomousAction, handleAutonomousAction)
    ipcMain.removeHandler(IPC_CHANNELS.resetCompanionEmotion)
    ipcMain.removeHandler(IPC_CHANNELS.resetCompanionRelationship)
    petWebContents.off('did-finish-load', handlePetRendererLoaded)
  }
}

function logDevelopmentSnapshot(
  source: string,
  snapshot: ReturnType<CompanionStateCoordinator['getSnapshot']>
): void {
  if (app.isPackaged) {
    return
  }

  console.info('[CompanionState]', {
    source,
    mood: snapshot.emotion.state,
    intensity: snapshot.emotion.intensity,
    familiarity: snapshot.relationship.familiarity,
    trust: snapshot.relationship.trust,
    interactionCount: snapshot.relationship.interactionCount,
    emotionStartedAt: snapshot.emotion.startedAt,
    decaysToNeutralAt: snapshot.emotion.decaysToNeutralAt,
    firstInteractionAt: snapshot.relationship.firstInteractionAt,
    lastInteractionAt: snapshot.relationship.lastInteractionAt
  })
}
