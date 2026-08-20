import { useEffect, useState } from 'react'

import {
  MEMORY_CATEGORIES,
  type ManagedMemory,
  type MemoryCategoryFilter
} from '../../../shared/memory-management'
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

export function MemoriesSection({
  memories,
  totalCount,
  hasMore,
  category,
  search,
  disabled,
  onCategoryChange,
  onSearchChange,
  onUpdate,
  onDelete
}: MemoriesSectionProps): React.JSX.Element {
  return (
    <section className="memory-section" aria-labelledby="memories-heading">
      <div className="memory-section-heading">
        <div>
          <p className="memory-eyebrow">Memories</p>
          <h2 id="memories-heading">Saved moments and preferences</h2>
        </div>
        <span className="memory-count">{totalCount}</span>
      </div>
      <div className="memory-filters">
        <label>
          <span>Search</span>
          <input
            type="search"
            maxLength={200}
            placeholder="Search what your pet remembers"
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => onCategoryChange(event.currentTarget.value as MemoryCategoryFilter)}
          >
            <option value="all">All</option>
            {MEMORY_CATEGORIES.map((memoryCategory) => (
              <option key={memoryCategory} value={memoryCategory}>
                {MEMORY_CATEGORY_LABELS[memoryCategory]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {memories.length === 0 ? (
        <p className="memory-empty">No matching saved memories.</p>
      ) : (
        <div className="managed-memory-list">
          {memories.map((memory) => (
            <MemoryEntryEditor
              key={memory.id}
              memory={memory}
              disabled={disabled}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
      {hasMore ? (
        <p className="memory-limit-note">Showing the most recent matching memories.</p>
      ) : null}
    </section>
  )
}

interface MemoryEntryEditorProps {
  memory: ManagedMemory
  disabled: boolean
  onUpdate: (id: number, content: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}

function MemoryEntryEditor({
  memory,
  disabled,
  onUpdate,
  onDelete
}: MemoryEntryEditorProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(memory.content)

  useEffect(() => setContent(memory.content), [memory.content])

  const save = async (): Promise<void> => {
    const normalizedContent = content.trim()

    if (normalizedContent && (await onUpdate(memory.id, normalizedContent))) {
      setIsEditing(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (window.confirm('Delete this saved memory?')) {
      await onDelete(memory.id)
    }
  }

  return (
    <article className="managed-memory-entry">
      <div className="memory-entry-meta">
        <span>{MEMORY_CATEGORY_LABELS[memory.category]}</span>
        <span>{formatMemoryDate(memory.createdAt)}</span>
        <span>Importance {Math.round(memory.importance * 100)}%</span>
      </div>
      {isEditing ? (
        <textarea
          aria-label={`Edit ${MEMORY_CATEGORY_LABELS[memory.category]} memory`}
          maxLength={50_000}
          rows={3}
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
        />
      ) : (
        <p>{memory.content}</p>
      )}
      <div className="memory-entry-actions">
        {isEditing ? (
          <>
            <button type="button" disabled={disabled || !content.trim()} onClick={() => void save()}>
              Save
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                setContent(memory.content)
                setIsEditing(false)
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={disabled} onClick={() => setIsEditing(true)}>
              Edit
            </button>
            <button className="danger-link" type="button" disabled={disabled} onClick={() => void remove()}>
              Delete
            </button>
          </>
        )}
      </div>
    </article>
  )
}
