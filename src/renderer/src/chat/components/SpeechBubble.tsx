import type { ChatPlacement } from '../../../../shared/chat'
import { Button, IconButton } from '../../ui/Button'

interface SpeechBubbleProps { characterName: string; placement: ChatPlacement; text: string }

export function SpeechBubble({ characterName, placement, text }: SpeechBubbleProps): React.JSX.Element {
  return (
    <main className="chat-window-shell" data-placement={placement}>
      <section className="chat-surface speech-bubble" aria-label={`Speech bubble from ${characterName}`}>
        <IconButton className="chat-close-button" icon="close" label="Dismiss speech bubble" size="small" onClick={() => window.desktopApi.dismissSpeechBubble()} />
        <p>{text}</p>
        <Button className="speech-open-chat" type="button" variant="tertiary" icon="chat" onClick={() => window.desktopApi.openChat()}>
          Chat
        </Button>
      </section>
    </main>
  )
}
