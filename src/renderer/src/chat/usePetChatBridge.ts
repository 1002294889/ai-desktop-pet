import { useEffect, useState } from 'react'

import type { ChatState } from '../../../shared/chat'
import { petActionController } from '../pet/pet-action-controller-instance'
import { chatSessionCoordinator } from './chat-session-coordinator-instance'

export function usePetChatBridge(): ChatState | undefined {
  const [state, setState] = useState<ChatState>()

  useEffect(() => {
    let isActive = true

    const applyState = (nextState: ChatState): void => {
      if (!isActive) {
        return
      }

      chatSessionCoordinator.handleMode(nextState.mode)
      setState(nextState)
    }
    const stopListeningForState = window.desktopApi.onChatStateChange(applyState)
    const stopListeningForReactions = window.desktopApi.onChatPetReaction((action) => {
      petActionController.playAction(action)
    })

    void window.desktopApi.getChatState().then(applyState)

    return () => {
      isActive = false
      stopListeningForState()
      stopListeningForReactions()
    }
  }, [])

  return state
}
