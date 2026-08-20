import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { ChatState } from '../../../../shared/chat'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/Button'

interface ChatBubbleProps { state: ChatState }

export function ChatBubble({ state }: ChatBubbleProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [sendError, setSendError] = useState<string>()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const normalizedMessage = message.trim()
  const canSend = normalizedMessage.length > 0 && (!state.isProcessing || state.isWaitingForSegment)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [state.messages, state.isProcessing])

  const sendMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!canSend) return

    setSendError(undefined)
    const submittedMessage = message
    setMessage('')
    const result = await window.desktopApi.sendChatMessage(submittedMessage)

    if (!result.accepted) {
      setMessage((current) => current || submittedMessage)
      setSendError(result.reason === 'processing' ? 'Your companion is still replying.' : 'Type a message first.')
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <main className="chat-window-shell" data-placement={state.placement}>
      <section className="chat-surface chat-bubble" aria-label={`Chat with ${state.characterName}`}>
        <header className="chat-header">
          <div className="chat-title">
            <span className="chat-avatar" aria-hidden="true">{state.characterName.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{state.characterName}</strong>
              <small>{state.provider.usingFallback ? 'Offline replies' : 'Ready to chat'}</small>
            </span>
          </div>
          <IconButton className="chat-close-button" icon="close" label="Close chat" size="small" onClick={() => window.desktopApi.closeChat()} />
        </header>
        <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
          {state.messages.map((chatMessage, index) => {
            const previous = state.messages[index - 1]
            const next = state.messages[index + 1]
            const continuedFromPrevious = previous?.role === chatMessage.role
            const continuesToNext = next?.role === chatMessage.role

            return (
              <div
                className="chat-message-group"
                data-role={chatMessage.role}
                data-continued={continuedFromPrevious}
                data-continues={continuesToNext}
                key={chatMessage.id}
              >
                {!continuedFromPrevious ? <span className="chat-message-role">{chatMessage.role === 'assistant' ? state.characterName : 'You'}</span> : null}
                <p className="chat-message">{chatMessage.content}</p>
              </div>
            )
          })}
          {state.isProcessing ? (
            <div className="chat-typing" aria-label={`${state.characterName} is ${state.isWaitingForSegment ? 'typing' : 'thinking'}`}>
              <span /><span /><span />
              <small>{state.isWaitingForSegment ? 'Typing' : 'Thinking'}</small>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
        <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
          <textarea
            autoFocus
            value={message}
            rows={2}
            maxLength={2_000}
            aria-label="Message"
            placeholder={`Message ${state.characterName}…`}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button type="submit" disabled={!canSend} aria-label="Send message" title="Send message">
            <Icon name="send" size={17} />
          </button>
        </form>
        {sendError ? <p className="chat-send-error" role="alert">{sendError}</p> : null}
      </section>
    </main>
  )
}
