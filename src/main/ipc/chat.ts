import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

import type { ChatController } from '../chat/ChatController'
import type { ChatWindowController } from '../windows/ChatWindowController'
import type { ChatSendResult } from '../../shared/chat'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

export function registerChatHandlers(
  petWindow: BrowserWindow,
  chatController: ChatController,
  chatWindowController: ChatWindowController
): () => void {
  const isAllowedSender = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
    const chatWebContents = chatWindowController.getWebContents()

    return event.sender === petWindow.webContents || event.sender === chatWebContents
  }

  const assertAllowedSender = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
    if (!isAllowedSender(event)) {
      throw new Error('Unauthorized chat IPC sender')
    }
  }

  const handleGetState = (event: IpcMainInvokeEvent) => {
    assertAllowedSender(event)
    return chatController.getSnapshot()
  }
  const handleOpenChat = (event: IpcMainEvent): void => {
    assertAllowedSender(event)
    chatController.openChat()
  }
  const handleCloseChat = (event: IpcMainEvent): void => {
    assertAllowedSender(event)
    chatController.closeChat()
  }
  const handleShowSpeech = (event: IpcMainEvent): void => {
    assertAllowedSender(event)
    chatController.showSpeechBubble()
  }
  const handleDismissSpeech = (event: IpcMainEvent): void => {
    assertAllowedSender(event)
    chatController.dismissSpeechBubble()
  }
  const handleSendMessage = async (
    event: IpcMainInvokeEvent,
    content: unknown
  ): Promise<ChatSendResult> => {
    assertAllowedSender(event)

    if (typeof content !== 'string') {
      return { accepted: false, reason: 'empty-message' }
    }

    return chatController.sendMessage(content)
  }

  ipcMain.handle(IPC_CHANNELS.getChatState, handleGetState)
  ipcMain.on(IPC_CHANNELS.openChat, handleOpenChat)
  ipcMain.on(IPC_CHANNELS.closeChat, handleCloseChat)
  ipcMain.on(IPC_CHANNELS.showSpeechBubble, handleShowSpeech)
  ipcMain.on(IPC_CHANNELS.dismissSpeechBubble, handleDismissSpeech)
  ipcMain.handle(IPC_CHANNELS.sendChatMessage, handleSendMessage)

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.getChatState)
    ipcMain.off(IPC_CHANNELS.openChat, handleOpenChat)
    ipcMain.off(IPC_CHANNELS.closeChat, handleCloseChat)
    ipcMain.off(IPC_CHANNELS.showSpeechBubble, handleShowSpeech)
    ipcMain.off(IPC_CHANNELS.dismissSpeechBubble, handleDismissSpeech)
    ipcMain.removeHandler(IPC_CHANNELS.sendChatMessage)
  }
}
