import type { ChatPlacement } from '../../../../shared/chat'

interface SpeechBubbleProps {
  characterName: string
  placement: ChatPlacement
  text: string
}

export function SpeechBubble({
  characterName,
  placement,
  text
}: SpeechBubbleProps): React.JSX.Element {
  return (
    <main className="chat-window-shell" data-placement={placement}>
      <section
        className="chat-surface speech-bubble"
        aria-label={`Speech bubble from ${characterName}`}
      >
        <button
          className="chat-close-button"
          type="button"
          aria-label="Dismiss speech bubble"
          onClick={() => window.desktopApi.dismissSpeechBubble()}
        >
          ×
        </button>
        <p>{text}</p>
        <button className="speech-open-chat" type="button" onClick={() => window.desktopApi.openChat()}>
          Chat
        </button>
      </section>
    </main>
  )
}
