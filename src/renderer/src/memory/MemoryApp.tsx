import { IconButton } from '../ui/Button'
import { ManagementPage, StatusMessage } from '../ui/ManagementPage'
import { MemoriesSection } from './MemoriesSection'
import { MemoryControls } from './MemoryControls'
import { ProfileSection } from './ProfileSection'
import { useMemoryManagement } from './useMemoryManagement'
import './memory.css'

export function MemoryApp(): React.JSX.Element {
  const memory = useMemoryManagement()

  return (
    <ManagementPage
      title="Memory & Privacy"
      description="Review and control what your companion remembers on this device."
      className="memory-settings-shell"
      actions={import.meta.env.DEV ? (
        <IconButton
          icon="refresh"
          label="Refresh memory"
          disabled={memory.isLoading || memory.isMutating}
          onClick={() => void memory.refresh()}
        />
      ) : undefined}
    >
      {memory.error ? <StatusMessage tone="error">{memory.error}</StatusMessage> : null}
      {memory.notice ? <StatusMessage tone="success">{memory.notice}</StatusMessage> : null}

      {memory.isLoading && !memory.overview ? (
        <StatusMessage>Loading saved memory…</StatusMessage>
      ) : memory.overview ? (
        <div className="ui-section-list" aria-busy={memory.isMutating}>
          <MemoryControls
            longTermMemoryEnabled={memory.overview.settings.longTermMemoryEnabled}
            conversationMessageCount={memory.overview.conversationMessageCount}
            disabled={memory.isMutating}
            onSetEnabled={memory.setEnabled}
            onClearConversation={memory.clearConversation}
            onClearLongTermMemory={memory.clearLongTermMemory}
            onClearAllMemory={memory.clearAllMemory}
          />
          <ProfileSection
            entries={memory.overview.profile}
            totalCount={memory.overview.profileEntryCount}
            disabled={memory.isMutating}
            onUpdate={memory.updateProfile}
            onDelete={memory.deleteProfile}
          />
          <MemoriesSection
            memories={memory.overview.memories}
            totalCount={memory.overview.memoryCount}
            hasMore={memory.overview.hasMoreMemories}
            category={memory.query.category}
            search={memory.query.search}
            disabled={memory.isMutating}
            onCategoryChange={memory.setCategory}
            onSearchChange={memory.setSearch}
            onUpdate={memory.updateMemory}
            onDelete={memory.deleteMemory}
          />
        </div>
      ) : null}
    </ManagementPage>
  )
}
