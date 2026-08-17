import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import type { ChatState } from '../../../../shared/chat'

interface ChatBubbleProps {
  state: ChatState
}

export function ChatBubble({ state }: ChatBubbleProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [sendError, setSendError] = useState<string>()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const normalizedMessage = message.trim()
  const canSend = normalizedMessage.length > 0 && !state.isProcessing

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [state.messages, state.isProcessing])

  const sendMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    if (!canSend) {
      return
    }

    setSendError(undefined)
    const result = await window.desktopApi.sendChatMessage(message)

    if (result.accepted) {
      setMessage('')
      return
    }

    setSendError(
      result.reason === 'processing'
        ? 'Wait for the current reply.'
        : 'Type a message before sending.'
    )
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
          <strong>{state.characterName}</strong>
          <button
            className="chat-close-button"
            type="button"
            aria-label="Close chat"
            onClick={() => window.desktopApi.closeChat()}
          >
            ×
          </button>
        </header>
        <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
          {state.messages.map((chatMessage) => (
            <p
              className="chat-message"
              data-role={chatMessage.role}
              key={chatMessage.id}
            >
              <span className="chat-message-role">
                {chatMessage.role === 'assistant' ? state.characterName : 'You'}
              </span>
              {chatMessage.content}
            </p>
          ))}
          {state.isProcessing ? (
            <p className="chat-typing" aria-label={`${state.characterName} is replying`}>
              {state.characterName} is thinking…
            </p>
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
            placeholder="Type a message…"
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button type="submit" disabled={!canSend}>
            Send
          </button>
        </form>
        {sendError ? <p className="chat-send-error">{sendError}</p> : null}
      </section>
    </main>
  )
}
