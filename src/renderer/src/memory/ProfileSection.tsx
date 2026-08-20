import { useEffect, useState } from 'react'

import type { ManagedProfileEntry } from '../../../shared/memory-management'
import { Button, IconButton } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { Badge, EmptyState, Section } from '../ui/ManagementPage'
import { getProfileLabel } from './memory-labels'

interface ProfileSectionProps {
  entries: readonly ManagedProfileEntry[]
  totalCount: number
  disabled: boolean
  onUpdate: (key: string, value: string) => Promise<boolean>
  onDelete: (key: string) => Promise<boolean>
}

export function ProfileSection({ entries, totalCount, disabled, onUpdate, onDelete }: ProfileSectionProps): React.JSX.Element {
  return (
    <Section
      eyebrow="Profile"
      title="About You"
      description="Details your companion can use to make conversations more personal."
      aside={<Badge>{totalCount}</Badge>}
    >
      {entries.length === 0 ? (
        <EmptyState icon="info" title="No profile details yet" description="Details you ask your companion to remember will appear here." />
      ) : (
        <div className="profile-list">
          {entries.map((entry) => (
            <ProfileEntryEditor key={entry.key} entry={entry} disabled={disabled} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </Section>
  )
}

function ProfileEntryEditor({ entry, disabled, onUpdate, onDelete }: {
  entry: ManagedProfileEntry
  disabled: boolean
  onUpdate: (key: string, value: string) => Promise<boolean>
  onDelete: (key: string) => Promise<boolean>
}): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [value, setValue] = useState(entry.value)
  const label = getProfileLabel(entry.key)

  useEffect(() => setValue(entry.value), [entry.value])

  const save = async (): Promise<void> => {
    if (value.trim() && (await onUpdate(entry.key, value.trim()))) setIsEditing(false)
  }

  const remove = async (): Promise<void> => {
    if (await onDelete(entry.key)) setIsConfirmingDelete(false)
  }

  return (
    <article className="profile-entry">
      <div className="profile-entry-copy">
        <h3>{label}</h3>
        {isEditing ? (
          <input className="ui-input" autoFocus aria-label={`Edit ${label}`} maxLength={20_000} value={value} onChange={(event) => setValue(event.currentTarget.value)} />
        ) : <p>{entry.value}</p>}
      </div>
      <div className="memory-entry-actions">
        {isEditing ? (
          <>
            <Button type="button" variant="primary" disabled={disabled || !value.trim()} onClick={() => void save()}>Save</Button>
            <Button type="button" disabled={disabled} onClick={() => { setValue(entry.value); setIsEditing(false) }}>Cancel</Button>
          </>
        ) : (
          <>
            <IconButton icon="edit" label={`Edit ${label}`} size="small" disabled={disabled} onClick={() => setIsEditing(true)} />
            <IconButton icon="delete" label={`Delete ${label}`} size="small" disabled={disabled} onClick={() => setIsConfirmingDelete(true)} />
          </>
        )}
      </div>
      {isConfirmingDelete ? (
        <ConfirmDialog title={`Delete ${label}?`} description="This profile detail will be permanently removed from your local memory." confirmLabel="Delete Detail" busy={disabled} onConfirm={() => void remove()} onCancel={() => setIsConfirmingDelete(false)} />
      ) : null}
    </article>
  )
}
