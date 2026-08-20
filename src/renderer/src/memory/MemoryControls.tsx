import { useState } from 'react'

interface MemoryControlsProps {
  longTermMemoryEnabled: boolean
  conversationMessageCount: number
  disabled: boolean
  onSetEnabled: (enabled: boolean) => Promise<boolean>
  onClearConversation: () => Promise<boolean>
  onClearLongTermMemory: () => Promise<boolean>
  onClearAllMemory: () => Promise<boolean>
}

export function MemoryControls({
  longTermMemoryEnabled,
  conversationMessageCount,
  disabled,
  onSetEnabled,
  onClearConversation,
  onClearLongTermMemory,
  onClearAllMemory
}: MemoryControlsProps): React.JSX.Element {
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false)

  const clearConversation = async (): Promise<void> => {
    if (
      window.confirm(
        'Clear conversation history? Your saved profile and long-term memories will remain.'
      )
    ) {
      await onClearConversation()
    }
  }

  const clearLongTermMemory = async (): Promise<void> => {
    if (
      window.confirm(
        'Clear all profile information and saved long-term memories? Conversation history will remain.'
      )
    ) {
      await onClearLongTermMemory()
    }
  }

  const confirmClearAll = async (): Promise<void> => {
    if (await onClearAllMemory()) {
      setIsConfirmingClearAll(false)
    }
  }

  return (
    <>
      <section className="memory-section" aria-labelledby="settings-heading">
        <div className="memory-section-heading">
          <div>
            <p className="memory-eyebrow">Memory settings</p>
            <h2 id="settings-heading">Long-term memory</h2>
          </div>
          <label className="memory-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={longTermMemoryEnabled}
              disabled={disabled}
              onChange={(event) => void onSetEnabled(event.currentTarget.checked)}
            />
            <span aria-hidden="true" />
            <strong>{longTermMemoryEnabled ? 'On' : 'Off'}</strong>
          </label>
        </div>
        <p className="memory-explanation">
          {longTermMemoryEnabled
            ? 'Your pet may save useful details and use relevant saved memories in future conversations.'
            : 'New details are not saved and existing memories are not used in AI replies. Existing data stays on this device until you delete it. Explicit remember requests are not stored while this is off.'}
        </p>
      </section>

      <section className="memory-section" aria-labelledby="conversation-heading">
        <div className="memory-section-heading">
          <div>
            <p className="memory-eyebrow">Conversation</p>
            <h2 id="conversation-heading">Conversation history</h2>
          </div>
          <span className="memory-count">{conversationMessageCount}</span>
        </div>
        <p className="memory-explanation">
          Conversation history is stored separately from profile information and long-term memories.
        </p>
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || conversationMessageCount === 0}
          onClick={() => void clearConversation()}
        >
          Clear conversation history
        </button>
      </section>

      <section className="memory-section danger-zone" aria-labelledby="clear-heading">
        <div className="memory-section-heading">
          <div>
            <p className="memory-eyebrow">Privacy controls</p>
            <h2 id="clear-heading">Clear saved data</h2>
          </div>
        </div>
        <div className="clear-control-list">
          <div>
            <div>
              <strong>Clear long-term memories</strong>
              <p>Deletes profile information and saved memories, but keeps conversation history.</p>
            </div>
            <button className="danger-button" type="button" disabled={disabled} onClick={() => void clearLongTermMemory()}>
              Clear long-term
            </button>
          </div>
          <div>
            <div>
              <strong>Clear all memory</strong>
              <p>Deletes profile information, saved memories, and conversation history.</p>
            </div>
            {isConfirmingClearAll ? (
              <div className="clear-all-confirmation" role="group" aria-label="Confirm clear all memory">
                <button className="danger-button" type="button" disabled={disabled} onClick={() => void confirmClearAll()}>
                  Confirm clear all
                </button>
                <button className="secondary-button" type="button" disabled={disabled} onClick={() => setIsConfirmingClearAll(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="danger-button" type="button" disabled={disabled} onClick={() => setIsConfirmingClearAll(true)}>
                Clear all…
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
