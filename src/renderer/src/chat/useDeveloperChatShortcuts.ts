import { useEffect } from 'react'

import type { ChatMode } from '../../../shared/chat'

export function useDeveloperChatShortcuts(mode: ChatMode = 'hidden'): void {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'b') {
        event.preventDefault()

        if (event.shiftKey) {
          window.desktopApi.dismissSpeechBubble()
        } else {
          window.desktopApi.showSpeechBubble()
        }

        return
      }

      if (key === 'c') {
        event.preventDefault()

        if (event.shiftKey || mode === 'chat') {
          window.desktopApi.closeChat()
        } else {
          window.desktopApi.openChat()
        }

        return
      }

      if (key === 'f') {
        event.preventDefault()
        window.desktopApi.openChat()
        setTimeout(() => {
          void window.desktopApi.sendChatMessage('Hello from the local reply test.')
        }, 50)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode])
}
