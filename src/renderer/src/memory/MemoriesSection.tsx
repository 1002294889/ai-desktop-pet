import { useEffect, useState } from 'react'

import { MEMORY_CATEGORIES, type ManagedMemory, type MemoryCategoryFilter } from '../../../shared/memory-management'
import { Button, IconButton } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { Badge, EmptyState, Section } from '../ui/ManagementPage'
import { formatMemoryDate, MEMORY_CATEGORY_LABELS } from './memory-labels'

interface MemoriesSectionProps {
  memories: readonly ManagedMemory[]
  totalCount: number
  hasMore: boolean
  category: MemoryCategoryFilter
  search: string
  disabled: boolean
  onCategoryChange: (category: MemoryCategoryFilter) => void
  onSearchChange: (search: string) => void
  onUpdate: (id: number, content: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}

export function MemoriesSection({ memories, totalCount, hasMore, category, search, disabled, onCategoryChange, onSearchChange, onUpdate, onDelete }: MemoriesSectionProps): React.JSX.Element {
  const hasFilters = Boolean(search.trim()) || category !== 'all'

  return (
    <Section
      eyebrow="Saved Memories"
      title="Moments & Preferences"
      description="Important details retained from past conversations."
      aside={<Badge>{totalCount}</Badge>}
    >
      <div className="memory-filters">
        <label>
          <span>Search memories</span>
          <div className="memory-search-field">
            <Icon name="search" size={16} />
            <input className="ui-input" type="search" maxLength={200} placeholder="Search saved memories" value={search} onChange={(event) => onSearchChange(event.currentTarget.value)} />
          </div>
        </label>
        <label>
          <span>Category</span>
          <select className="ui-select" value={category} onChange={(event) => onCategoryChange(event.currentTarget.value as MemoryCategoryFilter)}>
            <option value="all">All categories</option>
            {MEMORY_CATEGORIES.map((memoryCategory) => <option key={memoryCategory} value={memoryCategory}>{MEMORY_CATEGORY_LABELS[memoryCategory]}</option>)}
          </select>
        </label>
      </div>
      {memories.length === 0 ? (
        <EmptyState
          icon="memory"
          title={hasFilters ? 'No matching memories' : 'No saved memories yet'}
          description={hasFilters ? 'Try another search term or category.' : 'Meaningful details your companion remembers will appear here.'}
        />
      ) : (
        <div className="managed-memory-list">
          {memories.map((memory) => <MemoryEntryEditor key={memory.id} memory={memory} disabled={disabled} onUpdate={onUpdate} onDelete={onDelete} />)}
        </div>
      )}
      {hasMore ? <p className="memory-limit-note">Showing the most recent matching memories.</p> : null}
    </Section>
  )
}

function MemoryEntryEditor({ memory, disabled, onUpdate, onDelete }: {
  memory: ManagedMemory
  disabled: boolean
  onUpdate: (id: number, content: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [content, setContent] = useState(memory.content)

  useEffect(() => setContent(memory.content), [memory.content])

  const save = async (): Promise<void> => {
    if (content.trim() && (await onUpdate(memory.id, content.trim()))) setIsEditing(false)
  }

  const remove = async (): Promise<void> => {
    if (await onDelete(memory.id)) setIsConfirmingDelete(false)
  }

  return (
    <article className="managed-memory-entry">
      <div className="memory-entry-meta">
        <Badge tone="brand">{MEMORY_CATEGORY_LABELS[memory.category]}</Badge>
        <time dateTime={new Date(memory.createdAt).toISOString()}>{formatMemoryDate(memory.createdAt)}</time>
        {import.meta.env.DEV ? <span>Importance {Math.round(memory.importance * 100)}%</span> : null}
      </div>
      {isEditing ? (
        <textarea className="ui-textarea" autoFocus aria-label={`Edit ${MEMORY_CATEGORY_LABELS[memory.category]} memory`} maxLength={50_000} rows={3} value={content} onChange={(event) => setContent(event.currentTarget.value)} />
      ) : <p>{memory.content}</p>}
      <div className="memory-entry-actions">
        {isEditing ? (
          <>
            <Button type="button" variant="primary" disabled={disabled || !content.trim()} onClick={() => void save()}>Save</Button>
            <Button type="button" disabled={disabled} onClick={() => { setContent(memory.content); setIsEditing(false) }}>Cancel</Button>
          </>
        ) : (
          <>
            <IconButton icon="edit" label="Edit memory" size="small" disabled={disabled} onClick={() => setIsEditing(true)} />
            <IconButton icon="delete" label="Delete memory" size="small" disabled={disabled} onClick={() => setIsConfirmingDelete(true)} />
          </>
        )}
      </div>
      {isConfirmingDelete ? (
        <ConfirmDialog title="Delete this memory?" description="This saved memory will be permanently removed from your device." confirmLabel="Delete Memory" busy={disabled} onConfirm={() => void remove()} onCancel={() => setIsConfirmingDelete(false)} />
      ) : null}
    </article>
  )
}
