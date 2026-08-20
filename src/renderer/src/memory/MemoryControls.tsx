import { useState } from 'react'

import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { Badge, Section } from '../ui/ManagementPage'
import { Switch } from '../ui/Switch'

interface MemoryControlsProps {
  longTermMemoryEnabled: boolean
  conversationMessageCount: number
  disabled: boolean
  onSetEnabled: (enabled: boolean) => Promise<boolean>
  onClearConversation: () => Promise<boolean>
  onClearLongTermMemory: () => Promise<boolean>
  onClearAllMemory: () => Promise<boolean>
}

type ClearOperation = 'conversation' | 'long-term' | 'all'

const CONFIRMATIONS: Record<ClearOperation, { title: string; description: string; label: string }> = {
  conversation: {
    title: 'Clear conversation history?',
    description: 'Recent chat messages will be permanently deleted. Your profile and saved long-term memories will remain.',
    label: 'Clear Conversation'
  },
  'long-term': {
    title: 'Clear long-term memory?',
    description: 'Profile information and saved memories will be permanently deleted. Conversation history will remain.',
    label: 'Clear Long-term Memory'
  },
  all: {
    title: 'Clear all memory?',
    description: 'Profile information, saved memories, conversation history, and relationship progress will be permanently deleted. This cannot be undone.',
    label: 'Clear All Memory'
  }
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
  const [pendingClear, setPendingClear] = useState<ClearOperation>()

  const confirmClear = async (): Promise<void> => {
    if (!pendingClear) return

    const succeeded = pendingClear === 'conversation'
      ? await onClearConversation()
      : pendingClear === 'long-term'
        ? await onClearLongTermMemory()
        : await onClearAllMemory()

    if (succeeded) setPendingClear(undefined)
  }

  return (
    <>
      <Section
        eyebrow="Memory Settings"
        title="Long-term Memory"
        description="Useful details stay private on this device and can personalize future conversations."
        aside={<Badge tone={longTermMemoryEnabled ? 'success' : 'neutral'}>{longTermMemoryEnabled ? 'On' : 'Off'}</Badge>}
      >
        <Switch
          label="Remember useful details"
          description={longTermMemoryEnabled ? 'Relevant saved memories may be used in future replies.' : 'Existing memories are kept but are not used or updated.'}
          checked={longTermMemoryEnabled}
          disabled={disabled}
          onChange={(enabled) => void onSetEnabled(enabled)}
        />
      </Section>

      <Section
        eyebrow="Conversation"
        title="Conversation History"
        description="Recent messages are stored separately from your profile and saved memories."
        aside={<Badge>{conversationMessageCount} message{conversationMessageCount === 1 ? '' : 's'}</Badge>}
      >
        <Button
          type="button"
          variant="tertiary"
          disabled={disabled || conversationMessageCount === 0}
          onClick={() => setPendingClear('conversation')}
        >
          Clear Conversation History
        </Button>
      </Section>

      <Section
        eyebrow="Privacy & Data Controls"
        title="Clear Saved Data"
        description="Choose exactly which local data to remove."
        tone="danger"
      >
        <div className="memory-clear-row">
          <span className="ui-setting-copy">
            <strong>Long-term Memory</strong>
            <small>Delete profile information and saved memories only.</small>
          </span>
          <Button type="button" variant="tertiary" disabled={disabled} onClick={() => setPendingClear('long-term')}>
            Clear…
          </Button>
        </div>
        <div className="memory-clear-row">
          <span className="ui-setting-copy">
            <strong>All Memory</strong>
            <small>Delete every saved conversation, memory, profile detail, and relationship record.</small>
          </span>
          <Button type="button" variant="destructive" disabled={disabled} onClick={() => setPendingClear('all')}>
            Clear All…
          </Button>
        </div>
      </Section>

      {pendingClear ? (
        <ConfirmDialog
          title={CONFIRMATIONS[pendingClear].title}
          description={CONFIRMATIONS[pendingClear].description}
          confirmLabel={CONFIRMATIONS[pendingClear].label}
          busy={disabled}
          onConfirm={() => void confirmClear()}
          onCancel={() => setPendingClear(undefined)}
        />
      ) : null}
    </>
  )
}
