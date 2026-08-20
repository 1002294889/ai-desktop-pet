import { MemoriesSection } from './MemoriesSection'
import { MemoryControls } from './MemoryControls'
import { ProfileSection } from './ProfileSection'
import { useMemoryManagement } from './useMemoryManagement'
import './memory.css'

export function MemoryApp(): React.JSX.Element {
  const memory = useMemoryManagement()

  return (
    <main className="memory-settings-shell">
      <header className="memory-page-header">
        <div>
          <p className="memory-eyebrow">AI Desktop Pet</p>
          <h1>Memory &amp; Privacy</h1>
          <p>See and control what your pet remembers on this device.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={memory.isLoading || memory.isMutating}
          onClick={() => void memory.refresh()}
        >
          Refresh
        </button>
      </header>

      {memory.error ? <p className="memory-alert memory-alert-error">{memory.error}</p> : null}
      {memory.notice ? <p className="memory-alert memory-alert-success">{memory.notice}</p> : null}

      {memory.isLoading && !memory.overview ? (
        <p className="memory-loading">Loading saved memory…</p>
      ) : memory.overview ? (
        <div className="memory-section-list" aria-busy={memory.isMutating}>
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
    </main>
  )
}
