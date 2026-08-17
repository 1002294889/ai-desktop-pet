import { useEffect, useState } from 'react'

import type { ChatState } from '../../../shared/chat'

export function useChatState(): ChatState | undefined {
  const [state, setState] = useState<ChatState>()

  useEffect(() => {
    let isActive = true
    const applyState = (nextState: ChatState): void => {
      if (isActive) {
        setState(nextState)
      }
    }
    const stopListening = window.desktopApi.onChatStateChange(applyState)

    void window.desktopApi.getChatState().then(applyState)

    return () => {
      isActive = false
      stopListening()
    }
  }, [])

  return state
}
