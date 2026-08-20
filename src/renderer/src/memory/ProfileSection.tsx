import { useEffect, useState } from 'react'

import type { ManagedProfileEntry } from '../../../shared/memory-management'
import { getProfileLabel } from './memory-labels'

interface ProfileSectionProps {
  entries: readonly ManagedProfileEntry[]
  totalCount: number
  disabled: boolean
  onUpdate: (key: string, value: string) => Promise<boolean>
  onDelete: (key: string) => Promise<boolean>
}

export function ProfileSection({
  entries,
  totalCount,
  disabled,
  onUpdate,
  onDelete
}: ProfileSectionProps): React.JSX.Element {
  return (
    <section className="memory-section" aria-labelledby="profile-heading">
      <div className="memory-section-heading">
        <div>
          <p className="memory-eyebrow">Profile</p>
          <h2 id="profile-heading">What your pet knows about you</h2>
        </div>
        <span className="memory-count">{totalCount}</span>
      </div>
      {entries.length === 0 ? (
        <p className="memory-empty">No matching profile information is saved.</p>
      ) : (
        <div className="profile-list">
          {entries.map((entry) => (
            <ProfileEntryEditor
              key={entry.key}
              entry={entry}
              disabled={disabled}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface ProfileEntryEditorProps {
  entry: ManagedProfileEntry
  disabled: boolean
  onUpdate: (key: string, value: string) => Promise<boolean>
  onDelete: (key: string) => Promise<boolean>
}

function ProfileEntryEditor({
  entry,
  disabled,
  onUpdate,
  onDelete
}: ProfileEntryEditorProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(entry.value)

  useEffect(() => setValue(entry.value), [entry.value])

  const save = async (): Promise<void> => {
    const normalizedValue = value.trim()

    if (!normalizedValue) {
      return
    }

    if (await onUpdate(entry.key, normalizedValue)) {
      setIsEditing(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (window.confirm(`Delete ${getProfileLabel(entry.key)} from saved profile information?`)) {
      await onDelete(entry.key)
    }
  }

  return (
    <article className="profile-entry">
      <div className="profile-entry-copy">
        <h3>{getProfileLabel(entry.key)}</h3>
        {isEditing ? (
          <input
            aria-label={`Edit ${getProfileLabel(entry.key)}`}
            maxLength={20_000}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
          />
        ) : (
          <p>{entry.value}</p>
        )}
      </div>
      <div className="memory-entry-actions">
        {isEditing ? (
          <>
            <button type="button" disabled={disabled || !value.trim()} onClick={() => void save()}>
              Save
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                setValue(entry.value)
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
