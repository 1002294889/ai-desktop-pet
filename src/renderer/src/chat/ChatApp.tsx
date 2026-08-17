import { ChatBubble } from './components/ChatBubble'
import { SpeechBubble } from './components/SpeechBubble'
import { useChatState } from './useChatState'
import './chat.css'

export function ChatApp(): React.JSX.Element | null {
  const state = useChatState()

  if (!state || state.mode === 'hidden') {
    return null
  }

  if (state.mode === 'speech') {
    return (
      <SpeechBubble
        characterName={state.characterName}
        placement={state.placement}
        text={state.speechText ?? ''}
      />
    )
  }

  return <ChatBubble state={state} />
}
